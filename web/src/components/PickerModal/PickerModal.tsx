import type { ReactNode, RefObject } from "react";

interface PickerModalProps {
  onClose: () => void;
  // CSS-значения (динамические: 560/640/900/980, 10/12/15vh) → inline-style, не Tailwind-arbitrary.
  width?: string;
  paddingTop?: string;
  // Переопределяет дефолтную подсказку (у пикеров разные глаголы: отправить/привязать/переместить).
  footer?: ReactNode;
  children: ReactNode;
}

// Presentational-хром модалки-пикера: overlay + backdrop + панель + футер. Список и
// строки рендерит консьюмер (слишком разные: grouping, preview, create-row). Пара к
// usePickerModal (headless-ядро). См. issue #9 / tasks/13.
export function PickerModal({
  onClose,
  width = "min(94vw, 640px)",
  paddingTop = "12vh",
  footer,
  children,
}: PickerModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      style={{ paddingTop }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        {footer ?? <PickerFooter />}
      </div>
    </div>
  );
}

function PickerFooter() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/50">
      <span>↑↓ навигация</span>
      <span>↵ выбрать</span>
      <span>Esc закрыть</span>
    </div>
  );
}

interface PickerHeaderProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Иконка или лейбл ("orca"/"tmux"/"workspace") слева от инпута.
  prefix?: ReactNode;
  // Счётчик и/или тогглы справа.
  suffix?: ReactNode;
}

// Идентичный во всех пикерах инпут-хедер (варьируются только prefix/suffix).
export function PickerHeader({ inputRef, value, onChange, placeholder, prefix, suffix }: PickerHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      {prefix}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
      />
      {suffix}
    </div>
  );
}

// Стандартная строка подсказок для футера (переопределяемого). Экспортируется, чтобы
// консьюмеры с иным глаголом собирали её в том же стиле.
export function PickerHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/50">
      {children}
    </div>
  );
}
