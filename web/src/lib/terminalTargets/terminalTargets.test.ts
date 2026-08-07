import { describe, test, expect } from "bun:test";
import { describeBinding, sameBinding } from "./index";
import { asArray, asRecord, asString, describeError, parseResult } from "./shell";
import type { TabBinding } from "./types";

const herdr: TabBinding = { source: "herdr", paneId: "wK:p1", workspace: "rw", tab: "claude" };
const orca: TabBinding = { source: "orca", worktree: "wt", titleHint: "claude" };
const tmux: TabBinding = { source: "tmux", session: "work", window: "claude", windowId: "@1" };

describe("sameBinding: сравниваются СТАБИЛЬНЫЕ поля, не хендлы", () => {
  test("разные источники никогда не совпадают", () => {
    expect(sameBinding(herdr, orca)).toBe(false);
    expect(sameBinding(orca, tmux)).toBe(false);
  });

  test("herdr: сменившийся pane_id не мешает узнать свою цель", () => {
    expect(sameBinding(herdr, { ...herdr, paneId: "wK:p9" })).toBe(true);
  });

  test("herdr: другая пара лейблов — другая цель", () => {
    expect(sameBinding(herdr, { ...herdr, tab: "codex" })).toBe(false);
  });

  test("tmux: сменившийся windowId не мешает, другое имя окна — мешает", () => {
    expect(sameBinding(tmux, { ...tmux, windowId: "@7" })).toBe(true);
    expect(sameBinding(tmux, { ...tmux, window: "shell" })).toBe(false);
  });

  test("orca: titleHint участвует в сравнении", () => {
    expect(sameBinding(orca, { ...orca, titleHint: "codex" })).toBe(false);
  });
});

describe("describeBinding: подпись всегда с источником", () => {
  test("все три источника", () => {
    expect(describeBinding(herdr)).toBe("herdr:rw/claude");
    expect(describeBinding(tmux)).toBe("tmux:work:claude");
    expect(describeBinding(orca).startsWith("orca:")).toBe(true);
  });
});

// Ровно та дыра, из-за которой сбой у 2-го пользователя оказался нерасследуемым:
// tauri-plugin-shell отклоняет промис СТРОКОЙ, а не Error.
describe("describeError: причина не должна теряться", () => {
  test("Error → message", () => {
    expect(describeError(new Error("herdr error: agent_not_found"))).toBe("herdr error: agent_not_found");
  });

  test("строка из Tauri-шелла проходит как есть, пробелы срезаются", () => {
    expect(describeError("  program not allowed  ")).toBe("program not allowed");
  });

  test("пусто во всех видах → честная заглушка, а не «undefined» в тосте", () => {
    for (const v of [undefined, null, "", "   ", new Error("")]) {
      expect(describeError(v)).toBe("ошибка без описания");
    }
  });

  test("объект сериализуется", () => {
    expect(describeError({ code: 1 })).toBe('{"code":1}');
  });

  test("циклическая ссылка и бросающий getter не роняют функцию", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const throwing = {};
    Object.defineProperty(throwing, "x", { get() { throw new Error("boom"); }, enumerable: true });
    expect(typeof describeError(cyclic)).toBe("string");
    expect(typeof describeError(throwing)).toBe("string");
  });
});

// Вывод CLI приходит как unknown: провайдеры обязаны сузить его, а не верить форме.
describe("сужение вывода CLI", () => {
  test("parseResult достаёт result", () => {
    expect(parseResult('{"id":"x","result":{"agents":[]}}')).toEqual({ agents: [] });
  });

  test("не-JSON, пустой вывод и result не-объект → null, без исключения", () => {
    expect(parseResult("usage: herdr ...")).toBeNull();
    expect(parseResult("")).toBeNull();
    expect(parseResult('{"id":"x"}')).toBeNull();
    expect(parseResult('{"id":"x","result":"строка"}')).toBeNull();
  });

  test("asRecord/asString/asArray отсекают чужие типы вместо падения", () => {
    expect(asRecord(null)).toBeNull();
    expect(asRecord(42)).toBeNull();
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asString(42)).toBe("");
    expect(asString("ok")).toBe("ok");
    expect(asArray("не массив")).toEqual([]);
    expect(asArray([1, 2])).toEqual([1, 2]);
  });
});
