import { useCallback } from "react";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";
import {
  TARGET_FIELDS,
  parseTmuxTargets,
  resolveBindingIn,
  type TmuxBindingRef,
  type TmuxResolveResult,
  type TmuxSessionInfo,
} from "../lib/tmuxResolve";

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

// Что picker отдаёт наружу при выборе.
export interface TmuxPickTarget {
  paneId: string;
  session: string;
  window: string;
  windowId: string;
  label: string;
}

export type {
  TmuxPaneInfo,
  TmuxWindowInfo,
  TmuxSessionInfo,
  TmuxBindingRef,
  TmuxResolveResult,
} from "../lib/tmuxResolve";

// Читает всю топологию одним вызовом (capability уже разрешает tmux args).
// Бросает при ошибке (tmux не запущен / не Tauri) — UI ловит и показывает empty-state.
export async function listTmuxTargets(): Promise<TmuxSessionInfo[]> {
  if (!isTauri) throw new Error("tmux доступен только в desktop-сборке");

  const output = await runTmux(["list-panes", "-a", "-F", TARGET_FIELDS]);
  return parseTmuxTargets(output.stdout);
}

// Тонкая обёртка: топология из tmux + чистый резолв (см. lib/tmuxResolve.ts).
export async function resolveTmuxBinding(binding: TmuxBindingRef): Promise<TmuxResolveResult> {
  try {
    return resolveBindingIn(await listTmuxTargets(), binding);
  } catch {
    return { ok: false, reason: "not-found" };
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
