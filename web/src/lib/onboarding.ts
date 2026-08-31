// Решение «показывать ли первый запуск». Чистая логика без Tauri и без IndexedDB —
// проверяется тестами, потому что ошибка здесь стоит дорого в обе стороны: показать
// онбординг человеку с накопленными табами так же плохо, как не показать новому.

import type { Tab, TabGroup, Workspace } from "../store/editorStore";
import { DEFAULT_WORKSPACE_NAME } from "../store/editorStore";

// Версия, а не флаг: онбординг когда-нибудь изменится, и тогда понадобится отличить
// «проходил старый» от «не проходил вовсе». Флаг такого различия не даёт.
export const ONBOARDING_VERSION = 1;

// Признаки того, что базой уже пользовались. Список ЯВНЫЙ и закрытый: «любой ключ в
// meta» был бы контрактом-ловушкой — первый же служебный ключ, записанный будущей
// фичей до первого запуска, молча подавил бы онбординг у нового пользователя.
//
// Чего здесь намеренно НЕТ:
// - пресетов и trigger phrases: они сидируются дефолтами (DEFAULT_PRESETS,
//   DEFAULT_PHRASES) и есть у любого, кто открыл приложение хоть раз;
// - самого факта «табы существуют»: hydrate создаёт пустой «Untitled 1» и workspace
//   «Default», когда активного таба нет, а saveSession их персистит. Поэтому признаком
//   служит СОДЕРЖИМОЕ таба, а не его наличие.
export interface UserDataSignals {
  tabs: Tab[];
  closedTabs: Tab[];
  workspaces: Workspace[];
  tabGroups: TabGroup[];
}

export function hasExistingUserData({
  tabs,
  closedTabs,
  workspaces,
  tabGroups,
}: UserDataSignals): boolean {
  // Архив непуст только если пользователь что-то закрывал.
  if (closedTabs.length > 0) return true;
  // Группы вручную создаются, автоматически — никогда.
  if (tabGroups.length > 0) return true;
  // Второй workspace или переименованный первый — тоже ручное действие.
  if (workspaces.length > 1) return true;
  if (workspaces.length === 1 && workspaces[0].name !== DEFAULT_WORKSPACE_NAME) return true;

  return tabs.some(
    (tab) =>
      tab.content.trim() !== "" ||
      // "auto" — заголовок, выданный приложением («Untitled 3»); всё остальное значит,
      // что таб назвал человек или он приехал из файла.
      (tab.titleSource !== undefined && tab.titleSource !== "auto") ||
      tab.binding !== undefined ||
      tab.pinned === true ||
      tab.groupId !== undefined,
  );
}

export interface OnboardingGate {
  storageError: string | null;
  onboardingVersion: number | null;
  data: UserDataSignals;
}

export type OnboardingDecision =
  | { kind: "show" }
  // Пользователь существующий, но ключа у него нет (фича новее его базы) — тихо
  // проставить версию, ничего не показывая.
  | { kind: "backfill"; version: number }
  | { kind: "skip" };

export function decideOnboarding({
  storageError,
  onboardingVersion,
  data,
}: OnboardingGate): OnboardingDecision {
  // Чтение провалено: показывать поверх StorageErrorBanner нельзя — база могла быть
  // полной, и «добро пожаловать» поверх нечитаемых табов читается как потеря данных.
  // Записывать версию тоже нельзя: запись при проваленном чтении запрещена целиком.
  if (storageError) return { kind: "skip" };

  if (onboardingVersion !== null) return { kind: "skip" };

  return hasExistingUserData(data)
    ? { kind: "backfill", version: ONBOARDING_VERSION }
    : { kind: "show" };
}
