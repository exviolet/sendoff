import { herdrProvider } from "./herdr";
import { orcaProvider } from "./orca";
import { tmuxProvider } from "./tmux";
import type { TabBinding, TargetSource, TerminalProvider } from "./types";

export type {
  Resolution,
  TabBinding,
  TargetSource,
  TerminalProvider,
  TerminalTarget,
} from "./types";

// Порядок = порядок секций в пикере, по частоте использования: herdr — daily driver
// (≤3 проектов), Orca — когда проектов больше, tmux — не-агентская работа.
export const PROVIDERS: TerminalProvider[] = [herdrProvider, orcaProvider, tmuxProvider];

const BY_SOURCE: Record<TargetSource, TerminalProvider> = {
  herdr: herdrProvider,
  orca: orcaProvider,
  tmux: tmuxProvider,
};

export function providerBySource(source: TargetSource): TerminalProvider {
  return BY_SOURCE[source];
}

export function providerFor(binding: TabBinding): TerminalProvider {
  return BY_SOURCE[binding.source];
}

// Подпись привязки для бейджей. Здесь же — единственное место, где решается,
// показывать ли источник: раньше каждый бейдж лепил свой префикс по-своему.
export function describeBinding(binding: TabBinding): string {
  return `${binding.source}:${providerFor(binding).describe(binding)}`;
}

// Указывают ли два дескриптора на одну цель. Сравниваем СТАБИЛЬНЫЕ поля, а не хендлы:
// хендл живой и меняется, дескриптор — нет. Нужно, чтобы пикер преселектил строку,
// соответствующую текущей привязке таба.
export function sameBinding(a: TabBinding, b: TabBinding): boolean {
  if (a.source !== b.source) return false;
  if (a.source === "herdr" && b.source === "herdr") {
    return a.workspace === b.workspace && a.tab === b.tab;
  }
  if (a.source === "orca" && b.source === "orca") {
    return a.worktree === b.worktree && a.titleHint === b.titleHint;
  }
  if (a.source === "tmux" && b.source === "tmux") {
    return a.session === b.session && a.window === b.window;
  }
  return false;
}
