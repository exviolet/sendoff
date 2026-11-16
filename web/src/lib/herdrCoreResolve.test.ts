import { expect, test } from "bun:test";
import { parseHerdrCoreTargets, resolveHerdrCoreTarget, type HerdrCoreBinding } from "./herdrCoreResolve";

const binding: HerdrCoreBinding = { source: "herdr-core", address: "t1", agent: "codex", where: "project / 1", cwd: "/project" };

test("показывает только пять поддержанных живых локальных агентов", () => {
  const agents = ["codex", "claude-code", "opencode", "antigravity", "pi", "zsh", "claude", "gemini", "hermes"];
  const terminals = agents.map((agent) => ({ ...binding, agent, state: "live" }));
  terminals.push({ ...binding, state: "finished" }, { ...binding, address: "remote/t1", state: "live" });
  expect(parseHerdrCoreTargets(JSON.stringify({ terminals })).map((t) => t.agent))
    .toEqual(agents.slice(0, 5));
});

test("невалидный ответ не маскируется пустым списком", () => {
  expect(() => parseHerdrCoreTargets("oops")).toThrow();
  expect(() => parseHerdrCoreTargets("{}")).toThrow();
});

test("точный адрес требует совпадения всех полей", () => {
  expect(resolveHerdrCoreTarget([binding], binding)).toEqual({ kind: "ok", handle: "t1" });
  expect(resolveHerdrCoreTarget([{ ...binding, agent: "pi" }], binding)).toEqual({ kind: "not-found" });
  expect(resolveHerdrCoreTarget([{ ...binding, cwd: "/other" }], binding)).toEqual({ kind: "not-found" });
});

test("смена адреса восстанавливается только однозначно", () => {
  const moved = { ...binding, address: "t2" };
  expect(resolveHerdrCoreTarget([moved], binding)).toEqual({ kind: "ok", handle: "t2" });
  expect(resolveHerdrCoreTarget([moved, { ...moved, address: "t3" }], binding))
    .toEqual({ kind: "ambiguous", count: 2 });
});
