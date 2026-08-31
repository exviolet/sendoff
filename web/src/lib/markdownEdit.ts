// Операции markdown-редактирования в <textarea> — чистые, без DOM.
//
// Каждая возвращает патч (что заменить, чем, и куда встанет каретка) либо null —
// «событие не наше, пусть браузер обработает клавишу сам». Держать их здесь, а не в
// обработчике, нужно чтобы поведение проверялось без Tauri и без рендера (та же причина,
// по которой в lib/ вынесен tmuxResolve).

export interface EditPatch {
  from: number;
  to: number;
  text: string;
  selStart: number;
  selEnd: number;
}

export const INDENT = "  ";

// Маркер пункта: отступ, буллет или номер, обязательный пробел. Чекбокс — опциональный
// довесок к буллету, потому что "- [ ] " продолжается как "- [ ] ", а не как "- ".
const LIST_RE = /^([ \t]*)(?:([-*+])([ \t]+)(\[[ xX✓]\][ \t]+)?|(\d+)([.)])([ \t]+))/;
const QUOTE_RE = /^([ \t]*)((?:>[ \t]?)+)/;
const WORD_RE = /[\p{L}\p{N}_]/u;

const PAIRS: Record<string, string> = {
  "`": "`",
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
};
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);
const QUOTES = new Set(['"', "'"]);
// Перед этими символами пара уместна: строка на них кончается или дальше идёт разделитель.
const PAIR_STOPPERS = new Set([")", "]", "}", ",", ".", ";", ":", "!", "?"]);

function lineStart(value: string, pos: number): number {
  if (pos <= 0) return 0;
  return value.lastIndexOf("\n", pos - 1) + 1;
}

function lineEnd(value: string, pos: number): number {
  const i = value.indexOf("\n", pos);
  return i === -1 ? value.length : i;
}

function leadingIndentToRemove(line: string): number {
  if (line.startsWith("\t")) return 1;
  let n = 0;
  while (n < INDENT.length && line[n] === " ") n++;
  return n;
}

// Сдвиг всех строк, задетых выделением. Выделение едет вместе со своими строками:
// первая граница — на сдвиг первой строки, вторая — на суммарный.
function shiftLines(value: string, start: number, end: number, dir: 1 | -1): EditPatch {
  const from = lineStart(value, start);
  const to = lineEnd(value, end);
  const lines = value.slice(from, to).split("\n");

  let firstDelta = 0;
  let totalDelta = 0;

  const shifted = lines.map((line, i) => {
    let delta: number;
    let next: string;
    if (dir > 0) {
      // Пустые строки блока не отбиваем — иначе в тексте остаются хвосты из пробелов.
      const skip = line.length === 0 && lines.length > 1;
      delta = skip ? 0 : INDENT.length;
      next = skip ? line : INDENT + line;
    } else {
      delta = -leadingIndentToRemove(line);
      next = line.slice(-delta);
    }
    if (i === 0) firstDelta = delta;
    totalDelta += delta;
    return next;
  });

  const selStart = Math.max(from, start + firstDelta);
  return {
    from,
    to,
    text: shifted.join("\n"),
    selStart,
    selEnd: Math.max(selStart, end + totalDelta),
  };
}

export function indentSelection(value: string, start: number, end: number): EditPatch {
  if (value.slice(start, end).includes("\n")) return shiftLines(value, start, end, 1);

  const line = value.slice(lineStart(value, start), lineEnd(value, start));
  // В пункте списка Tab двигает сам пункт, а не вставляет пробелы в середину текста:
  // вложенность списка нужна несравнимо чаще, чем отступ внутри строки.
  if (LIST_RE.test(line)) return shiftLines(value, start, end, 1);

  const caret = start + INDENT.length;
  return { from: start, to: end, text: INDENT, selStart: caret, selEnd: caret };
}

export function outdentSelection(value: string, start: number, end: number): EditPatch {
  return shiftLines(value, start, end, -1);
}

function newlineWith(start: number, end: number, prefix: string): EditPatch {
  const text = "\n" + prefix;
  const caret = start + text.length;
  return { from: start, to: end, text, selStart: caret, selEnd: caret };
}

// Enter внутри списка/цитаты продолжает разметку; на пустом пункте — выходит из неё.
// null = обычный перенос строки.
export function continueList(value: string, start: number, end: number): EditPatch | null {
  const ls = lineStart(value, start);
  const le = lineEnd(value, start);
  const line = value.slice(ls, le);

  const list = LIST_RE.exec(line);
  if (list) {
    const [marker, indent, bullet, bulletGap, checkbox, num, delim, numGap] = list;
    // Каретка внутри самого маркера — продолжать нечего.
    if (start < ls + marker.length) return null;
    // Пустой пункт: Enter выходит из списка, а не плодит пустые маркеры.
    if (line.slice(marker.length).trim() === "") {
      return { from: ls, to: le, text: "", selStart: ls, selEnd: ls };
    }
    const prefix = bullet
      ? `${indent}${bullet}${bulletGap}${checkbox ? checkbox.replace(/\[[^\]]\]/, "[ ]") : ""}`
      : `${indent}${Number(num) + 1}${delim}${numGap}`;
    return newlineWith(start, end, prefix);
  }

  const quote = QUOTE_RE.exec(line);
  if (quote) {
    if (start < ls + quote[0].length) return null;
    if (line.slice(quote[0].length).trim() === "") {
      return { from: ls, to: le, text: "", selStart: ls, selEnd: ls };
    }
    return newlineWith(start, end, quote[0]);
  }

  const indent = /^[ \t]*/.exec(line)![0];
  if (indent.length === 0 || start <= ls + indent.length) return null;
  return newlineWith(start, end, indent);
}

function wordAt(value: string, pos: number): [number, number] {
  let s = pos;
  let e = pos;
  while (s > 0 && WORD_RE.test(value[s - 1])) s--;
  while (e < value.length && WORD_RE.test(value[e])) e++;
  return [s, e];
}

// Внутренние звёздочки жирного не должны читаться как курсив: иначе Ctrl+I по слову
// внутри **bold** снял бы один уровень жирного вместо добавления курсива.
function insideLongerRun(value: string, start: number, end: number, marker: string): boolean {
  if (marker !== "*") return false;
  return value[start - 2] === "*" || value[end + 1] === "*";
}

export function toggleWrap(value: string, start: number, end: number, marker: string): EditPatch {
  if (start === end) {
    const [ws, we] = wordAt(value, start);
    if (we > ws) return toggleWrap(value, ws, we, marker);
    const caret = start + marker.length;
    return { from: start, to: start, text: marker + marker, selStart: caret, selEnd: caret };
  }

  const m = marker.length;
  const selected = value.slice(start, end);

  // Обёртка попала в выделение.
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, selected.length - m);
    return { from: start, to: end, text: inner, selStart: start, selEnd: start + inner.length };
  }

  // Обёртка снаружи выделения.
  if (
    start >= m &&
    value.slice(start - m, start) === marker &&
    value.slice(end, end + m) === marker &&
    !insideLongerRun(value, start, end, marker)
  ) {
    return {
      from: start - m,
      to: end + m,
      text: selected,
      selStart: start - m,
      selEnd: start - m + selected.length,
    };
  }

  return {
    from: start,
    to: end,
    text: marker + selected + marker,
    selStart: start + m,
    selEnd: end + m,
  };
}

// Забор кода вокруг задетых строк — и снятие, если он уже стоит. Работает построчно:
// ``` обязаны жить на своих строках, иначе markdown их не увидит.
export function toggleCodeFence(value: string, start: number, end: number): EditPatch {
  const from = lineStart(value, start);
  const to = lineEnd(value, end);
  const block = value.slice(from, to);
  const lines = block.split("\n");

  // Забор попал в выделение целиком.
  if (lines.length >= 2 && lines[0].startsWith("```") && lines[lines.length - 1].trim() === "```") {
    const inner = lines.slice(1, -1).join("\n");
    return { from, to, text: inner, selStart: from, selEnd: from + inner.length };
  }

  // Забор снаружи выделения. Без этой ветки повторное нажатие вложило бы забор в забор:
  // после первого выделена только внутренность блока.
  const outer = fenceAround(value, from, to);
  if (outer) {
    return { ...outer, text: block, selStart: outer.from, selEnd: outer.from + block.length };
  }

  return {
    from,
    to,
    text: "```\n" + block + "\n```",
    selStart: from + 4,
    selEnd: from + 4 + block.length,
  };
}

function fenceAround(value: string, from: number, to: number): { from: number; to: number } | null {
  if (from === 0 || to >= value.length) return null;
  const prevStart = lineStart(value, from - 1);
  const nextEnd = lineEnd(value, to + 1);
  if (!value.slice(prevStart, from - 1).startsWith("```")) return null;
  if (value.slice(to + 1, nextEnd).trim() !== "```") return null;
  return { from: prevStart, to: nextEnd };
}

// Ввод парного символа. null = вставить символ как обычно.
export function autoPair(value: string, start: number, end: number, char: string): EditPatch | null {
  const close = PAIRS[char];

  if (start !== end) {
    if (!close) return null;
    const selected = value.slice(start, end);
    // Многострочное выделение в бэктиках — это блок кода, а не инлайн.
    if (char === "`" && selected.includes("\n")) {
      const inner = selected.replace(/\n$/, "");
      return {
        from: start,
        to: end,
        text: "```\n" + inner + "\n```",
        selStart: start + 4,
        selEnd: start + 4 + inner.length,
      };
    }
    return {
      from: start,
      to: end,
      text: char + selected + close,
      selStart: start + 1,
      selEnd: end + 1,
    };
  }

  // Третий бэктик подряд — блок кода. Проверяется раньше проскока: к этому моменту
  // два предыдущих бэктика уже слева от каретки (первый вставил пару, второй проскочил).
  if (char === "`" && start >= 2 && value.slice(start - 2, start) === "``" && value[start] !== "`") {
    const text = "```\n\n```";
    const caret = start + 2;
    return { from: start - 2, to: start, text, selStart: caret, selEnd: caret };
  }

  // Проскок над только что вставленной закрывающей — иначе набор плодит дубли.
  if (CLOSERS.has(char) && value[start] === char) {
    return { from: start, to: start, text: "", selStart: start + 1, selEnd: start + 1 };
  }

  if (!close) return null;

  const prev = value[start - 1] ?? "";
  const next = value[start] ?? "";

  // Кавычки внутри слова не парим: апостроф в don't и в «моё'» ломал бы набор.
  if (QUOTES.has(char) && (WORD_RE.test(prev) || WORD_RE.test(next))) return null;

  // Пара уместна только перед пустотой или разделителем: иначе «(текст» превратится
  // в «()текст» — ровно та причина, по которой автопары бесят в обычном тексте.
  if (next !== "" && !/\s/.test(next) && !PAIR_STOPPERS.has(next)) return null;

  return { from: start, to: start, text: char + close, selStart: start + 1, selEnd: start + 1 };
}

// Backspace между пустой парой сносит обе половины — плата за автопары.
export function deletePair(value: string, start: number, end: number): EditPatch | null {
  if (start !== end || start === 0) return null;
  const open = value[start - 1];
  if (PAIRS[open] !== value[start]) return null;
  return { from: start - 1, to: start + 1, text: "", selStart: start - 1, selEnd: start - 1 };
}
