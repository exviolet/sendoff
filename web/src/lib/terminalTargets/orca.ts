import { isTauri } from "../platform";
import { runScoped, asArray, asRecord, asString, parseResult } from "./shell";
import type { Resolution, TabBinding, TerminalProvider, TerminalTarget } from "./types";

const run = (name: string, args: string[]) => runScoped(name, args, "orca error");

interface OrcaAgent {
  handle: string;
  worktreePath: string;
  displayName: string;
  title: string;
  agentType: string;
  state: string;
  promptPreview: string;
  isActive: boolean;
}

// `worktree ps` даёт семантику агента (agentType/state/prompt/paneKey), `terminal list` —
// send-хендл (term_…). Джоин по paneKey === `${tabId}:${leafId}`.
async function listAgents(): Promise<OrcaAgent[]> {
  if (!isTauri) throw new Error("Orca доступна только в desktop-сборке");

  const [psOut, listOut] = await Promise.all([
    run("orca-worktree-ps", ["worktree", "ps", "--json"]),
    run("orca-terminal-list", ["terminal", "list", "--json"]),
  ]);

  const byPaneKey = new Map<string, { handle: string; title: string }>();
  for (const raw of asArray(parseResult(listOut.stdout)?.terminals)) {
    const term = asRecord(raw);
    if (!term) continue;
    const handle = asString(term.handle);
    const tabId = asString(term.tabId);
    if (!handle || !tabId) continue;
    byPaneKey.set(`${tabId}:${asString(term.leafId)}`, { handle, title: asString(term.title) });
  }

  const agents: OrcaAgent[] = [];
  for (const rawWt of asArray(parseResult(psOut.stdout)?.worktrees)) {
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
      agents.push({
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
  return agents;
}

export const orcaProvider: TerminalProvider = {
  source: "orca",
  label: "Orca",

  async listTargets(): Promise<TerminalTarget[]> {
    const agents = await listAgents();
    return agents.map((a) => ({
      source: "orca" as const,
      key: `orca:${a.handle}`,
      handle: a.handle,
      binding: { source: "orca" as const, worktree: a.worktreePath, titleHint: a.title },
      primary: `${a.displayName} · ${a.title}`,
      secondary: a.promptPreview,
      meta: a.agentType,
      status: a.state,
      isActive: a.isActive,
    }));
  },

  async resolve(binding: TabBinding): Promise<Resolution> {
    if (binding.source !== "orca") return { kind: "not-found" };
    try {
      const matches = (await listAgents()).filter(
        (a) =>
          (a.worktreePath === binding.worktree || a.displayName === binding.worktree) &&
          (!binding.titleHint || a.title === binding.titleHint),
      );
      if (matches.length === 1) return { kind: "ok", handle: matches[0].handle };
      // Раньше оба исхода схлопывались в null и пользователь не понимал, почему
      // открылся пикер. Инвариант «не угадывать» соблюдался и тогда — но молча.
      return matches.length > 1
        ? { kind: "ambiguous", count: matches.length }
        : { kind: "not-found" };
    } catch {
      return { kind: "not-found" };
    }
  },

  async send(handle: string, text: string, submit: boolean): Promise<string> {
    // `terminal send` шлёт \n сырым = Enter, поэтому многострочник сабмитился бы
    // построчно. Обёртка в bracketed-paste маркеры держит блок одним буфером,
    // отдельный --enter шлёт разом. Аналог tmux `paste-buffer -p`.
    const wrapped = `\x1b[200~${text}\x1b[201~`;
    await run("orca-terminal-send-text", [
      "terminal", "send", "--terminal", handle, "--text", wrapped, "--json",
    ]);

    if (submit) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      await run("orca-terminal-send-enter", [
        "terminal", "send", "--terminal", handle, "--enter", "--json",
      ]);
    }
    return handle;
  },

  describe(binding: TabBinding): string {
    return binding.source === "orca" ? (binding.titleHint ?? binding.worktree) : "";
  },
};
