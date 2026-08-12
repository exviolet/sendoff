import { useEffect, useRef } from "react";
import type { SlashItem } from "../../lib/slashMenu";
import type { CaretPoint } from "./caretCoords";

interface SlashMenuProps {
  items: readonly SlashItem[];
  index: number;
  point: CaretPoint;
  // Размеры видимой области редактора — по ним меню переворачивается и прижимается.
  bounds: { width: number; height: number };
  onPick: (item: SlashItem) => void;
  onHover: (index: number) => void;
}

const MENU_WIDTH = 260;
const MENU_MAX_HEIGHT = 232;

// Инлайн-попап у каретки. Сознательно НЕ на PickerModal: тот примитив модальный (overlay,
// backdrop, свой инпут), а здесь запрос набирается в самом редакторе.
export function SlashMenu({ items, index, point, bounds, onPick, onHover }: SlashMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = listRef.current?.querySelector(`[data-slash-index="${index}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const below = point.top + point.lineHeight;
  // Снизу не помещается — переворачиваем над строкой, а не позволяем вылезти за редактор.
  const flip = below + MENU_MAX_HEIGHT > bounds.height && point.top > MENU_MAX_HEIGHT;
  const top = flip ? point.top - MENU_MAX_HEIGHT : below;
  const left = Math.max(0, Math.min(point.left, bounds.width - MENU_WIDTH));

  let cursor = 0;
  let lastSection: string | null = null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 overflow-y-auto bg-surface border border-border rounded-lg shadow-2xl animate-slide-down"
      style={{ top, left, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
    >
      {items.map((item) => {
        // Плоский курсор сквозь секции — конвенция сгруппированных списков проекта.
        const current = cursor++;
        const selected = current === index;
        const header = item.section !== lastSection ? item.section : null;
        lastSection = item.section;

        return (
          <div key={item.id}>
            {header && (
              <div className="sticky top-0 z-10 px-3 py-1 bg-surface/95 border-b border-border/30">
                <span className="text-[10px] uppercase tracking-widest text-accent">{header}</span>
              </div>
            )}
            <button
              data-slash-index={current}
              onMouseDown={(e) => {
                // Без этого textarea теряет фокус до вставки, и каретка уезжает.
                e.preventDefault();
                onPick(item);
              }}
              onMouseEnter={() => onHover(current)}
              className={`
                w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors duration-75
                ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
              `}
            >
              <span className="flex-1 truncate text-[12px] text-text">{item.label}</span>
              <span className="shrink-0 text-[10px] text-text-muted/45 font-mono truncate max-w-[96px]">
                {item.hint}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
