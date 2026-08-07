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
export type ShortcutOverrides = Partial<Record<ShortcutCommandId, Chord[]>>;

const COMMANDS_BY_ID = new Map<ShortcutCommandId, (typeof shortcutCommands)[number]>(
  shortcutCommands.map((command) => [command.id, command]),
);

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

function sameChord(left: Chord, right: Chord): boolean {
  return left.code === right.code &&
    Boolean(left.ctrl) === Boolean(right.ctrl) &&
    Boolean(left.shift) === Boolean(right.shift) &&
    Boolean(left.alt) === Boolean(right.alt);
}

function sameChordList(left: readonly Chord[], right: readonly Chord[]): boolean {
  return left.length === right.length && left.every((chord, index) => sameChord(chord, right[index]));
}

function normalizeChord(chord: Chord): Chord {
  return {
    code: chord.code,
    ...(chord.ctrl ? { ctrl: true } : {}),
    ...(chord.shift ? { shift: true } : {}),
    ...(chord.alt ? { alt: true } : {}),
  };
}

function withEffectiveChords(
  overrides: ShortcutOverrides,
  commandId: ShortcutCommandId,
  chords: readonly Chord[],
): ShortcutOverrides {
  const next = { ...overrides };
  const defaults = COMMANDS_BY_ID.get(commandId)?.defaults ?? [];
  if (sameChordList(chords, defaults)) delete next[commandId];
  else next[commandId] = chords.map(normalizeChord);
  return next;
}

export function effectiveChords(
  commandId: ShortcutCommandId,
  overrides: ShortcutOverrides,
): readonly Chord[] {
  return overrides[commandId] ?? COMMANDS_BY_ID.get(commandId)?.defaults ?? [];
}

export function findChordOwner(
  chord: Chord,
  scope: ShortcutCommand["scope"],
  overrides: ShortcutOverrides,
): (typeof shortcutCommands)[number] | undefined {
  return shortcutCommands.find(
    (command) => command.scope === scope &&
      effectiveChords(command.id, overrides).some((candidate) => sameChord(candidate, chord)),
  );
}

export function assignChord(
  overrides: ShortcutOverrides,
  commandId: ShortcutCommandId,
  chord: Chord,
):
  | { ok: true; overrides: ShortcutOverrides; stolenFrom?: ShortcutCommandId }
  | { ok: false; reason: "invalid-chord" | "would-unbind-shortcuts"; owner?: ShortcutCommandId } {
  if (!isValidChord(chord)) return { ok: false, reason: "invalid-chord" };

  const command = COMMANDS_BY_ID.get(commandId);
  if (!command) return { ok: false, reason: "invalid-chord" };
  const normalized = normalizeChord(chord);
  const owner = findChordOwner(normalized, command.scope, overrides);
  if (owner?.id === commandId) return { ok: true, overrides: { ...overrides } };

  let next = { ...overrides };
  let stolenFrom: ShortcutCommandId | undefined;
  if (owner) {
    const remaining = effectiveChords(owner.id, next)
      .filter((candidate) => !sameChord(candidate, normalized));
    if (owner.id === "shortcuts" && remaining.length === 0) {
      return {
        ok: false,
        reason: "would-unbind-shortcuts",
        owner: "shortcuts",
      };
    }
    next = withEffectiveChords(next, owner.id, remaining);
    stolenFrom = owner.id;
  }

  const targetChords = effectiveChords(commandId, next);
  next = withEffectiveChords(next, commandId, [...targetChords, normalized]);
  return {
    ok: true,
    overrides: next,
    ...(stolenFrom ? { stolenFrom } : {}),
  };
}

// Заменить КОНКРЕТНЫЙ аккорд команды на новый. Нужна отдельно от assignChord: тот
// ДОБАВЛЯЕТ аккорд к существующим, а в строке справки пользователь жмёт на конкретное
// сочетание и ждёт, что изменится именно оно, а не появится второе.
//
// Старый аккорд снимается ДО назначения нового, и инвариант «у справки должна остаться
// клавиша» на промежуточном состоянии сознательно НЕ проверяется: оно пустое по
// построению, новый аккорд добавляется следующей же строкой. Проверь его здесь — и
// перевесить саму справку стало бы невозможно.
export function replaceChord(
  overrides: ShortcutOverrides,
  commandId: ShortcutCommandId,
  oldChord: Chord,
  newChord: Chord,
): ReturnType<typeof assignChord> {
  if (!isValidChord(newChord)) return { ok: false, reason: "invalid-chord" };
  if (!COMMANDS_BY_ID.has(commandId)) return { ok: false, reason: "invalid-chord" };

  const without = effectiveChords(commandId, overrides)
    .filter((chord) => !sameChord(chord, oldChord));
  return assignChord(withEffectiveChords(overrides, commandId, without), commandId, newChord);
}

export function resetShortcut(
  overrides: ShortcutOverrides,
  commandId: ShortcutCommandId,
): ShortcutOverrides {
  const next = { ...overrides };
  delete next[commandId];
  return next;
}

export function resetAllShortcuts(): ShortcutOverrides {
  return {};
}

export function isValidChord(value: unknown): value is Chord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const chord = value as Record<string, unknown>;
  if (typeof chord.code !== "string" || chord.code.length === 0) return false;
  if (MODIFIER_CODES.has(chord.code)) return false;
  return [chord.ctrl, chord.shift, chord.alt]
    .every((modifier) => modifier === undefined || typeof modifier === "boolean");
}

export function sanitizeShortcutOverrides(value: unknown): ShortcutOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const sanitized: ShortcutOverrides = {};
  for (const [id, rawChords] of Object.entries(value)) {
    if (!COMMANDS_BY_ID.has(id as ShortcutCommandId) || !Array.isArray(rawChords)) continue;
    const commandId = id as ShortcutCommandId;
    const chords = rawChords
      .filter(isValidChord)
      .map(normalizeChord)
      .filter((chord, index, all) =>
        all.findIndex((candidate) => sameChord(candidate, chord)) === index,
      );
    // [] — валидное явное отключение обычной команды. Но непустой массив, целиком
    // состоявший из мусора, не должен превратиться в отключение после сужения.
    if (chords.length === 0 && rawChords.length > 0) continue;
    if (commandId === "shortcuts" && chords.length === 0) continue;
    sanitized[commandId] = chords;
  }
  return sanitized;
}

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
  overrides: ShortcutOverrides,
): (typeof shortcutCommands)[number] | undefined {
  return shortcutCommands.find(
    (command) =>
      command.scope === scope &&
      effectiveChords(command.id, overrides).some((chord) => matchesChord(event, chord)),
  );
}
