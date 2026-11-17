import { parseHerdrCoreTargets, resolveHerdrCoreTarget } from "../herdrCoreResolve";
import { describeError, runScoped } from "./shell";
import type { TerminalProvider } from "./types";

async function run(name: string, args: string[], target?: string) {
  try {
    return await runScoped(name, args, "Herdr Core error", target);
  } catch (error) {
    throw new Error(`Herdr Core: check that hc is installed in Sendoff's PATH and Core is running. ${describeError(error)}`);
  }
}

async function listAgents() {
  return parseHerdrCoreTargets((await run("herdr-core-list", ["ls", "--json"])).stdout);
}

export const herdrCoreProvider: TerminalProvider = {
  source: "herdr-core",
  label: "Herdr Core",
  executable: "hc",
  async listTargets() {
    return (await listAgents()).map((binding) => ({
      source: "herdr-core" as const,
      key: `herdr-core:${binding.address}`,
      handle: binding.address,
      binding,
      primary: `${binding.agent} · ${binding.where}`,
      secondary: binding.cwd,
      meta: binding.address,
    }));
  },
  async resolve(binding) {
    if (binding.source !== "herdr-core") return { kind: "not-found" };
    return resolveHerdrCoreTarget(await listAgents(), binding);
  },
  async send(handle, text, submit) {
    if (!submit) throw new Error("Herdr Core requires Auto-submit");
    // Повторная проверка защищает также путь Last и устаревший выбор пикера.
    const matches = (await listAgents()).filter((t) => t.address === handle);
    if (matches.length !== 1) throw new Error("Herdr Core agent not found — pick another target");
    await run("herdr-core-send", ["send", handle, text], handle);
    return handle;
  },
  describe(binding) {
    return binding.source === "herdr-core" ? `${binding.agent} · ${binding.where}` : "";
  },
};
