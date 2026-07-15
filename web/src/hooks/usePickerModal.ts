import { useEffect, useRef, useState } from "react";

interface UsePickerModalOptions {
  // Длина плоского списка (включая синтетические строки вроде create-row).
  count: number;
  // Enter по текущему selectedIndex.
  onEnter: (index: number) => void;
  onClose: () => void;
  // Вызывается ПЕРВЫМ в keydown; вернул true → дефолтная навигация пропускается
  // (так консьюмер вешает свои клавиши — напр. TabSwitcher: Tab, Ctrl+Del).
  onKeyDown?: (e: KeyboardEvent) => boolean | void;
  // Ранний return из keydown (напр. TabSwitcher: pendingClose гасит все клавиши).
  disabled?: boolean;
  // Стартовое выделение (useState-семантика: учитывается только на маунте).
  initialIndex?: number;
}

// Headless-ядро модалки-пикера: selectedIndex + refs + focus-on-mount + keynav +
// scroll-into-view. Query, фильтрацию, данные и рендер строк консьюмер держит у себя
// (см. issue #9 / tasks/13). Консьюмер: вешает inputRef на инпут, listRef на скролл-
// контейнер, клеит data-picker-index={i} на каждую строку.
export function usePickerModal({
  count,
  onEnter,
  onClose,
  onKeyDown,
  disabled = false,
  initialIndex = 0,
}: UsePickerModalOptions) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // keydown в capture-фазе (true) — как во всех пикерах: перехватить до инпута.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled) return;
      if (onKeyDown?.(e)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (count > 0) setSelectedIndex((i) => Math.min(i + 1, count - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onEnter(selectedIndex);
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [count, disabled, onClose, onEnter, onKeyDown, selectedIndex]);

  // Доскролл выбранной строки в вид — единый селектор для плоских и сгруппированных списков.
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-picker-index="${selectedIndex}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return { selectedIndex, setSelectedIndex, inputRef, listRef };
}
