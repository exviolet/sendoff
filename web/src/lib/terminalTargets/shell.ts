// Общая обвязка запуска scoped-команд. Первый аргумент Command.create — ИМЯ entry
// из allowlist (capabilities/default.json), а НЕ бинарь: бинарь и разрешённые args
// берутся из entry по имени.

export interface CommandOutput {
  code: number | null;
  stderr: string;
  stdout: string;
}

export async function runScoped(
  scopedName: string,
  args: string[],
  errorPrefix: string,
): Promise<CommandOutput> {
  const { Command } = await import("@tauri-apps/plugin-shell");
  const output = await Command.create(scopedName, args).execute();

  if (output.code !== 0) {
    const detail = output.stderr.trim() || output.stdout.trim() || `код ${output.code ?? "unknown"}`;
    throw new Error(`${errorPrefix}: ${detail}`);
  }

  return output;
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
