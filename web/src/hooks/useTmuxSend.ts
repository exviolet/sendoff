import { useCallback } from "react";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";

type TmuxTarget =
  | { mode: "active" }
  | { mode: "pane"; pane: string };

interface SendOptions {
  target: TmuxTarget;
  submit: boolean;
}

interface CommandOutput {
  code: number | null;
  stderr: string;
  stdout: string;
}

const BUFFER_NAME = "rewrite-desktop";

function summarizeError(action: string, output: CommandOutput) {
  const detail = output.stderr.trim() || output.stdout.trim() || `код ${output.code ?? "unknown"}`;
  return `${action}: ${detail}`;
}

async function runTmux(args: string[]) {
  const { Command } = await import("@tauri-apps/plugin-shell");
  const output = await Command.create("tmux", args).execute();

  if (output.code !== 0) {
    throw new Error(summarizeError("tmux error", output));
  }

  return output;
}

export interface TmuxPaneInfo {
  paneId: string;
  command: string;
  paneActive: boolean;
}

export interface TmuxWindowInfo {
  index: string;
  name: string;
  windowActive: boolean;
  panes: TmuxPaneInfo[];
}

export interface TmuxSessionInfo {
  name: string;
  windows: TmuxWindowInfo[];
}

// Что picker отдаёт наружу при выборе.
export interface TmuxPickTarget {
  paneId: string;
  session: string;
  window: string;
  label: string;
}

const TARGET_FIELDS = [
  "#{session_name}",
  "#{window_index}",
  "#{window_name}",
  "#{pane_id}",
  "#{pane_active}",
  "#{window_active}",
  "#{pane_current_command}",
].join("\t");

// Читает всю топологию одним вызовом (capability уже разрешает tmux args).
// Бросает при ошибке (tmux не запущен / не Tauri) — UI ловит и показывает empty-state.
export async function listTmuxTargets(): Promise<TmuxSessionInfo[]> {
  if (!isTauri) throw new Error("tmux доступен только в desktop-сборке");

  const output = await runTmux(["list-panes", "-a", "-F", TARGET_FIELDS]);
  const sessions = new Map<string, TmuxSessionInfo>();
  const windows = new Map<string, TmuxWindowInfo>();

  for (const line of output.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [session, windowIndex, windowName, paneId, paneActive, windowActive, command] = line.split("\t");
    if (!session || !paneId) continue;

    let s = sessions.get(session);
    if (!s) {
      s = { name: session, windows: [] };
      sessions.set(session, s);
    }

    const wKey = `${session}\t${windowIndex}`;
    let w = windows.get(wKey);
    if (!w) {
      w = { index: windowIndex, name: windowName, windowActive: windowActive === "1", panes: [] };
      windows.set(wKey, w);
      s.windows.push(w);
    }

    w.panes.push({ paneId, command, paneActive: paneActive === "1" });
  }

  return Array.from(sessions.values());
}

// Резолвит binding {session, window} в живой pane id по имени.
// Окно не запущено / tmux недоступен → null (вызывающий открывает picker).
export async function resolveTmuxBinding(binding: { session: string; window: string }): Promise<string | null> {
  try {
    const sessions = await listTmuxTargets();
    const session = sessions.find((s) => s.name === binding.session);
    const window = session?.windows.find((w) => w.name === binding.window);
    if (!window || window.panes.length === 0) return null;
    const pane = window.panes.find((p) => p.paneActive) ?? window.panes[0];
    return pane.paneId;
  } catch {
    return null;
  }
}

async function resolveTarget(target: TmuxTarget) {
  if (target.mode === "pane") {
    const pane = target.pane.trim();
    if (!pane) throw new Error("Укажите tmux pane id в настройках");
    return pane;
  }

  const output = await runTmux(["display-message", "-p", "#{pane_id}"]);
  const pane = output.stdout.trim();
  if (!pane) throw new Error("tmux не вернул активную pane");
  return pane;
}

export function useTmuxSend() {
  return useCallback(async (text: string, opts: SendOptions) => {
    if (!text) {
      toast("Нечего отправлять в tmux", "info");
      return;
    }

    if (!isTauri) {
      await navigator.clipboard.writeText(text);
      toast(`Скопировано: ${text.length} симв.`, "success");
      return;
    }

    try {
      const pane = await resolveTarget(opts.target);
      await runTmux(["set-buffer", "-b", BUFFER_NAME, "--", text]);
      // -p: bracketed paste, если приложение его запросило (codex/Claude Code).
      // Даёт чёткую границу вставки, иначе TUI глотает следующий Enter как часть пасты.
      await runTmux(["paste-buffer", "-d", "-p", "-b", BUFFER_NAME, "-t", pane]);

      if (opts.submit) {
        // settle-задержка: детерминирует тайминг-эвристику «вставка vs ввод».
        await new Promise((resolve) => setTimeout(resolve, 80));
        await runTmux(["send-keys", "-t", pane, "Enter"]);
      }

      toast(`Отправлено в tmux: ${pane} (${text.length} симв.)`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      toast(`tmux: ${message}`, "error");
    }
  }, []);
}
