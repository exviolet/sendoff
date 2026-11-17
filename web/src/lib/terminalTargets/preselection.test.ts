import { expect, test } from "bun:test";
import { boundTargetIndex } from "./preselection";
import type { TerminalTarget, TabBinding } from "./types";

const binding: Extract<TabBinding, { source: "herdr-core" }> = {
  source: "herdr-core", address: "t2", agent: "codex", where: "project / 1", cwd: "/project",
};
const row = (address: string): TerminalTarget => ({
  source: "herdr-core", key: address, handle: address,
  primary: "codex", binding: { ...binding, address },
});

test("точный адрес предвыбирается даже после похожего соседа", () => {
  expect(boundTargetIndex([row("t1"), row("t2")], binding)).toBe(1);
});

test("без точного адреса предвыбор допускается только для единственной цели", () => {
  expect(boundTargetIndex([row("t3")], binding)).toBe(0);
  expect(boundTargetIndex([row("t1"), row("t3")], binding)).toBeNull();
  expect(boundTargetIndex([], binding)).toBe(-1);
});

test("переиспользованный адрес с чужими полями не получает приоритет", () => {
  const reused = { ...row("t2"), binding: { ...binding, cwd: "/other" } };
  expect(boundTargetIndex([reused, row("t3")], binding)).toBe(1);
});
