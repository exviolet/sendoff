import { useCallback } from "react";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";
import type { OrcaBinding } from "../store/editorStore";

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

async function runOrca(args: string[]): Promise<CommandOutput> {
  const { Command } = await import("@tauri-apps/plugin-shell");
  const output = await Command.create("orca-ide", args).execute();

  if (output.code !== 0) {
    throw new Error(summarizeError("orca error", output));
  }

  return output;
}

// --- defensive JSON narrowing (orca-ide --json вывод приходит как unknown) ---

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseResult(stdout: string): Record<string, unknown> | null {
  try {
    return asRecord(asRecord(JSON.parse(stdout) as unknown)?.result);
  } catch {
    return null;
  }
}

export interface OrcaAgentTarget {
  handle: string;
  worktreePath: string;
  displayName: string;
  title: string;
  agentType: string;
  state: string;
  promptPreview: string;
  isActive: boolean;
}

// Собрать список агентских таргетов: `worktree ps` даёт семантику агента
// (agentType/state/prompt/paneKey), `terminal list` — send-хендл (term_…).
// Джоин по paneKey === `${tabId}:${leafId}`.
export async function listOrcaAgentTargets(): Promise<OrcaAgentTarget[]> {
  if (!isTauri) throw new Error("Orca доступен только в desktop-сборке");

  const [psOut, listOut] = await Promise.all([
    runOrca(["worktree", "ps", "--json"]),
    runOrca(["terminal", "list", "--json"]),
  ]);

  const listResult = parseResult(listOut.stdout);
  const byPaneKey = new Map<string, { handle: string; title: string; worktreePath: string }>();
  for (const raw of asArray(listResult?.terminals)) {
    const term = asRecord(raw);
    if (!term) continue;
    const handle = asString(term.handle);
    const tabId = asString(term.tabId);
    if (!handle || !tabId) continue;
    byPaneKey.set(`${tabId}:${asString(term.leafId)}`, {
      handle,
      title: asString(term.title),
      worktreePath: asString(term.worktreePath),
    });
  }

  const psResult = parseResult(psOut.stdout);
  const targets: OrcaAgentTarget[] = [];
  for (const rawWt of asArray(psResult?.worktrees)) {
    const wt = asRecord(rawWt);
    if (!wt) continue;
    const worktreePath = asString(wt.path);
    const displayName = asString(wt.displayName) || worktreePath;
    const isActive = wt.isActive === true;
    for (const rawAgent of asArray(wt.agents)) {
      const agent = asRecord(rawAgent);
      if (!agent) continue;
      const term = byPaneKey.get(asString(agent.paneKey));
      if (!term) continue; // агент без резолвимого терминала — пропуск
      targets.push({
        handle: term.handle,
        worktreePath,
        displayName,
        title: term.title,
        agentType: asString(agent.agentType) || "agent",
        state: asString(agent.state),
        promptPreview: asString(agent.prompt),
        isActive,
      });
    }
  }
  return targets;
}

// Резолв привязки в send-хендл живьём. Ровно 1 совпадение → хендл; 0 или ≥2 → null
// (вызывающий откроет picker). Хендлы эфемерны, поэтому резолвим каждый раз.
export async function resolveOrcaBinding(binding: OrcaBinding): Promise<string | null> {
  try {
    const targets = await listOrcaAgentTargets();
    const matches = targets.filter(
      (t) =>
        (t.worktreePath === binding.worktree || t.displayName === binding.worktree) &&
        (!binding.titleHint || t.title === binding.titleHint),
    );
    return matches.length === 1 ? matches[0].handle : null;
  } catch {
    return null;
  }
}

export function useOrcaSend() {
  return useCallback(async (text: string, opts: SendOptions) => {
    if (!text) {
      toast("Нечего отправлять в Orca", "info");
      return;
    }

    if (!isTauri) {
      await navigator.clipboard.writeText(text);
      toast(`Скопировано: ${text.length} симв.`, "success");
      return;
    }

    try {
      // Orca `terminal send` шлёт \n сырым = Enter (ранняя отправка). Обёртка в
      // bracketed-paste маркеры держит многострочник одним буфером; отдельный
      // --enter сабмитит разом. Аналог tmux `paste-buffer -p`.
      const wrapped = `\x1b[200~${text}\x1b[201~`;
      await runOrca(["terminal", "send", "--terminal", opts.handle, "--text", wrapped, "--json"]);

      if (opts.submit) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        await runOrca(["terminal", "send", "--terminal", opts.handle, "--enter", "--json"]);
      }

      toast(`Отправлено в Orca (${text.length} симв.)`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      toast(`Orca: ${message}`, "error");
    }
  }, []);
}
