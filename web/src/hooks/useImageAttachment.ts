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
  const attachClipboardImage = useCallback(
    async (file: File) => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const bytes = new Uint8Array(await file.arrayBuffer());
        // Uint8Array уезжает сырым телом запроса: скриншот на несколько мегабайт в виде
        // JSON-массива чисел сериализуется дольше, чем пишется на диск.
        const path = await invoke<string>("save_clipboard_image", bytes);
        insertPath(path);
      } catch (err) {
        toast(`Could not save pasted image: ${describe(err)}`, "error");
      }
    },
    [insertPath],
  );

  return { pickImage, attachClipboardImage };
}
