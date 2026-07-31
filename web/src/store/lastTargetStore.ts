import { create } from "zustand";
import type { TargetSource } from "../lib/terminalTargets";

// Последний выбранный в пикере таргет — второе звено цепочки Explicit → Last → Modal.
//
// Намеренно in-memory (НЕ персистится): хендлы эфемерны у tmux (@id сбрасывается
// рестартом сервера) и Orca (term_… живёт сессию). Персистентная привязка — это
// `Tab.binding`, у неё стабильные дескрипторы и живой резолв.
//
// `source` обязателен: без него хендл двусмыслен — "%3" валиден для tmux, "wK:p1"
// для herdr, и отправка ушла бы не тем провайдером.
export interface LastTargetRef {
  source: TargetSource;
  handle: string;
  label: string;
}

interface LastTargetStore {
  lastTarget: LastTargetRef | null;
  setLastTarget: (target: LastTargetRef) => void;
}

export const useLastTargetStore = create<LastTargetStore>((set) => ({
  lastTarget: null,
  setLastTarget: (lastTarget) => set({ lastTarget }),
}));
