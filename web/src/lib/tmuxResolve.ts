// Чистая логика tmux-таргетинга: разбор топологии и резолв привязки таба в pane.
// Без side effects и без Tauri — shell-вызовы живут в lib/terminalTargets/tmux.ts.

export interface TmuxPaneInfo {
  paneId: string;
  command: string;
  paneActive: boolean;
}

export interface TmuxWindowInfo {
  id: string; // #{window_id} — @N, уникален в пределах tmux-сервера
  index: string;
  name: string;
  windowActive: boolean;
  panes: TmuxPaneInfo[];
}

export interface TmuxSessionInfo {
  name: string;
  windows: TmuxWindowInfo[];
}

export interface TmuxBindingRef {
  session: string;
  window: string; // имя окна: отображение + fallback, НЕ уникально
  windowId?: string; // первичный ключ резолва; отсутствует у легаси-привязок
}

export type TmuxResolveResult =
  | { ok: true; paneId: string }
  | { ok: false; reason: "not-found" | "ambiguous" };

// Порядок полей — контракт с parseTmuxTargets. Менять только вместе.
export const TARGET_FIELDS = [
  "#{session_name}",
  "#{window_index}",
  "#{window_id}",
  "#{window_name}",
  "#{pane_id}",
  "#{pane_active}",
  "#{window_active}",
  "#{pane_current_command}",
].join("\t");

export function parseTmuxTargets(stdout: string): TmuxSessionInfo[] {
  const sessions = new Map<string, TmuxSessionInfo>();
  const windows = new Map<string, TmuxWindowInfo>();

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [session, windowIndex, windowId, windowName, paneId, paneActive, windowActive, command] =
      line.split("\t");
    if (!session || !paneId) continue;

    let s = sessions.get(session);
    if (!s) {
      s = { name: session, windows: [] };
      sessions.set(session, s);
    }

    // window_id уникален глобально в пределах сервера — годится как ключ напрямую.
    let w = windows.get(windowId);
    if (!w) {
      w = { id: windowId, index: windowIndex, name: windowName, windowActive: windowActive === "1", panes: [] };
      windows.set(windowId, w);
      s.windows.push(w);
    }

    w.panes.push({ paneId, command, paneActive: paneActive === "1" });
  }

  return Array.from(sessions.values());
}

function pickPane(w: TmuxWindowInfo): TmuxPaneInfo | undefined {
  return w.panes.find((p) => p.paneActive) ?? w.panes[0];
}

// Резолвит привязку в живой pane id.
//
// Имя окна НЕ уникально (в agentic-флоу нормально иметь два окна `claude`), поэтому
// первичный ключ — window_id (@N). Имя остаётся для отображения и как fallback:
// @id сбрасываются при рестарте tmux-сервера, а имя переживает.
//
// Инвариант: НИКОГДА не угадывать при неоднозначности — промпт, улетевший не тому
// агенту, хуже лишнего клика. Несколько окон с одним именем → "ambiguous" → picker.
export function resolveBindingIn(
  sessions: TmuxSessionInfo[],
  binding: TmuxBindingRef,
): TmuxResolveResult {
  const session = sessions.find((s) => s.name === binding.session);
  if (!session) return { ok: false, reason: "not-found" };

  // 1. Точное попадание: @id И имя. Имя сверяем, потому что после рестарта сервера
  //    @id переиспользуется другим окном — иначе текст ушёл бы в чужое окно.
  if (binding.windowId) {
    const exact = session.windows.find(
      (w) => w.id === binding.windowId && w.name === binding.window,
    );
    const pane = exact && pickPane(exact);
    if (pane) return { ok: true, paneId: pane.paneId };
  }

  // 2. Fallback по имени: легаси-привязки без windowId + сброшенные рестартом @id.
  const byName = session.windows.filter((w) => w.name === binding.window && w.panes.length > 0);
  if (byName.length > 1) return { ok: false, reason: "ambiguous" };

  const pane = byName.length === 1 ? pickPane(byName[0]) : undefined;
  return pane ? { ok: true, paneId: pane.paneId } : { ok: false, reason: "not-found" };
}
