import type { Tab, TabGroup } from "../store/editorStore";

const AUTO_TITLE_MAX_LENGTH = 48;
const UNTITLED_RE = /^Untitled \d+$/;

export function makeTab(n: number, workspaceId: string): Tab {
  return {
    id: crypto.randomUUID(),
    title: `Untitled ${n}`,
    content: "",
    isDirty: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    titleSource: "auto",
    workspaceId,
  };
}

// Табы активного workspace. Порядок сохраняется, поэтому глобальной partitionPinned
// достаточно: внутри каждого workspace pinned остаются левее обычных.
export function tabsOf(tabs: Tab[], workspaceId: string): Tab[] {
  return tabs.filter((t) => t.workspaceId === workspaceId);
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

// Табы одной группы — непрерывным run'ом. Позиция run'а задаётся ПЕРВЫМ табом группы,
// порядок внутри run'а сохраняется, остальные табы не сдвигаются друг относительно друга.
// Непрерывность — инвариант, а не соглашение: без неё группа разъезжается при первом же
// reorder, и собрать её обратно руками пользователь не сможет (tasks/14, решение 2).
//
// Закреплённые табы не втягиваются в run: пин и группа взаимоисключимы, а partitionPinned
// держит пины слева. Если `pinned` и `groupId` всё же встретились вместе (порченые данные),
// таб остаётся на месте как обычный — молча его не перекладываем.
export function partitionGroups(tabs: Tab[]): Tab[] {
  const placed = new Set<string>();
  const result: Tab[] = [];

  for (const tab of tabs) {
    if (!tab.groupId || tab.pinned) {
      result.push(tab);
      continue;
    }
    if (placed.has(tab.groupId)) continue; // уже уехал вместе со своим run'ом
    placed.add(tab.groupId);
    result.push(...tabs.filter((t) => t.groupId === tab.groupId && !t.pinned));
  }

  return result;
}

// Порядок в полосе = пины слева, затем непрерывные run'ы групп. Одна точка вызова на оба
// инварианта: разъедутся, если где-то вызвать только partitionPinned.
export function arrangeTabs(tabs: Tab[]): Tab[] {
  return partitionGroups(partitionPinned(tabs));
}

// Табы, реально видимые в полосе: члены свёрнутых групп скрыты. Свёрнутость — ТОЛЬКО
// видимость: сами табы живы, ищутся через Ctrl+T / Ctrl+Shift+D и персистятся.
export function visibleTabsOf(tabs: Tab[], groups: TabGroup[], workspaceId: string): Tab[] {
  const collapsed = new Set(groups.filter((g) => g.collapsed).map((g) => g.id));
  return tabsOf(tabs, workspaceId).filter((t) => !t.groupId || !collapsed.has(t.groupId));
}

// Шаг таба на одну ВИДИМУЮ позицию влево/вправо. Возвращает новый порядок или null,
// если двигать некуда. Своя арифметика, а не reorderTab: тот вставляет таб на индекс цели,
// то есть шаг вправо на соседа схлопывается в no-op.
//
// Членство определяется соседом, рядом с которым таб приземлился — тот же принцип, что
// у drop'а. Следствия: шаг внутрь развёрнутого run'а вводит в группу, шаг за последнего
// её члена выводит, а свёрнутую группу таб перепрыгивает целиком (её члены не видимы,
// соседом окажется таб за run'ом) — провалиться в неё и исчезнуть из полосы нельзя.
export function stepTab(
  tabs: Tab[],
  groups: TabGroup[],
  id: string,
  dir: -1 | 1
): Tab[] | null {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return null;

  const visible = visibleTabsOf(tabs, groups, tab.workspaceId);
  const i = visible.findIndex((t) => t.id === id);
  if (i < 0) return null; // таб спрятан в свёрнутой группе — двигать нечего

  const neighbor = visible[i + dir];
  if (!neighbor) return null;
  // Через границу закреплённых шаг не переносит: пин — отдельный жест, а partitionPinned
  // всё равно вернул бы таб обратно, и клавиша выглядела бы сломанной.
  if (!!neighbor.pinned !== !!tab.pinned) return null;

  const next = tabs.filter((t) => t.id !== id);
  const at = next.findIndex((t) => t.id === neighbor.id);
  next.splice(dir < 0 ? at : at + 1, 0, tab.pinned ? tab : { ...tab, groupId: neighbor.groupId });
  return next;
}

// Группы активного workspace, в порядке появления их первого таба в полосе.
export function groupsOf(groups: TabGroup[], workspaceId: string): TabGroup[] {
  return groups.filter((g) => g.workspaceId === workspaceId);
}

// Группа без единого таба бесполезна: пустой чип в полосе не на что нажать и нечем
// наполнить. Чистим сразу после любой операции, уносящей табы (закрытие, ungroup, переезд).
export function pruneGroups(tabs: Tab[], groups: TabGroup[]): TabGroup[] {
  const alive = new Set(tabs.map((t) => t.groupId).filter(Boolean) as string[]);
  return groups.filter((g) => alive.has(g.id));
}

export function isAutoTitled(tab: Tab) {
  return tab.titleSource === "auto" || (tab.titleSource === undefined && UNTITLED_RE.test(tab.title));
}

export function canCleanupTab(tab: Tab) {
  return tab.content.trim() === "" && !tab.isDirty && !tab.pinned && isAutoTitled(tab);
}
