import { isTauri } from "../platform";
import { resolveHerdrTarget, type HerdrAgentRef } from "../herdrResolve";
import { runScoped, asArray, asRecord, asString, parseResult } from "./shell";
import type { Resolution, TabBinding, TerminalProvider, TerminalTarget } from "./types";

const run = (name: string, args: string[], target?: string) =>
  runScoped(name, args, "herdr error", target);

interface HerdrAgent extends HerdrAgentRef {
  agentType: string;
  status: string;
  cwd: string;
  titleHint: string;
  isActive: boolean;
}

// В отличие от Orca джоин не нужен ради хендла (`agent list` уже отдаёт pane_id), но
// нужен ради лейблов: в `agent list` только id (wK, wK:t1), имена — в других командах.
async function listAgents(): Promise<HerdrAgent[]> {
  if (!isTauri) throw new Error("Herdr is available only in the desktop build");

  const [agentsOut, wsOut, tabsOut] = await Promise.all([
    run("herdr-agent-list", ["agent", "list"]),
    run("herdr-workspace-list", ["workspace", "list"]),
    run("herdr-tab-list", ["tab", "list"]),
  ]);

  const wsLabels = new Map<string, string>();
  for (const raw of asArray(parseResult(wsOut.stdout)?.workspaces)) {
    const ws = asRecord(raw);
    const id = ws && asString(ws.workspace_id);
    if (id) wsLabels.set(id, asString(ws.label) || id);
  }

  const tabLabels = new Map<string, string>();
  for (const raw of asArray(parseResult(tabsOut.stdout)?.tabs)) {
    const tab = asRecord(raw);
    const id = tab && asString(tab.tab_id);
    if (id) tabLabels.set(id, asString(tab.label) || id);
  }

  const agents: HerdrAgent[] = [];
  for (const raw of asArray(parseResult(agentsOut.stdout)?.agents)) {
    const agent = asRecord(raw);
    if (!agent) continue;
    const paneId = asString(agent.pane_id);
    const agentType = asString(agent.agent);
    // Панель без распознанного агента таргетом не считается: голые шеллы не
    // привязываем (решение автора), для них есть tmux-путь.
    if (!paneId || !agentType) continue;

    const workspaceId = asString(agent.workspace_id);
    const tabId = asString(agent.tab_id);
    agents.push({
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
  return agents;
}

export const herdrProvider: TerminalProvider = {
  source: "herdr",
  label: "Herdr",
  executable: "herdr",

  async listTargets(): Promise<TerminalTarget[]> {
    const agents = await listAgents();
    return agents.map((a) => ({
      source: "herdr" as const,
      key: `herdr:${a.paneId}`,
      handle: a.paneId,
      binding: { source: "herdr" as const, paneId: a.paneId, workspace: a.workspace, tab: a.tab },
      primary: `${a.workspace}/${a.tab}`,
      secondary: a.titleHint,
      meta: a.cwd.split("/").pop(),
      status: a.status,
      isActive: a.isActive,
    }));
  },

  async resolve(binding: TabBinding): Promise<Resolution> {
    if (binding.source !== "herdr") return { kind: "not-found" };
    try {
      const res = resolveHerdrTarget(await listAgents(), binding);
      return res.kind === "ok" ? { kind: "ok", handle: res.paneId } : res;
    } catch {
      return { kind: "not-found" };
    }
  },

  async send(handle: string, text: string, submit: boolean): Promise<string> {
    // Ни ручной bracketed-paste обёртки, ни settle-таймера: `agent prompt` —
    // атомарная отправка промпта (так и назван в release-notes 0.7.5), herdr сам
    // держит многострочник одним буфером и сам сабмитит. Обёртка \x1b[200~, нужная
    // tmux и Orca, здесь уехала бы в промпт литералом.
    if (submit) {
      await run("herdr-agent-prompt", ["agent", "prompt", handle, text], handle);
    } else {
      await run("herdr-pane-send-text", ["pane", "send-text", handle, text], handle);
    }
    return handle;
  },

  describe(binding: TabBinding): string {
    return binding.source === "herdr" ? `${binding.workspace}/${binding.tab}` : "";
  },
};
