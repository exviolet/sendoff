import { resolveHerdrCoreTarget } from "../herdrCoreResolve";
import { sameBinding } from "./index";
import type { TabBinding, TerminalTarget } from "./types";

// null: привязка неоднозначна — не заменять её Last/Active/первой строкой.
// -1: цель отсутствует — обычный fallback пикера остаётся доступен.
export function boundTargetIndex(rows: TerminalTarget[], binding: TabBinding): number | null {
  if (binding.source !== "herdr-core") {
    return rows.findIndex((r) => sameBinding(binding, r.binding));
  }
  const targets = rows.flatMap((r) => r.binding.source === "herdr-core" ? [r.binding] : []);
  const resolution = resolveHerdrCoreTarget(targets, binding);
  if (resolution.kind === "ambiguous") return null;
  if (resolution.kind === "not-found") return -1;
  return rows.findIndex((r) => r.source === "herdr-core" && r.handle === resolution.handle);
}
