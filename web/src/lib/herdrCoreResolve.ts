import type { Resolution, TabBinding } from "./terminalTargets/types";

export type HerdrCoreBinding = Extract<TabBinding, { source: "herdr-core" }>;

export const HERDR_CORE_AGENTS = new Set([
  "codex", "claude-code", "opencode", "antigravity", "pi",
]);

export function parseHerdrCoreTargets(stdout: string): HerdrCoreBinding[] {
  const data: unknown = JSON.parse(stdout);
  if (!data || typeof data !== "object" || !("terminals" in data) || !Array.isArray(data.terminals)) {
    throw new Error("Herdr Core: invalid terminal list");
  }
  return data.terminals.flatMap((value: unknown) => {
    if (!value || typeof value !== "object") return [];
    const t = value as Record<string, unknown>;
    if (t.state !== "live" || typeof t.agent !== "string" || !HERDR_CORE_AGENTS.has(t.agent)
      || typeof t.address !== "string" || !/^t[0-9a-z]+$/.test(t.address)
      || typeof t.where !== "string" || !t.where
      || typeof t.cwd !== "string" || !t.cwd) return [];
    return [{ source: "herdr-core" as const, address: t.address, agent: t.agent, where: t.where, cwd: t.cwd }];
  });
}

export function sameHerdrCoreTarget(a: HerdrCoreBinding, b: HerdrCoreBinding): boolean {
  return a.agent === b.agent && a.where === b.where && a.cwd === b.cwd;
}

export function resolveHerdrCoreTarget(targets: HerdrCoreBinding[], binding: HerdrCoreBinding): Resolution {
  const matches = targets.filter((t) => sameHerdrCoreTarget(t, binding));
  const exact = matches.filter((t) => t.address === binding.address);
  if (exact.length === 1) return { kind: "ok", handle: exact[0].address };
  if (matches.length > 1) return { kind: "ambiguous", count: matches.length };
  return matches.length === 1 ? { kind: "ok", handle: matches[0].address } : { kind: "not-found" };
}
