// Общая обвязка запуска scoped-команд. Первый аргумент Command.create — ИМЯ entry
// из allowlist (capabilities/default.json), а НЕ бинарь: бинарь и разрешённые args
// берутся из entry по имени.

export interface CommandOutput {
  code: number | null;
  stderr: string;
  stdout: string;
}

// Дописывает к сообщению об ошибке хендл, которому команда предназначалась.
//
// Зачем это вообще нужно: plugin-shell схлопывает ЛЮБОЙ отказ подготовки команды
// в одно сообщение «program not allowed on the configured shell scope: <entry>»
// (`commands.rs`: результат `scope.prepare` разбирается, а настоящая ошибка
// печатается только под `#[cfg(debug_assertions)]` — в релизной сборке она
// теряется совсем). Поэтому провал регекс-валидатора аргумента выглядит как
// запрет самой программы, и по тексту их не различить.
//
// Так и вышло у 2-го пользователя: herdr 0.6.10 отдаёт `pane_id` вида
// `w657cefe818690a-1`, а валидатор в манифесте ждёт `wK:p1` — отправка падала,
// а сообщение указывало не туда. Хендл в тексте делает следующий такой случай
// диагностируемым с первого репорта: видно и что не так, и с чем именно.
export function withTarget(message: string, target?: string): string {
  const text = message.trim();
  return target ? `${text} (target: ${target})` : text;
}

// Отказ scoped-команды с сохранённым сырым выводом.
//
// Зачем класс, а не просто строка: и orca-ide, и herdr отвечают JSON-конвертом
// ({"ok":false,"error":{"code","message"}}), но runScoped склеивает его в текст
// сообщения. Doctor'у нужны code и message по отдельности — а доставать их обратно
// из готовой строки значило бы резать её регексом. Здесь сырой вывод просто не
// теряется, и разбирается он потом честным JSON.parse.
//
// `message` остаётся ровно прежним, поэтому тосты и console.error не меняются.
export class ScopedCommandError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;

  constructor(message: string, output: CommandOutput) {
    super(message);
    this.name = "ScopedCommandError";
    this.stdout = output.stdout;
    this.stderr = output.stderr;
    this.code = output.code;
  }
}

export async function runScoped(
  scopedName: string,
  args: string[],
  errorPrefix: string,
  target?: string,
): Promise<CommandOutput> {
  const { Command } = await import("@tauri-apps/plugin-shell");

  let output: CommandOutput;
  try {
    output = await Command.create(scopedName, args).execute();
  } catch (error) {
    // Префикс тут НЕ добавляем: сообщение уже несёт имя scope-entry, а тост
    // сверху клеит ярлык провайдера — иначе вышло бы «Herdr: herdr error: …».
    throw new Error(withTarget(describeError(error), target));
  }

  if (output.code !== 0) {
    const detail = output.stderr.trim() || output.stdout.trim() || `exit code ${output.code ?? "unknown"}`;
    throw new ScopedCommandError(withTarget(`${errorPrefix}: ${detail}`, target), output);
  }

  return output;
}

// Любое брошенное значение → текст, который не стыдно показать пользователю.
//
// Живёт рядом с runScoped не случайно: бросает здесь не только он. Сам
// `Command.execute()` из tauri-plugin-shell отклоняет промис СТРОКОЙ — ошибка
// приходит из Rust, и `Error` её никто не оборачивает. Поэтому проверки
// `instanceof Error` мало: она отправляла настоящую причину в мусор, и сбой у
// 2-го пользователя оказался нерасследуемым — «Неизвестная ошибка» без единой
// детали. Заглушка остаётся только на случай, когда показывать реально нечего.
export function describeError(error: unknown): string {
  if (error == null) return "error without description"; // иначе тост скажет «undefined»
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : safeStringify(error);
  return text.trim() || "error without description";
}

function safeStringify(value: unknown): string {
  try {
    // JSON.stringify(undefined) === undefined, а не строка — отсюда фолбэк.
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value); // циклические ссылки, getters с throw
  }
}

// --- defensive JSON narrowing (вывод CLI приходит как unknown) ---

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// И orca-ide, и herdr отдают {"id":…,"result":{…}}. Различие: orca требует флага
// --json, а у herdr его НЕТ вовсе — вывод и так JSON, а лишний флаг роняет команду.
export function parseResult(stdout: string): Record<string, unknown> | null {
  try {
    return asRecord(asRecord(JSON.parse(stdout) as unknown)?.result);
  } catch {
    return null;
  }
}
