import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";
import { usePromptTemplatesStore } from "../store/promptTemplatesStore";
import { isTauri } from "../lib/platform";

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
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        filters: [{ name: "Text", extensions: [format === "md" ? "md" : "txt"] }],
        defaultPath: `${baseName}${ext}`,
      });
      if (path) await writeTextFile(path, tab.content);
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
  }

  async function openFile() {
    if (isTauri) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({
        filters: [{ name: "Text", extensions: ["txt", "md", "markdown", "text"] }],
      });
      if (!path) return;
      const content = await readTextFile(path);
      const fileName = path.split(/[\\/]/).pop() ?? "Untitled";
      useEditorStore.getState().addTabFromFile(fileName, content);
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
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "rewritebox-backup.json",
      });
      if (path) await writeTextFile(path, data);
      return;
    }

    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rewritebox-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup() {
    if (isTauri) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      try {
        const raw = await readTextFile(path);
        const data = JSON.parse(raw);
        hydrateFromBackup(data);
      } catch {
        // invalid JSON — ignore
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
        } catch {
          // invalid JSON — ignore
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
