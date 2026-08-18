// Модель диагностики Sendoff Doctor.
//
// Ключевое ограничение, из которого выведены все статусы: tauri-plugin-shell схлопывает
// ВСЕ варианты `scope::Error` в одно `ProgramNotAllowed` (commands.rs, настоящая причина
// печатается лишь под `#[cfg(debug_assertions)]`). Различать «нет бинаря» и «запретил
// scope» по тексту ошибки — значит регексить чужие сообщения. Вместо этого берём второй,
// независимый сигнал: наличие файла в PATH (Rust-команда `locate_executables`). Статус
// выводится из ПАРЫ сигналов, строки ошибок не разбираются нигде.

import type { TargetSource } from "../terminalTargets/types";

// Найден ли исполняемый файл в PATH процесса Sendoff.
//
// Формулировка намеренно про PATH, а не про систему: у GUI-запуска PATH урезанный
// (ровно поэтому lib.rs дотягивает ~/.local/bin), поэтому «не найден» НЕ означает
// «не установлен» — программа может стоять и быть невидимой этому процессу.
export type ExecutableLocation =
  | { kind: "found"; path?: string }
  | { kind: "not-found" };

// Чем кончился реальный продуктовый вызов listTargets().
export type DiscoveryOutcome =
  | { kind: "ok"; targets: DiagnosticTarget[] }
  | { kind: "failed"; message: string };

// Строка таргета в отчёте. Хендл здесь не для красоты: единственный случившийся отказ
// у 2-го пользователя был отказом ВАЛИДАТОРА send-пути (herdr отдавал pane_id
// `w657cefe818690a-1`, манифест ждал `wK:p1`), а discovery при этом проходил успешно.
// Discovery-команды herdr валидаторов не имеют вовсе и такой отказ показать не могут.
// Хендл в отчёте делает несовпадение формата видимым глазами — без пробной отправки,
// которая была бы спамом в живого агента.
export interface DiagnosticTarget {
  primary: string;
  handle: string;
}

export type ProviderStatus =
  | "ready" // discovery прошёл; targets может быть и пустым — это валидное «ничего не запущено»
  | "not-found" // бинаря нет в PATH Sendoff И discovery не прошёл
  | "error"; // бинарь виден, но discovery упал — scope, версия CLI, сам провайдер

export interface ProviderDiagnostic {
  source: TargetSource;
  label: string;
  executable: string;
  location: ExecutableLocation;
  status: ProviderStatus;
  targets: DiagnosticTarget[];
  // Сырое сообщение провайдера, как пришло. Не парсится и не переписывается.
  detail?: string;
}

export interface AppDiagnostic {
  name: string;
  version: string;
  tauriVersion: string;
  identifier: string;
  // null = не Linux либо версию достать не удалось. Пустой строкой не подменяем:
  // «неизвестно» и «пусто» в отчёте читаются по-разному.
  webkitVersion: string | null;
  dataDir: string | null;
  userAgent: string;
}

export interface Diagnostics {
  app: AppDiagnostic;
  providers: ProviderDiagnostic[];
}
