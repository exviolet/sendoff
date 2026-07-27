import { useCallback, useMemo, useState } from "react";
import { useEditorStore, TAB_GROUP_COLORS, type TabGroup, type TabGroupColor } from "../../store/editorStore";
import { groupsOf } from "../../lib/tabUtils";
import { usePickerModal } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader, PickerHint } from "../PickerModal/PickerModal";

interface TabGroupPickerProps {
  onClose: () => void;
  // Таб, который кладём в группу. Группа всегда принадлежит его workspace.
  tabId: string;
}

// Цвет новой группы берём по кругу от числа уже существующих: две подряд созданные
// группы не окажутся одного цвета, а выбирать его вручную на этом шаге — лишний клик
// в горячем пути (переименование и смена цвета есть в контекст-меню).
function nextColor(count: number): TabGroupColor {
  return TAB_GROUP_COLORS[count % TAB_GROUP_COLORS.length];
}

export function TabGroupPicker({ onClose, tabId }: TabGroupPickerProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const allGroups = useEditorStore((s) => s.tabGroups);
  const createTabGroup = useEditorStore((s) => s.createTabGroup);
  const assignTabToGroup = useEditorStore((s) => s.assignTabToGroup);

  const tab = tabs.find((t) => t.id === tabId);
  const groups = useMemo(
    () => (tab ? groupsOf(allGroups, tab.workspaceId) : []),
    [allGroups, tab],
  );

  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tabs) if (t.groupId) map.set(t.groupId, (map.get(t.groupId) ?? 0) + 1);
    return map;
  }, [tabs]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(needle));
  }, [groups, query]);

  // Строка «убрать из группы» появляется, только если таб в группе — иначе она
  // ничего не делает и лишь путает.
  const canUngroup = Boolean(tab?.groupId);
  const trimmed = query.trim();
  const canCreate = trimmed.length > 0 && !groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase());

  const ungroupIndex = canUngroup ? rows.length : -1;
  const createIndex = canCreate ? rows.length + (canUngroup ? 1 : 0) : -1;
  const total = rows.length + (canUngroup ? 1 : 0) + (canCreate ? 1 : 0);

  const pick = useCallback(
    (index: number) => {
      if (index === createIndex) {
        createTabGroup(trimmed, nextColor(allGroups.length), tabId);
        onClose();
        return;
      }
      if (index === ungroupIndex) {
        assignTabToGroup(tabId, null);
        onClose();
        return;
      }
      const row: TabGroup | undefined = rows[index];
      if (!row) return;
      assignTabToGroup(tabId, row.id);
      onClose();
    },
    [createIndex, ungroupIndex, createTabGroup, assignTabToGroup, trimmed, allGroups.length, tabId, onClose, rows],
  );

  // Стартуем на текущей группе таба, если она есть.
  const initialIndex = Math.max(0, groups.findIndex((g) => g.id === tab?.groupId));

  const { selectedIndex, setSelectedIndex, inputRef, listRef } = usePickerModal({
    count: total,
    onEnter: pick,
    onClose,
    initialIndex,
  });

  return (
    <PickerModal
      onClose={onClose}
      width="min(94vw, 560px)"
      footer={
        <PickerHint>
          <span>↑↓ навигация</span>
          <span>↵ в группу</span>
          <span>Esc закрыть</span>
        </PickerHint>
      }
    >
      <PickerHeader
        inputRef={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setSelectedIndex(0);
        }}
        placeholder="Положить таб в группу или создать..."
        prefix={<span className="text-[11px] font-mono text-accent shrink-0">группа</span>}
        suffix={<span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">{rows.length}</span>}
      />

      <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
        {rows.length === 0 && !canCreate && !canUngroup && (
          <div className="px-4 py-10 text-center text-xs text-text-muted/60">
            {query.trim() ? "Ничего не найдено" : "В этом workspace ещё нет групп"}
          </div>
        )}

        {rows.map((row, index) => {
          const selected = index === selectedIndex;
          const isCurrent = row.id === tab?.groupId;
          return (
            <button
              key={row.id}
              data-picker-index={index}
              onClick={() => pick(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`
                w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-left transition-colors duration-75
                ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
              `}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: `var(--color-group-${row.color})` }}
              />
              <span className="min-w-0 flex items-center gap-2">
                <span className="truncate text-[12px] text-text">{row.name}</span>
                {isCurrent && <span className="shrink-0 text-[9px] text-accent">текущая</span>}
                {row.collapsed && <span className="shrink-0 text-[9px] text-text-muted/60">свёрнута</span>}
              </span>
              <span className="text-[10px] text-text-muted/45 tabular-nums">{counts.get(row.id) ?? 0}</span>
            </button>
          );
        })}

        {canUngroup && (
          <button
            data-picker-index={ungroupIndex}
            onClick={() => pick(ungroupIndex)}
            onMouseEnter={() => setSelectedIndex(ungroupIndex)}
            className={`
              w-full flex items-center gap-3 px-4 py-2 text-left border-t border-border/40 transition-colors duration-75
              ${selectedIndex === ungroupIndex ? "bg-accent/10" : "hover:bg-surface-hover/50"}
            `}
          >
            <span className="text-text-muted text-[13px] leading-none">−</span>
            <span className="truncate text-[12px] text-text">Убрать из группы</span>
          </button>
        )}

        {canCreate && (
          <button
            data-picker-index={createIndex}
            onClick={() => pick(createIndex)}
            onMouseEnter={() => setSelectedIndex(createIndex)}
            className={`
              w-full flex items-center gap-3 px-4 py-2 text-left border-t border-border/40 transition-colors duration-75
              ${selectedIndex === createIndex ? "bg-accent/10" : "hover:bg-surface-hover/50"}
            `}
          >
            <span className="text-accent text-[13px] leading-none">+</span>
            <span className="truncate text-[12px] text-text">Новая группа «{trimmed}»</span>
          </button>
        )}
      </div>
    </PickerModal>
  );
}
