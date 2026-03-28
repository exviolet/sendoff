import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";
import { usePromptTemplatesStore } from "../store/promptTemplatesStore";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";

export function useFileIO() {
  function saveCurrentTab() {
    const { activeTabId, markSaved } = useEditorStore.getState();
    if (activeTabId) markSaved(activeTabId);
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
          toast(`Сохранено: ${baseName}${ext}`, "success");
        }
      } catch (err) {
        console.error("[Tauri] Failed to save file:", err);
        toast("Ошибка сохранения файла", "error");
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
    toast(`Сохранено: ${baseName}${ext}`, "success");
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
        toast(`Открыт: ${fileName}`, "success");
      } catch (err) {
        console.error("[Tauri] Failed to read file:", err);
        toast("Ошибка чтения файла", "error");
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
        toast(`Открыт: ${file.name}`, "success");
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function exportAll() {
    const { tabs } = useEditorStore.getState();
    const { presets } = usePresetsStore.getState();
    const { templates: promptTemplates } = usePromptTemplatesStore.getState();
    const data = JSON.stringify({ tabs, presets, promptTemplates }, null, 2);

    if (isTauri) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          filters: [{ name: "JSON", extensions: ["json"] }],
          defaultPath: "rewritebox-backup.json",
        });
        if (path) {
          await writeTextFile(path, data);
          toast("Бэкап экспортирован", "success");
        }
      } catch (err) {
        console.error("[Tauri] Failed to export:", err);
        toast("Ошибка экспорта", "error");
      }
      return;
    }

    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rewritebox-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Бэкап экспортирован", "success");
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
        toast("Бэкап импортирован", "success");
      } catch (err) {
        console.error("[Tauri] Failed to import backup:", err);
        toast("Ошибка импорта бэкапа", "error");
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
          toast("Бэкап импортирован", "success");
        } catch {
          toast("Неверный формат файла", "error");
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
    useEditorStore.getState().hydrate(
      data.tabs,
      data.tabs[0].id,
      data.tabs.length
    );
  }
  if (Array.isArray(data.presets) && data.presets.length > 0) {
    usePresetsStore.getState().hydrate(data.presets);
  }
  if (Array.isArray(data.promptTemplates) && data.promptTemplates.length > 0) {
    usePromptTemplatesStore.getState().hydrate(data.promptTemplates);
  }
}
