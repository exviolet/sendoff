// Сбор диагностики. Единственный Tauri-зависимый файл в lib/diagnostics — вся логика
// вывода статусов и формат отчёта лежат в classify.ts/report.ts и живут без него.

import { isTauri } from "../platform";
import { PROVIDERS } from "../terminalTargets";
import { describeError, ScopedCommandError } from "../terminalTargets/shell";
import { classifyProvider } from "./classify";
import { summarizeFailure } from "./failure";
import { sanitizeHome } from "./sanitize";
import type {
  AppDiagnostic,
  Diagnostics,
  DiscoveryOutcome,
  ExecutableLocation,
  ProviderDiagnostic,
} from "./types";

interface RustExecutableLocation {
  name: string;
  path: string | null;
}

// Ни одна из этих проб не должна ронять Doctor: он и открывается-то тогда, когда
// что-то сломано. Любой отказ превращается в «unknown» в своей строке.
async function safe<T>(probe: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await probe();
  } catch {
    return fallback;
  }
}

async function collectApp(): Promise<AppDiagnostic> {
  const userAgent = typeof navigator === "undefined" ? "unknown" : navigator.userAgent;

  if (!isTauri) {
    return {
      name: "Sendoff",
      version: "unknown",
      tauriVersion: "unknown",
      identifier: "unknown",
      webkitVersion: null,
      dataDir: null,
      userAgent,
      home: null,
    };
  }

  const [app, path, core] = await Promise.all([
    import("@tauri-apps/api/app"),
    import("@tauri-apps/api/path"),
    import("@tauri-apps/api/core"),
  ]);

  const [name, version, tauriVersion, identifier, dataDir, webkitVersion, home] = await Promise.all([
    safe(() => app.getName(), "unknown"),
    safe(() => app.getVersion(), "unknown"),
    safe(() => app.getTauriVersion(), "unknown"),
    safe(() => app.getIdentifier(), "unknown"),
    safe<string | null>(() => path.appLocalDataDir(), null),
    safe<string | null>(() => core.invoke<string | null>("webkit_version"), null),
    safe<string | null>(() => path.homeDir(), null),
  ]);

  return {
    name,
    version,
    tauriVersion,
    identifier,
    webkitVersion,
    dataDir: dataDir === null ? null : sanitizeHome(dataDir, home),
    userAgent,
    home,
  };
}

async function locateExecutables(home: string | null): Promise<Map<string, ExecutableLocation>> {
  const found = new Map<string, ExecutableLocation>();
  if (!isTauri) return found;

  const { invoke } = await import("@tauri-apps/api/core");
  const located = await safe<RustExecutableLocation[]>(
    () => invoke<RustExecutableLocation[]>("locate_executables"),
    [],
  );
  for (const entry of located) {
    found.set(
      entry.name,
      entry.path ? { kind: "found", path: sanitizeHome(entry.path, home) } : { kind: "not-found" },
    );
  }
  return found;
}

async function discover(
  provider: (typeof PROVIDERS)[number],
  home: string | null,
): Promise<DiscoveryOutcome> {
  try {
    const targets = await provider.listTargets();
    return {
      kind: "ok",
      targets: targets.map((t) => ({ primary: t.primary, handle: t.handle })),
    };
  } catch (error) {
    // describeError, а не error.message: plugin-shell отклоняет промис СТРОКОЙ, и
    // проверка instanceof Error выбросила бы настоящую причину в мусор.
    const message = describeError(error);
    // Сырой конверт есть только у отказа с ненулевым кодом возврата. У отказа
    // подготовки команды (scope) выводить нечего — там всё сообщение и есть причина.
    const raw =
      error instanceof ScopedCommandError
        ? error.stderr.trim() || error.stdout.trim() || message
        : message;
    const { code, summary } = summarizeFailure(raw, message);

    return {
      kind: "failed",
      failure: {
        code,
        summary: sanitizeHome(summary, home),
        raw: sanitizeHome(raw, home),
      },
    };
  }
}

export async function collectDiagnostics(): Promise<Diagnostics> {
  // Провайдеры опрашиваются параллельно: последовательно самый медленный (упавший по
  // таймауту) задерживал бы весь экран.
  // Домашний каталог нужен раньше остальных: им санитизируются пути и сообщения.
  const app = await collectApp();
  const [executables, outcomes] = await Promise.all([
    locateExecutables(app.home),
    Promise.all(PROVIDERS.map((provider) => discover(provider, app.home))),
  ]);

  const providers: ProviderDiagnostic[] = PROVIDERS.map((provider, i) =>
    classifyProvider({
      source: provider.source,
      label: provider.label,
      executable: provider.executable,
      location: executables.get(provider.executable) ?? { kind: "not-found" },
      discovery: outcomes[i],
    }),
  );

  return { app, providers };
}
