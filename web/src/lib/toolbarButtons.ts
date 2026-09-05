// Каталог кнопок правого края шапки. Один источник для двух потребителей: AppToolbar
// рисует по нему кнопки, SettingsPanel — тумблеры. Две независимые копии списка
// разъехались бы ровно так же, как разъезжались подписи хоткеев до реестра команд.
export interface ToolbarButton {
  id: string;
  label: string;
  // Чем ещё дотянуться до действия, если кнопку спрятали. Показывается под тумблером:
  // прятать функцию без видимого второго маршрута — это терять её, а не убирать с глаз.
  fallback: string;
}

// Порядок совпадает с порядком в шапке — тумблеры читаются как сама панель.
// Кнопок окна (свернуть / развернуть / закрыть) здесь намеренно нет: у них нет второго
// маршрута, и спрятанная «закрыть» оставила бы окно без штатного закрытия.
export const TOOLBAR_BUTTONS: readonly ToolbarButton[] = [
  { id: "download", label: "Download", fallback: "Command Palette → Download tab" },
  { id: "export", label: "Export backup", fallback: "Command Palette → Export backup" },
  { id: "import", label: "Import backup", fallback: "Command Palette → Import backup" },
  { id: "settings", label: "Settings", fallback: "Ctrl+," },
  { id: "theme", label: "Theme", fallback: "Command Palette → Theme: Dark / Light / System" },
  { id: "reference", label: "Reference", fallback: "Ctrl+R" },
  { id: "trigger-phrases", label: "Trigger phrases", fallback: "Ctrl+K" },
  { id: "presets", label: "Presets", fallback: "Command Palette → Replace presets" },
];

const TOOLBAR_BUTTON_IDS = new Set(TOOLBAR_BUTTONS.map((b) => b.id));

// Храним СКРЫТЫЕ, а не видимые. Пустой список = панель ровно как была, поэтому
// у существующих пользователей и на записанном демо ничего не меняется. Список
// видимых дал бы обратное: кнопка, добавленная позже, оказалась бы молча спрятанной
// у всех, кто хоть раз трогал настройку.
export function sanitizeHiddenToolbarButtons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  // Незнакомый id (кнопку удалили, база от новой версии) отбрасываем на чтении —
  // иначе он копится в meta вечно.
  return raw.filter(
    (id): id is string => typeof id === "string" && TOOLBAR_BUTTON_IDS.has(id),
  );
}
