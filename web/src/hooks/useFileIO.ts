import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";

export function useFileIO() {
  function saveCurrentTab() {
    const { activeTabId, markSaved } = useEditorStore.getState();
    if (activeTabId) markSaved(activeTabId);
  }

  function downloadCurrentTab() {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const blob = new Blob([tab.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openFile() {
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

  function exportAll() {
    const { tabs } = useEditorStore.getState();
    const { presets } = usePresetsStore.getState();
    const data = JSON.stringify({ tabs, presets }, null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rewritebox-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBackup() {
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
