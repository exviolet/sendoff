// Координат каретки у <textarea> нет ни в одном браузерном API — их меряют зеркальным
// элементом с теми же метриками текста. Та же техника, что у backdrop подсветки поиска,
// с одним отличием: стили берутся из getComputedStyle, а НЕ переписываются
// Tailwind-классами руками. Причина конкретная — `tracking-wide` даёт letter-spacing, а
// fontFamily и fontSize приходят из настроек: рукописная копия разошлась бы с реальностью
// на первой же смене шрифта, и меню уехало бы от каретки на длинных строках.

export interface CaretPoint {
  // Относительно border-box самой textarea, с уже вычтенным скроллом.
  top: number;
  left: number;
  lineHeight: number;
}

const COPIED_PROPERTIES = [
  "box-sizing",
  "border-bottom-width",
  "border-left-width",
  "border-right-width",
  "border-top-width",
  "font-family",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "tab-size",
  "text-indent",
  "text-transform",
  "word-break",
  "word-spacing",
  "overflow-wrap",
  "white-space",
] as const;

export function caretCoords(textarea: HTMLTextAreaElement, index: number): CaretPoint {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");

  for (const property of COPIED_PROPERTIES) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.visibility = "hidden";
  mirror.style.height = "auto";
  // clientWidth — ширина без бордера и скроллбара; при border-box вместе со
  // скопированными padding'ами это даёт ровно ту же ширину строки, что в textarea.
  mirror.style.width = `${textarea.clientWidth}px`;

  mirror.textContent = textarea.value.slice(0, index);

  const marker = document.createElement("span");
  // Хвост нужен, иначе последнее слово перед кареткой не перенесётся так же, как в
  // textarea, и на границе переноса меню встало бы строкой выше. Точка — на случай
  // пустого хвоста: span нулевой ширины не имеет позиции.
  marker.textContent = textarea.value.slice(index) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  document.body.removeChild(mirror);

  const parsedLineHeight = Number.parseFloat(style.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight)
    ? parsedLineHeight
    : Number.parseFloat(style.fontSize) * 1.7;

  return {
    top: top - textarea.scrollTop,
    left: left - textarea.scrollLeft,
    lineHeight,
  };
}
