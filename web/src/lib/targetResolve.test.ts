import { describe, test, expect } from "bun:test";
import { resolveHerdrTarget, type HerdrAgentRef } from "./herdrResolve";
import { parseTmuxTargets, resolveBindingIn, type TmuxSessionInfo } from "./tmuxResolve";

// Самый дорогой класс ошибок в проекте: промпт, улетевший НЕ ТОМУ агенту.
// Баг 2026-07-10 — резолв матчил только по имени окна, а два окна `claude` в
// agentic-флоу это норма. Инвариант «при неоднозначности не угадывать, а спросить»
// проверяется здесь, а не глазами на живой топологии.

function agent(paneId: string, workspace: string, tab: string): HerdrAgentRef {
  return { paneId, workspace, tab };
}

describe("herdr: резолв привязки", () => {
  test("точное совпадение id и пары лейблов", () => {
    const agents = [agent("wK:p1", "sendoff", "claude"), agent("wP:p3", "steam", "codex")];
    expect(resolveHerdrTarget(agents, { paneId: "wP:p3", workspace: "steam", tab: "codex" }))
      .toEqual({ kind: "ok", paneId: "wP:p3" });
  });

  test("номер панели переиспользован другим агентом → НЕ отправляем", () => {
    // pane_id персистится, но номера переиспользуются: id совпал, а лейблы чужие.
    const agents = [agent("wK:p1", "другой-проект", "codex")];
    expect(resolveHerdrTarget(agents, { paneId: "wK:p1", workspace: "sendoff", tab: "claude" }))
      .toEqual({ kind: "not-found" });
  });

  test("панель пересоздана: id протух, лейблы уникальны → самочинится", () => {
    const agents = [agent("wK:p7", "sendoff", "claude")];
    expect(resolveHerdrTarget(agents, { paneId: "wK:p1", workspace: "sendoff", tab: "claude" }))
      .toEqual({ kind: "ok", paneId: "wK:p7" });
  });

  test("два одинаковых лейбла и протухший id → ambiguous, а не первый попавшийся", () => {
    const agents = [agent("wK:p7", "steam", "codex"), agent("wK:p9", "steam", "codex")];
    const res = resolveHerdrTarget(agents, { paneId: "wK:p1", workspace: "steam", tab: "codex" });
    expect(res).toEqual({ kind: "ambiguous", count: 2 });
  });

  test("id совпал при дублирующихся лейблах → точное попадание сильнее", () => {
    const agents = [agent("wK:p7", "steam", "codex"), agent("wK:p9", "steam", "codex")];
    expect(resolveHerdrTarget(agents, { paneId: "wK:p9", workspace: "steam", tab: "codex" }))
      .toEqual({ kind: "ok", paneId: "wK:p9" });
  });

  test("агентов нет вовсе", () => {
    expect(resolveHerdrTarget([], { paneId: "wK:p1", workspace: "sendoff", tab: "claude" }))
      .toEqual({ kind: "not-found" });
  });
});

// tmux отдаёт плоские строки с табами; сессия/окно/панель восстанавливаются группировкой.
function tmuxLine(
  session: string, winIndex: string, winId: string, winName: string,
  paneId: string, paneActive: string, winActive: string, cmd: string,
) {
  return [session, winIndex, winId, winName, paneId, paneActive, winActive, cmd].join("\t");
}

describe("tmux: разбор топологии", () => {
  test("строки группируются в сессии → окна → панели", () => {
    const out = [
      tmuxLine("work", "0", "@1", "claude", "%1", "1", "1", "node"),
      tmuxLine("work", "0", "@1", "claude", "%2", "0", "1", "zsh"),
      tmuxLine("work", "1", "@2", "shell", "%3", "1", "0", "zsh"),
      tmuxLine("side", "0", "@5", "claude", "%9", "1", "1", "node"),
    ].join("\n");

    const sessions = parseTmuxTargets(out);
    expect(sessions.map((s) => s.name)).toEqual(["work", "side"]);
    expect(sessions[0].windows).toHaveLength(2);
    expect(sessions[0].windows[0].panes.map((p) => p.paneId)).toEqual(["%1", "%2"]);
  });

  test("мусорные и пустые строки игнорируются, а не роняют разбор", () => {
    const out = ["", "   ", "битая строка без табов", tmuxLine("work", "0", "@1", "w", "%1", "1", "1", "zsh")].join("\n");
    expect(parseTmuxTargets(out)).toHaveLength(1);
  });

  test("одинаковый window_id в разных сессиях не склеивает окна", () => {
    // @id уникален в пределах сервера, но проверяем, что группировка не по индексу.
    const out = [
      tmuxLine("a", "0", "@1", "claude", "%1", "1", "1", "node"),
      tmuxLine("b", "0", "@2", "claude", "%2", "1", "1", "node"),
    ].join("\n");
    const sessions = parseTmuxTargets(out);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].windows[0].panes[0].paneId).toBe("%1");
    expect(sessions[1].windows[0].panes[0].paneId).toBe("%2");
  });
});

function sessions(): TmuxSessionInfo[] {
  return [{
    name: "work",
    windows: [
      { id: "@1", index: "0", name: "claude", windowActive: true, panes: [
        { paneId: "%1", command: "zsh", paneActive: false },
        { paneId: "%2", command: "node", paneActive: true },
      ]},
      { id: "@2", index: "1", name: "claude", windowActive: false, panes: [
        { paneId: "%3", command: "node", paneActive: true },
      ]},
    ],
  }];
}

describe("tmux: резолв привязки", () => {
  test("точное попадание по window_id + имени, берётся АКТИВНАЯ панель", () => {
    expect(resolveBindingIn(sessions(), { session: "work", window: "claude", windowId: "@1" }))
      .toEqual({ ok: true, paneId: "%2" });
  });

  test("два окна с одним именем и без windowId → ambiguous", () => {
    // Ровно баг 2026-07-10: матч по имени выбрал бы первое и отправил не туда.
    expect(resolveBindingIn(sessions(), { session: "work", window: "claude" }))
      .toEqual({ ok: false, reason: "ambiguous" });
  });

  test("@id переиспользован другим окном (имя не сошлось) → уходим в fallback, а не в чужое окно", () => {
    const res = resolveBindingIn(sessions(), { session: "work", window: "shell", windowId: "@1" });
    expect(res).toEqual({ ok: false, reason: "not-found" });
  });

  test("легаси-привязка без windowId резолвится по имени, когда оно уникально", () => {
    const one: TmuxSessionInfo[] = [{
      name: "work",
      windows: [{ id: "@9", index: "0", name: "claude", windowActive: true, panes: [
        { paneId: "%7", command: "node", paneActive: true },
      ]}],
    }];
    expect(resolveBindingIn(one, { session: "work", window: "claude" }))
      .toEqual({ ok: true, paneId: "%7" });
  });

  test("сессии нет", () => {
    expect(resolveBindingIn(sessions(), { session: "нет-такой", window: "claude", windowId: "@1" }))
      .toEqual({ ok: false, reason: "not-found" });
  });

  test("окно без панелей целью не считается", () => {
    const empty: TmuxSessionInfo[] = [{
      name: "work",
      windows: [{ id: "@1", index: "0", name: "claude", windowActive: true, panes: [] }],
    }];
    expect(resolveBindingIn(empty, { session: "work", window: "claude", windowId: "@1" }))
      .toEqual({ ok: false, reason: "not-found" });
  });
});
