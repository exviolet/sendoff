import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";
import { useTriggerPhrasesStore } from "../store/triggerPhrasesStore";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";
import { flushSession } from "./useSessionPersistence";

export function useFileIO() {
  // Ctrl+S больше не «сохраняет»: запись в IndexedDB идёт сама, дебаунс 500 мс.
  // Раньше он только гасил флаг isDirty (файл не писал никогда, хотя команда палитры
  // называлась «Сохранить как .txt» — .txt пишет downloadCurrentTab). Оставлен как
  // честный flush: дожать отложенную запись немедленно.
  async function saveCurrentTab() {
    await flushSession();
    toast("Written", "success");
  }

  async function downloadCurrentTab(format: "txt" | "md" = "txt") {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const baseName = tab.title.replace(/\.(txt|md|markdown|text)$/i, "");
    const ext = format === "md" ? ".md" : ".txt";

    if (isTauri) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          filters: [{ name: "Text", extensions: [format === "md" ? "md" : "txt"] }],
          defaultPath: `${baseName}${ext}`,
        });
        if (path) {
          await writeTextFile(path, tab.content);
          toast(`Saved: ${baseName}${ext}`, "success");
        }
      } catch (err) {
        console.error("[Tauri] Failed to save file:", err);
        toast("Failed to save file", "error");
      }
      return;
    }

    const mimeType = format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
    const blob = new Blob([tab.content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Saved: ${baseName}${ext}`, "success");
  }

  async function openFile() {
    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await open({
          filters: [{ name: "Text", extensions: ["txt", "md", "markdown", "text"] }],
        });
        if (!path) return;
        const content = await readTextFile(path as string);
        const fileName = (path as string).split(/[\\/]/).pop() ?? "Untitled";
        useEditorStore.getState().addTabFromFile(fileName, content);
        toast(`Opened: ${fileName}`, "success");
      } catch (err) {
        console.error("[Tauri] Failed to read file:", err);
        toast("Failed to read file", "error");
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md,.markdown,.text";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        useEditorStore.getState().addTabFromFile(file.name, content);
        toast(`Opened: ${file.name}`, "success");
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function exportAll() {
    const { tabs, workspaces, tabGroups } = useEditorStore.getState();
    const { presets } = usePresetsStore.getState();
    const { phrases: triggerPhrases } = useTriggerPhrasesStore.getState();
    // workspaces и tabGroups обязаны ехать вместе с табами — иначе восстановление молча
    // схлопнет всю группировку (в один «Default» и в «вне групп» соответственно).
    const data = JSON.stringify({ tabs, workspaces, tabGroups, presets, triggerPhrases }, null, 2);

    if (isTauri) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          filters: [{ name: "JSON", extensions: ["json"] }],
          defaultPath: "rewrite-backup.json",
        });
        if (path) {
          await writeTextFile(path, data);
          toast("Backup exported", "success");
        }
      } catch (err) {
        console.error("[Tauri] Failed to export:", err);
        toast("Export failed", "error");
      }
      return;
    }

    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rewrite-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exported", "success");
  }

  async function importBackup() {
    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await open({
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!path) return;
        const raw = await readTextFile(path as string);
        const data = JSON.parse(raw);
        hydrateFromBackup(data);
        toast("Backup imported", "success");
      } catch (err) {
        console.error("[Tauri] Failed to import backup:", err);
        toast("Backup import failed", "error");
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          hydrateFromBackup(data);
          toast("Backup imported", "success");
        } catch {
          toast("Invalid file format", "error");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return { saveCurrentTab, downloadCurrentTab, openFile, exportAll, importBackup };
}

function hydrateFromBackup(data: Record<string, unknown>) {
  if (Array.isArray(data.tabs) && data.tabs.length > 0) {
    // Старый бэкап (без workspaces / без tabGroups) → hydrate сам создаст «Default»,
    // а табы без живой группы окажутся вне групп. Оба случая штатные, не повреждение.
    const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
    const tabGroups = Array.isArray(data.tabGroups) ? data.tabGroups : [];
    useEditorStore.getState().hydrate(
      data.tabs,
      data.tabs[0].id,
      data.tabs.length,
      workspaces,
      null,
      tabGroups,
      // Архив закрытых в бэкап не кладём и из бэкапа не восстанавливаем: бэкап — это
      // рабочее состояние, а не корзина. Импорт её просто очищает.
      [],
    );
  }
  if (Array.isArray(data.presets) && data.presets.length > 0) {
    usePresetsStore.getState().hydrate(data.presets);
  }
  if (Array.isArray(data.triggerPhrases) && data.triggerPhrases.length > 0) {
    useTriggerPhrasesStore.getState().hydrate(data.triggerPhrases);
  }
}
