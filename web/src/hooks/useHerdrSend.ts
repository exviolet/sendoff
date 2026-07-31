import { useCallback } from "react";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";
import type { HerdrBinding } from "../store/editorStore";
import { resolveHerdrTarget, type HerdrResolution } from "../lib/herdrResolve";

interface CommandOutput {
  code: number | null;
  stderr: string;
  stdout: string;
}

interface SendOptions {
  handle: string;
  submit: boolean;
}

function summarizeError(action: string, output: CommandOutput) {
  const detail = output.stderr.trim() || output.stdout.trim() || `код ${output.code ?? "unknown"}`;
  return `${action}: ${detail}`;
}

// Первый аргумент Command.create — ИМЯ scoped-команды из allowlist (capabilities),
// а НЕ бинарь. Бинарь (`herdr`) и разрешённые args берутся из entry по имени.
async function runHerdr(scopedName: string, args: string[]): Promise<CommandOutput> {
  const { Command } = await import("@tauri-apps/plugin-shell");
  const output = await Command.create(scopedName, args).execute();

  if (output.code !== 0) {
    throw new Error(summarizeError("herdr error", output));
  }

  return output;
}

// --- defensive JSON narrowing (вывод herdr приходит как unknown) ---

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// ВАЖНО: у herdr НЕТ флага `--json` — вывод и так JSON, а лишний флаг роняет команду
// с `usage:` (проверено live). Форма: {"id":…,"result":{"type":…,"<коллекция>":[…]}}.
function parseResult(stdout: string): Record<string, unknown> | null {
  try {
    return asRecord(asRecord(JSON.parse(stdout) as unknown)?.result);
  } catch {
    return null;
  }
}

export interface HerdrAgentTarget {
  paneId: string;      // "wK:p1" — и хендл отправки, и часть привязки
  workspace: string;   // лейбл workspace
  tab: string;         // лейбл вкладки
  agentType: string;   // "claude" | "codex" | …
  status: string;      // idle | working | blocked | done | unknown
  cwd: string;
  titleHint: string;   // terminal_title_stripped — ТОЛЬКО для превью, меняется постоянно
  isActive: boolean;   // focused
}

// Собрать список агентских таргетов. В отличие от Orca джоин не обязателен для хендла
// (`agent list` уже отдаёт `pane_id`), но нужен для человекочитаемых лейблов: в
// `agent list` лежат только id (`wK`, `wK:t1`), а имена — в `workspace list` / `tab list`.
export async function listHerdrAgentTargets(): Promise<HerdrAgentTarget[]> {
  if (!isTauri) throw new Error("Herdr доступен только в desktop-сборке");

  const [agentsOut, wsOut, tabsOut] = await Promise.all([
    runHerdr("herdr-agent-list", ["agent", "list"]),
    runHerdr("herdr-workspace-list", ["workspace", "list"]),
    runHerdr("herdr-tab-list", ["tab", "list"]),
  ]);

  const wsLabels = new Map<string, string>();
  for (const raw of asArray(parseResult(wsOut.stdout)?.workspaces)) {
    const ws = asRecord(raw);
    if (!ws) continue;
    const id = asString(ws.workspace_id);
    if (id) wsLabels.set(id, asString(ws.label) || id);
  }

  const tabLabels = new Map<string, string>();
  for (const raw of asArray(parseResult(tabsOut.stdout)?.tabs)) {
    const tab = asRecord(raw);
    if (!tab) continue;
    const id = asString(tab.tab_id);
    if (id) tabLabels.set(id, asString(tab.label) || id);
  }

  const targets: HerdrAgentTarget[] = [];
  for (const raw of asArray(parseResult(agentsOut.stdout)?.agents)) {
    const agent = asRecord(raw);
    if (!agent) continue;
    const paneId = asString(agent.pane_id);
    const agentType = asString(agent.agent);
    // Панель без распознанного агента таргетом не считается (решение автора: голые
    // шеллы не привязываем — для них есть tmux-путь).
    if (!paneId || !agentType) continue;

    const workspaceId = asString(agent.workspace_id);
    const tabId = asString(agent.tab_id);
    targets.push({
      paneId,
      workspace: wsLabels.get(workspaceId) || workspaceId,
      tab: tabLabels.get(tabId) || tabId,
      agentType,
      status: asString(agent.agent_status) || "unknown",
      cwd: asString(agent.cwd),
      titleHint: asString(agent.terminal_title_stripped),
      isActive: agent.focused === true,
    });
  }
  return targets;
}

// Резолв привязки в pane_id. Логика — чистая функция в lib/herdrResolve.ts (проверяема
// без Tauri, как tmuxResolve); здесь только доставка данных.
export async function resolveHerdrBinding(binding: HerdrBinding): Promise<HerdrResolution> {
  try {
    return resolveHerdrTarget(await listHerdrAgentTargets(), binding);
  } catch {
    return { kind: "not-found" };
  }
}

export function useHerdrSend() {
  return useCallback(async (text: string, opts: SendOptions) => {
    if (!text) {
      toast("Нечего отправлять в Herdr", "info");
      return;
    }

    if (!isTauri) {
      await navigator.clipboard.writeText(text);
      toast(`Скопировано: ${text.length} симв.`, "success");
      return;
    }

    try {
      // В отличие от tmux и Orca здесь НЕТ ни ручной bracketed-paste обёртки, ни
      // settle-таймера: `agent prompt` — первоклассная отправка промпта, herdr сам
      // держит многострочник одним буфером. Обёртка `\x1b[200~` уехала бы в промпт
      // литералом. `--wait` не используем — блокировать UI ради ничего.
      if (opts.submit) {
        await runHerdr("herdr-agent-prompt", ["agent", "prompt", opts.handle, text]);
      } else {
        await runHerdr("herdr-pane-send-text", ["pane", "send-text", opts.handle, text]);
      }

      toast(`Отправлено в Herdr (${text.length} симв.)`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      toast(`Herdr: ${message}`, "error");
    }
  }, []);
}
