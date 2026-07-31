// Резолв herdr-привязки в живой pane_id. Чистая функция без Tauri — как tmuxResolve,
// чтобы критический путь «куда уедет промпт» проверялся без запуска приложения.

export interface HerdrTargetRef {
  paneId: string;
  workspace: string;
  tab: string;
}

// Достаточно структурного минимума: полный HerdrAgentTarget сюда тащить незачем.
export interface HerdrAgentRef {
  paneId: string;
  workspace: string;
  tab: string;
}

export type HerdrResolution =
  | { kind: "ok"; paneId: string }
  | { kind: "not-found" }
  | { kind: "ambiguous"; count: number };

// Резолвит привязку в живой pane_id.
//
// В отличие от tmux @id и orca term_… , herdr persist'ит pane_id в session.json —
// привязка переживает рестарт сервера и ребут. Но публичные номера панелей
// ПЕРЕИСПОЛЬЗУЮТСЯ после закрытия (next_public_pane_number + освобождение), поэтому
// одного paneId мало: закрыл панель, открыл новую — та получит тот же "wK:p1", и
// промпт уехал бы чужому агенту. Ровно баг 2026-07-10, только на других id.
//
// Инвариант: НИКОГДА не угадывать при неоднозначности — переспросить. Лейблы herdr
// не уникальны (две вкладки «codex» в одном workspace — норма agentic-флоу).
export function resolveHerdrTarget(
  agents: HerdrAgentRef[],
  binding: HerdrTargetRef,
): HerdrResolution {
  // 1. Точное попадание: paneId И оба лейбла. Сверка лейблов — защита от
  //    переиспользованного номера панели.
  const exact = agents.find(
    (a) => a.paneId === binding.paneId && a.workspace === binding.workspace && a.tab === binding.tab,
  );
  if (exact) return { kind: "ok", paneId: exact.paneId };

  // 2. Fallback по паре лейблов: панель пересоздали, номер сменился — привязка
  //    самочинится, но только если цель однозначна.
  const byLabel = agents.filter((a) => a.workspace === binding.workspace && a.tab === binding.tab);
  if (byLabel.length > 1) return { kind: "ambiguous", count: byLabel.length };
  if (byLabel.length === 1) return { kind: "ok", paneId: byLabel[0].paneId };

  return { kind: "not-found" };
}
