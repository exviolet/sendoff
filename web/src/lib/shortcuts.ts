export type Chord = {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export interface ShortcutCommand {
  id: string;
  label: string;
  group: string;
  scope: "global" | "editor";
  defaults: Chord[];
  fixed?: true;
}

export interface ShortcutEvent {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const shortcutCommands = [
  {
    id: "target-pick",
    label: "Выбрать цель (herdr / Orca / tmux)",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "Enter", ctrl: true, shift: true }],
  },
  {
    id: "target-send",
    label: "Отправить промпт в терминал",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "Enter", ctrl: true }],
  },
  {
    id: "tab-switcher",
    label: "Найти таб (в текущем workspace)",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyT", ctrl: true }],
  },
  {
    id: "reference",
    label: "Reference panel",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "KeyR", ctrl: true }],
  },
  {
    id: "global-search",
    label: "Глобальный поиск по табам",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "KeyD", ctrl: true, shift: true }],
  },
  {
    id: "target-unbind",
    label: "Отвязать таб от терминала",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "KeyB", ctrl: true, shift: true, alt: true }],
  },
  {
    id: "target-bind",
    label: "Привязать таб к терминалу",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "KeyB", ctrl: true, alt: true }],
  },
  {
    id: "new-tab",
    label: "Новый таб",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyN", ctrl: true }],
  },
  {
    id: "workspace-switch",
    label: "Workspace: переключить / создать",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyW", ctrl: true, shift: true }],
  },
  {
    id: "tab-group-picker",
    label: "Положить таб в группу",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyG", ctrl: true }],
  },
  {
    id: "close-tab",
    label: "Закрыть таб",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyW", ctrl: true }],
  },
  {
    id: "reopen-tab",
    label: "Восстановить таб",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyT", ctrl: true, shift: true }],
  },
  {
    id: "move-tab-left",
    label: "Сдвинуть таб влево",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "PageUp", ctrl: true, shift: true }],
  },
  {
    id: "move-tab-right",
    label: "Сдвинуть таб вправо",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "PageDown", ctrl: true, shift: true }],
  },
  {
    id: "next-tab",
    label: "Следующий таб",
    group: "Табы",
    scope: "global",
    defaults: [
      { code: "Tab", ctrl: true },
      { code: "PageDown", ctrl: true },
    ],
  },
  {
    id: "previous-tab",
    label: "Предыдущий таб",
    group: "Табы",
    scope: "global",
    defaults: [
      { code: "Tab", ctrl: true, shift: true },
      { code: "PageUp", ctrl: true },
    ],
  },
  {
    id: "find",
    label: "Найти",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "KeyF", ctrl: true }],
  },
  {
    id: "find-replace",
    label: "Найти и заменить",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "KeyH", ctrl: true }],
  },
  {
    id: "trigger-phrases",
    label: "Фразы-триггеры",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "KeyK", ctrl: true }],
  },
  {
    id: "command-palette",
    label: "Command Palette",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "KeyP", ctrl: true, shift: true }],
  },
  {
    id: "toggle-pin",
    label: "Закрепить/открепить таб",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyP", ctrl: true }],
  },
  {
    id: "distraction-free",
    label: "Distraction-free режим",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "KeyF", ctrl: true, shift: true }],
  },
  {
    id: "shortcuts",
    label: "Шорткаты (это окно)",
    group: "Справка",
    scope: "global",
    defaults: [{ code: "Slash", ctrl: true }],
  },
  {
    id: "settings",
    label: "Настройки",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "Comma", ctrl: true }],
  },
  {
    id: "toggle-sidebar",
    label: "Toggle sidebar",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "Period", ctrl: true }],
  },
  {
    id: "toggle-md-preview",
    label: "Markdown превью",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "KeyM", alt: true }],
  },
  {
    id: "focus-editor",
    label: "Фокус в редактор",
    group: "Панели",
    scope: "global",
    defaults: [{ code: "KeyE", ctrl: true }],
  },
  {
    id: "save",
    label: "Записать сейчас (обычно само)",
    group: "Файлы",
    scope: "global",
    defaults: [{ code: "KeyS", ctrl: true }],
  },
  {
    id: "open",
    label: "Открыть файл",
    group: "Файлы",
    scope: "global",
    defaults: [{ code: "KeyO", ctrl: true }],
  },
  {
    id: "undo",
    label: "Отменить",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "KeyZ", ctrl: true }],
  },
  {
    id: "redo",
    label: "Повторить",
    group: "Редактирование",
    scope: "global",
    defaults: [{ code: "KeyZ", ctrl: true, shift: true }],
  },
  {
    id: "scroll-active-tab",
    label: "Доскроллить к активному табу",
    group: "Табы",
    scope: "global",
    defaults: [{ code: "KeyA", ctrl: true, shift: true }],
  },
  {
    id: "bold",
    label: "Жирный (**)",
    group: "Markdown",
    scope: "editor",
    defaults: [{ code: "KeyB", ctrl: true }],
  },
  {
    id: "italic",
    label: "Курсив (*)",
    group: "Markdown",
    scope: "editor",
    defaults: [{ code: "KeyI", ctrl: true }],
  },
  {
    id: "inline-code",
    label: "Инлайн-код (`)",
    group: "Markdown",
    scope: "editor",
    defaults: [{ code: "KeyM", ctrl: true }],
  },
  {
    id: "code-fence",
    label: "Блок кода (```)",
    group: "Markdown",
    scope: "editor",
    defaults: [{ code: "KeyM", ctrl: true, shift: true }],
  },
] as const satisfies readonly ShortcutCommand[];

export type ShortcutCommandId = (typeof shortcutCommands)[number]["id"];

const KEY_LABELS: Readonly<Record<string, string>> = {
  Comma: ",",
  Slash: "/",
  Period: ".",
  PageDown: "PgDn",
  PageUp: "PgUp",
  Enter: "Enter",
  Tab: "Tab",
};

export function formatChord(chord: Chord): string {
  const key = KEY_LABELS[chord.code] ??
    (chord.code.startsWith("Key") ? chord.code.slice(3) : chord.code);
  const parts: string[] = [];
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function matchesChord(event: ShortcutEvent, chord: Chord): boolean {
  return (
    event.code === chord.code &&
    (event.ctrlKey || event.metaKey) === Boolean(chord.ctrl) &&
    event.shiftKey === Boolean(chord.shift) &&
    event.altKey === Boolean(chord.alt)
  );
}

export function matchShortcut(
  event: ShortcutEvent,
  scope: ShortcutCommand["scope"],
): (typeof shortcutCommands)[number] | undefined {
  return shortcutCommands.find(
    (command) =>
      command.scope === scope && command.defaults.some((chord) => matchesChord(event, chord)),
  );
}
