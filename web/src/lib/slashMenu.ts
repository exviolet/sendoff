// Слэш-меню: каталог вставок, детект триггера и построение патча. Чистое, без DOM —
// по той же причине, что и markdownEdit: поведение проверяется без рендера и без Tauri.
//
// Патч — тот же EditPatch, что у markdownEdit: вставка идёт через общий applyPatch в
// Editor, своего пути записи в textarea тут нет и быть не должно.

import type { EditPatch } from "./markdownEdit";
import { fuzzyMatch } from "./fuzzyMatch";

// Как пункт садится в текст:
//   line  — маркер в начало строки (заголовки, списки);
//   block — свой блок из строк (забор кода, черта);
//   raw   — тело как есть в позицию каретки (trigger phrases).
export type SlashKind = "line" | "block" | "raw";

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  section: "Phrases" | "Formatting";
  kind: SlashKind;
  // line: префикс строки. block: строки блока, где null — место каретки. raw: тело.
  payload: string | readonly (string | null)[];
}

// Ровно набор со скриншотов автора минус GitHub Alerts: `> [!WARNING]` в промпте агенту
// не рендерится ничем, это просто лишние токены (решение 2026-08-12, tasks/17).
export const FORMATTING_ITEMS: readonly SlashItem[] = [
  { id: "codeblock", label: "Code block", hint: "```", section: "Formatting", kind: "block", payload: ["```", null, "```"] },
  { id: "h1", label: "Heading 1", hint: "#", section: "Formatting", kind: "line", payload: "# " },
  { id: "h2", label: "Heading 2", hint: "##", section: "Formatting", kind: "line", payload: "## " },
  { id: "h3", label: "Heading 3", hint: "###", section: "Formatting", kind: "line", payload: "### " },
  { id: "h4", label: "Heading 4", hint: "####", section: "Formatting", kind: "line", payload: "#### " },
  { id: "ol", label: "Ordered list", hint: "1.", section: "Formatting", kind: "line", payload: "1. " },
  { id: "task", label: "Task list", hint: "- [ ]", section: "Formatting", kind: "line", payload: "- [ ] " },
  { id: "ul", label: "Unordered list", hint: "-", section: "Formatting", kind: "line", payload: "- " },
  { id: "hr", label: "Horizontal rule", hint: "---", section: "Formatting", kind: "block", payload: ["---", null] },
];

// Trigger phrase как пункт меню. Живёт здесь, а не в компоненте: подсказка участвует в
// поиске, значит это часть каталога, а не оформление.
//
// Вставка ВСЕГДА в каретку, даже когда `phraseInsertMode` стоит на «префиксом ко всему
// промпту»: `/` вызывается в конкретной точке текста, и вставка в начало таба
// противоречила бы самому жесту. `Ctrl+K` свою настройку сохраняет (решение 2026-08-12).
export function phraseSlashItem(id: string, label: string, body: string): SlashItem {
  const line = body.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return {
    id: `phrase:${id}`,
    label,
    hint: line.length > 28 ? `${line.slice(0, 27)}…` : line,
    section: "Phrases",
    kind: "raw",
    payload: body,
  };
}

export interface SlashTrigger {
  // Индекс самого `/`. Вставка съедает всё от него до каретки.
  from: number;
  query: string;
}

// Запрос длиннее этого — уже не запрос, а обычный текст после слэша.
const MAX_QUERY = 24;

// Триггер ищется ПО ТЕКСТУ перед кареткой, а не по коду клавиши: на ЙЦУКЕН физическая
// клавиша Slash даёт «.», и проверка по e.code открывала бы меню не от того символа.
export function detectSlashQuery(value: string, caret: number): SlashTrigger | null {
  if (caret < 1 || caret > value.length) return null;

  const from = value.lastIndexOf("/", caret - 1);
  if (from === -1) return null;

  // `/` — обычный символ (src/lib/, и/или, 12/08). Открываемся только там, где слэш
  // начинает слово: иначе меню лезло бы в каждый путь внутри промпта.
  const before = from === 0 ? "" : value[from - 1];
  if (before !== "" && !/[ \t\n]/.test(before)) return null;

  const query = value.slice(from + 1, caret);
  if (query.length > MAX_QUERY) return null;
  if (/[\s/]/.test(query)) return null;

  return { from, query };
}

export function slashItems(phraseItems: readonly SlashItem[]): readonly SlashItem[] {
  // Фразы первыми: они авторские, markdown — генерика.
  return [...phraseItems, ...FORMATTING_ITEMS];
}

const SECTION_ORDER: Record<SlashItem["section"], number> = { Phrases: 0, Formatting: 1 };

// Ранжирование ВНУТРИ секции, порядок секций фиксирован. Сквозная сортировка по очкам
// перемешала бы фразы с markdown, и заголовок секции нарисовался бы по нескольку раз.
export function filterSlashItems(
  items: readonly SlashItem[],
  query: string,
): readonly SlashItem[] {
  const q = query.trim();
  if (!q) return items;

  return items
    .map((item, index) => {
      const byLabel = fuzzyMatch(q, item.label);
      const byHint = fuzzyMatch(q, item.hint);
      // index в счёте — чтобы порядок каталога не рассыпался на равных очках.
      const score = Math.max(byLabel.match ? byLabel.score : -1, byHint.match ? byHint.score : -1);
      return { item, score: score - index * 0.001 };
    })
    .filter((row) => row.score > -1)
    .sort((a, b) =>
      SECTION_ORDER[a.item.section] - SECTION_ORDER[b.item.section] || b.score - a.score,
    )
    .map((row) => row.item);
}

function lineStart(value: string, pos: number): number {
  if (pos <= 0) return 0;
  return value.lastIndexOf("\n", pos - 1) + 1;
}

// Патч на вставку пункта. Диапазон `/query` съедается всегда — он был командой, а не текстом.
export function applySlashItem(
  value: string,
  trigger: SlashTrigger,
  caret: number,
  item: SlashItem,
): EditPatch {
  const from = trigger.from;

  if (item.kind === "raw") {
    const text = item.payload as string;
    const pos = from + text.length;
    return { from, to: caret, text, selStart: pos, selEnd: pos };
  }

  if (item.kind === "line") {
    const marker = item.payload as string;
    const ls = lineStart(value, from);
    const head = value.slice(ls, from);
    // Строка до слэша — только отступ: маркер встаёт в начало строки, слэш исчезает.
    // Иначе (есть текст) маркер посреди строки смысла не имеет, поэтому он уезжает на
    // свою новую строку — так пункт списка не приклеивается к хвосту предыдущего.
    if (head.trim() === "") {
      const text = head + marker;
      const pos = ls + text.length;
      return { from: ls, to: caret, text, selStart: pos, selEnd: pos };
    }
    const text = "\n" + marker;
    const pos = from + text.length;
    return { from, to: caret, text, selStart: pos, selEnd: pos };
  }

  const lines = item.payload as readonly (string | null)[];
  const ls = lineStart(value, from);
  const head = value.slice(ls, from);
  const onOwnLine = head.trim() === "";
  // Блок обязан начинаться со своей строки: ``` в середине строки markdown не увидит.
  const anchor = onOwnLine ? ls : from;
  // Отступ строки переносится на все строки блока — забор внутри вложенного пункта
  // списка иначе вывалился бы из него.
  const indent = onOwnLine ? head : "";

  let text = onOwnLine ? "" : "\n";
  let caretOffset = -1;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) text += "\n";
    const line = lines[i];
    text += indent;
    if (line === null) caretOffset = text.length;
    else text += line;
  }

  const pos = anchor + (caretOffset === -1 ? text.length : caretOffset);
  return { from: anchor, to: caret, text, selStart: pos, selEnd: pos };
}
