import { useCallback, type RefObject } from "react";
import { isTauri } from "../lib/platform";
import { IMAGE_EXTENSIONS, insertAttachmentPath } from "../lib/attachments";
import { useEditorStore } from "../store/editorStore";
import { toast } from "../store/toastStore";

// Оба канала сходятся здесь и дальше неразличимы: диалог отдаёт путь уже существующего
// файла, буфер обмена — путь только что записанного. Сборка промпта об источнике не знает.

/// Отказ из Tauri приходит СТРОКОЙ, а не Error: ошибка родом из Rust, и в Error её никто
/// не оборачивает (та же ловушка, что съела причину сбоя herdr у 2-го пользователя).
function describe(err: unknown): string {
  if (typeof err === "string") return err;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Картинка из системного буфера — через асинхронный Clipboard API, а НЕ из события
 * вставки.
 *
 * Замерено 2026-08-13 на живом WebKitGTK: при скриншоте в буфере (`wl-paste
 * --list-types` показывает ровно `image/png`) событие `paste` не несёт картинку
 * НИКАК — ни в `clipboardData.files`, ни в `clipboardData.items`. Проверялись все
 * три пути сразу, сработал только этот. То есть привычный по Chrome/Firefox код
 * «взять файл из DataTransfer» здесь молча ничего не делает — ровно так эта фича
 * и не работала в первой версии.
 *
 * Зовётся ВНУТРИ обработчика вставки намеренно: это жест пользователя, без него
 * чтение буфера не разрешается.
 */
async function imageFromClipboard(): Promise<Blob | null> {
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) return await item.getType(type);
  }
  return null;
}

export function useImageAttachment(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  // Вставка идёт через updateContent по живому значению textarea — тем же путём, что
  // фразы-триггеры. Патч из markdownEdit тут не годится: команда палитры живёт вне
  // редактора, а applyPatch — внутри него.
  const insertPath = useCallback(
    (path: string) => {
      const { activeTabId, tabs, updateContent } = useEditorStore.getState();
      if (!activeTabId) return;
      const ta = textareaRef.current;
      const value = ta ? ta.value : (tabs.find((t) => t.id === activeTabId)?.content ?? "");
      const from = ta ? ta.selectionStart : value.length;
      const to = ta ? ta.selectionEnd : value.length;

      const { content, caret } = insertAttachmentPath(value, from, to, path);
      updateContent(activeTabId, content);

      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [textareaRef],
  );

  /// Канал A. Файл уже лежит на диске — берём только путь, ничего не читая и не копируя.
  const pickImage = useCallback(async () => {
    if (!isTauri) {
      toast("Image paths are available in the desktop app", "info");
      return;
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: [...IMAGE_EXTENSIONS] }],
      });
      if (!path) return;
      insertPath(path as string);
    } catch (err) {
      toast(`Could not insert image path: ${describe(err)}`, "error");
    }
  }, [insertPath]);

  /// Канал B. Файла нет — только байты в буфере. Записывает их Rust: путь назначения
  /// вебвью не задаёт, расширение выводится из сигнатуры уже там.
  const attachClipboardImage = useCallback(async () => {
    try {
      const blob = await imageFromClipboard();
      if (!blob) {
        toast("No image in clipboard", "info");
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // Uint8Array уезжает сырым телом запроса: скриншот на несколько мегабайт в виде
      // JSON-массива чисел сериализуется дольше, чем пишется на диск.
      const path = await invoke<string>("save_clipboard_image", bytes);
      insertPath(path);
    } catch (err) {
      toast(`Could not save pasted image: ${describe(err)}`, "error");
    }
  }, [insertPath]);

  return { pickImage, attachClipboardImage };
}
