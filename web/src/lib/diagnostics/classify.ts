// Классификация состояния провайдера. Чистая функция без Tauri — то есть тестируемая
// без запуска приложения, как tmuxResolve/herdrResolve на критическом пути отправки.

import type {
  DiagnosticTarget,
  DiscoveryOutcome,
  ExecutableLocation,
  ProviderDiagnostic,
  ProviderFailure,
  ProviderStatus,
} from "./types";
import type { TargetSource } from "../terminalTargets/types";

export interface ProviderProbe {
  source: TargetSource;
  label: string;
  executable: string;
  location: ExecutableLocation;
  discovery: DiscoveryOutcome;
}

// Таблица истинности из двух независимых сигналов:
//
//   discovery ok                      → ready   (бинарь очевидно рабочий, что бы ни сказал PATH)
//   discovery failed + файла нет      → not-found
//   discovery failed + файл найден    → error   (scope, версия CLI, сам провайдер)
//
// «discovery ok при ненайденном файле» не считаем противоречием и не чиним: раз команда
// отработала, авторитетнее она, а не наш обход PATH (бинарь мог быть найден плагином
// иначе). Отчёт покажет оба факта как есть.
export function classifyProvider(probe: ProviderProbe): ProviderDiagnostic {
  const { source, label, executable, location, discovery } = probe;

  let status: ProviderStatus;
  let targets: DiagnosticTarget[] = [];
  let failure: ProviderFailure | undefined;

  if (discovery.kind === "ok") {
    status = "ready";
    targets = discovery.targets;
  } else if (location.kind === "found") {
    status = "error";
    failure = discovery.failure;
  } else {
    // Бинаря нет — причина отказа не прикладывается СОЗНАТЕЛЬНО.
    //
    // Там всегда «спавн не состоялся», то есть ровно то, что строкой выше уже сказано
    // по-английски («Executable X not found in Sendoff PATH»). Причём сказано лучше:
    // сообщение приходит из std::io::Error самого Sendoff и потому локализовано системной
    // локалью («Нет такого файла или каталога (os error 2)»), а отчёт вставляют в
    // публичную issue. Дубль, который к тому же не по-английски, — чистый вред.
    status = "not-found";
  }

  return { source, label, executable, location, status, targets, failure };
}
