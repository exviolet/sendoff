import type { Tab } from "../store/editorStore";

const AUTO_TITLE_MAX_LENGTH = 48;
const UNTITLED_RE = /^Untitled \d+$/;

export function makeTab(n: number): Tab {
  return {
    id: crypto.randomUUID(),
    title: `Untitled ${n}`,
    content: "",
    isDirty: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    titleSource: "auto",
  };
}

function firstContentLine(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .find(Boolean) ?? "";
}

export function makeAutoTitle(content: string, fallback: string) {
  const line = firstContentLine(content);
  if (!line) return fallback;
  return line.length > AUTO_TITLE_MAX_LENGTH
    ? `${line.slice(0, AUTO_TITLE_MAX_LENGTH - 3)}...`
    : line;
}

export function normalizeTab(tab: Tab): Tab {
  const titleSource = tab.titleSource ?? (UNTITLED_RE.test(tab.title) ? "auto" : "manual");
  const title = titleSource === "auto"
    ? makeAutoTitle(tab.content, tab.title)
    : tab.title;
  return { ...tab, title, titleSource };
}

// Pinned tabs always sort ahead of unpinned, preserving relative order within each group.
export function partitionPinned(tabs: Tab[]): Tab[] {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

export function isAutoTitled(tab: Tab) {
  return tab.titleSource === "auto" || (tab.titleSource === undefined && UNTITLED_RE.test(tab.title));
}

export function canCleanupTab(tab: Tab) {
  return tab.content.trim() === "" && !tab.isDirty && !tab.pinned && isAutoTitled(tab);
}
