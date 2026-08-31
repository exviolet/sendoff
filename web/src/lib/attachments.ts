// Картинка в промпте — это ПУТЬ к файлу, а не сама картинка.
//
// Основание замерено, а не предположено (спайк 2026-08-13): и Claude Code, и Codex,
// получив абсолютный путь в тексте промпта, открывают файл сами. Проверялось на
// изображении со случайным шестизначным числом — оба назвали его, то есть файл
// действительно читали, а не догадались по имени.
//
// Вставляется ГОЛЫЙ путь, без markdown `![](…)`: промпт уезжает в терминального
// агента, который markdown не рендерит, и обёртка превратилась бы в мусорные скобки
// вокруг пути. То же основание, по которому из слэш-меню выброшены GitHub Alerts.

/// Форматы, которые агент на том конце действительно откроет. Тот же список зашит в
/// сигнатурный sniff на Rust-стороне — там он источник правды, здесь фильтр диалога.
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"] as const;

/**
 * Картинка ли это — решает расширение пути.
 *
 * Сигнатуру тут прочесть нечем и не нужно: брошенный файл уже лежит на диске, вебвью
 * его не открывает (чтения бинарника ему не выдано), а вставляем мы только строку.
 * Сигнатурный sniff остаётся там, где действительно создаётся файл, — в Rust.
 */
export function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext !== undefined && (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export interface AttachmentInsertion {
  content: string;
  caret: number;
}

/**
 * Путь в позицию каретки, с пробелами по краям там, где иначе он склеится с текстом.
 *
 * Склейка — не косметика: `посмотри/home/u/a.png` и `/home/u/a.png.Что` агент читает
 * как одно слово и файла не находит. Пробел добавляется только когда соседний символ
 * не пробельный, поэтому повторная вставка не плодит их пачками.
 */
export function insertAttachmentPath(
  value: string,
  from: number,
  to: number,
  path: string,
): AttachmentInsertion {
  const before = value.slice(0, from);
  const after = value.slice(to);

  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) ? " " : "";

  const inserted = lead + path + trail;
  return { content: before + inserted + after, caret: before.length + inserted.length };
}
