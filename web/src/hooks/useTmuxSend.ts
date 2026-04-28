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
      await runTmux(["paste-buffer", "-d", "-b", BUFFER_NAME, "-t", pane]);

      if (opts.submit) {
        await runTmux(["send-keys", "-t", pane, "Enter"]);
      }

      toast(`Отправлено в tmux: ${pane} (${text.length} симв.)`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      toast(`tmux: ${message}`, "error");
    }
  }, []);
}
