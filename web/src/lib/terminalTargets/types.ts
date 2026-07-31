// Общий контракт терминальных таргетов: tmux, Orca ADE, Herdr.
//
// Абстракцию сознательно не строили при второй реализации (ROADMAP, «Терминальные
// таргеты»): tmux и Orca разошлись бы по швам, которых мы ещё не знали. К третьей
// реализации швы известны — они здесь и зафиксированы.

export type TargetSource = "herdr" | "orca" | "tmux";

// Дескриптор привязки таба. Дискриминированное объединение: одно поле `binding`
// вместо трёх взаимоисключимых полей, которые приходилось руками гасить друг о друга.
//
// Общее правило всех трёх: хранить СТАБИЛЬНОЕ описание цели, а живой хендл резолвить
// каждый раз. Хендлы эфемерны у tmux (@id сбрасывается рестартом сервера) и Orca
// (term_… живёт сессию); у herdr pane_id персистится, но номера переиспользуются —
// поэтому и там одного id мало.
export type TabBinding =
  | { source: "tmux"; session: string; window: string; windowId?: string }
  | { source: "orca"; worktree: string; titleHint?: string }
  | { source: "herdr"; paneId: string; workspace: string; tab: string };

// Строка в пикере. Провайдер сам решает, что показать — оболочка только рисует.
export interface TerminalTarget {
  source: TargetSource;
  key: string; // уникален В ПРЕДЕЛАХ ВСЕХ провайдеров (секции живут в одном списке)
  handle: string; // что уедет в send()
  binding: TabBinding; // что сохранится в таб при bind
  primary: string; // основная подпись
  secondary?: string; // вторая строка (превью/команда)
  meta?: string; // правая колонка (pane id, каталог)
  status?: string; // статус агента — красится точкой; у tmux нет
  isActive?: boolean; // фокус/активность — преселект в пикере
}

// Разведение «не нашли» и «несколько» — не косметика: пользователю нужно понять,
// почему открылся пикер (цель исчезла vs цель неоднозначна). Старые резолверы
// схлопывали оба исхода в null.
export type Resolution =
  | { kind: "ok"; handle: string }
  | { kind: "not-found" }
  | { kind: "ambiguous"; count: number };

export interface TerminalProvider {
  source: TargetSource;
  label: string; // заголовок секции пикера

  // Бросает, если источник недоступен (не запущен, нет бинаря, не Tauri).
  // Отдельного isAvailable() нет намеренно: это был бы второй вызов ради того же
  // ответа — пикер прячет секцию по отклонённому промису.
  listTargets(): Promise<TerminalTarget[]>;

  // Живой резолв привязки в хендл. ИНВАРИАНТ ВСЕХ ПРОВАЙДЕРОВ: при неоднозначности
  // не угадывать — вернуть ambiguous и дать пользователю переспросить. Промпт,
  // ушедший чужому агенту, хуже лишнего клика (баг 2026-07-10).
  resolve(binding: TabBinding): Promise<Resolution>;

  // Отправка. Возвращает человекочитаемое «куда ушло» для тоста; бросает при ошибке.
  send(handle: string, text: string, submit: boolean): Promise<string>;

  // Короткая подпись привязки для бейджей (TabBar, StatusBar, Ctrl+T).
  describe(binding: TabBinding): string;
}
