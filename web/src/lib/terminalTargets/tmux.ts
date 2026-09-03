import { isTauri } from "../platform";
import { TARGET_FIELDS, parseTmuxTargets, resolveBindingIn } from "../tmuxResolve";
import type { TmuxSessionInfo } from "../tmuxResolve";
import { runScoped } from "./shell";
import type { Resolution, TabBinding, TerminalProvider, TerminalTarget } from "./types";

// ВАЖНО: значение обязано совпадать с литералом "-b sendoff-desktop" в
// capabilities/default.json (entry tmux-set-buffer / tmux-paste-buffer). Переименуешь
// здесь — validator в манифесте отвергнет команду, а сообщение укажет не туда (см.
// комментарий про herdr pane_id в shell.ts). Менять только вместе.
const BUFFER_NAME = "sendoff-desktop";

// tmux заскоуплен по подкомандам (НЕ args:true): каждая — отдельный entry в манифесте,
// поэтому зовём по имени entry, а не через один общий "tmux". Раньше args:true давал
// доступ к run-shell и send-keys с произвольным текстом в любую pane — цепочка XSS→RCE.
const run = (name: string, args: string[], target?: string) =>
  runScoped(name, args, "tmux error", target);

async function listSessions(): Promise<TmuxSessionInfo[]> {
  if (!isTauri) throw new Error("tmux is available only in the desktop build");
  const output = await run("tmux-list-panes", ["list-panes", "-a", "-F", TARGET_FIELDS]);
  return parseTmuxTargets(output.stdout);
}

export const tmuxProvider: TerminalProvider = {
  source: "tmux",
  label: "tmux",
  executable: "tmux",

  async listTargets(): Promise<TerminalTarget[]> {
    const sessions = await listSessions();
    const multiSession = sessions.length > 1;
    const targets: TerminalTarget[] = [];

    for (const s of sessions) {
      for (const w of s.windows) {
        const winLabel = w.name || `window ${w.index}`;
        for (const p of w.panes) {
          targets.push({
            source: "tmux",
            key: `tmux:${p.paneId}`,
            handle: p.paneId,
            binding: { source: "tmux", session: s.name, window: w.name, windowId: w.id },
            primary: multiSession ? `${s.name}:${winLabel}` : winLabel,
            secondary: p.command,
            meta: p.paneId,
            isActive: p.paneActive && w.windowActive,
          });
        }
      }
    }
    return targets;
  },

  async resolve(binding: TabBinding): Promise<Resolution> {
    if (binding.source !== "tmux") return { kind: "not-found" };
    try {
      const res = resolveBindingIn(await listSessions(), binding);
      if (res.ok) return { kind: "ok", handle: res.paneId };
      // resolveBindingIn не считает совпадения, а только различает исходы — точного
      // count у tmux нет. 2 = «больше одного», этого хватает для формулировки тоста.
      return res.reason === "ambiguous" ? { kind: "ambiguous", count: 2 } : { kind: "not-found" };
    } catch {
      return { kind: "not-found" };
    }
  },

  async send(handle: string, text: string, submit: boolean): Promise<string> {
    await run("tmux-set-buffer", ["set-buffer", "-b", BUFFER_NAME, "--", text]);
    // -p: bracketed paste, если приложение его запросило (codex/Claude Code).
    // Даёт чёткую границу вставки, иначе TUI глотает следующий Enter как часть пасты.
    await run("tmux-paste-buffer", ["paste-buffer", "-d", "-p", "-b", BUFFER_NAME, "-t", handle], handle);

    if (submit) {
      // settle-задержка: детерминирует тайминг-эвристику «вставка vs ввод».
      await new Promise((resolve) => setTimeout(resolve, 80));
      // Только литерал Enter: send-keys с произвольным текстом заскоуплен ВНЕ манифеста
      // (иначе — набор любой команды в чужую pane). Текст едет исключительно пастой выше.
      await run("tmux-send-enter", ["send-keys", "-t", handle, "Enter"], handle);
    }
    return handle;
  },

  describe(binding: TabBinding): string {
    return binding.source === "tmux" ? `${binding.session}:${binding.window}` : "";
  },
};
