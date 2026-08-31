import { createWithEqualityFn as create } from "zustand/traditional";

export const REFERENCE_DEFAULT_WIDTH = 320;
export const REFERENCE_MIN_WIDTH = 280;
export const REFERENCE_MAX_WIDTH_RESERVE = 200;

export function clampReferenceWidth(width: number): number {
  const max = Math.max(
    REFERENCE_MIN_WIDTH,
    (typeof window !== "undefined" ? window.innerWidth : 1600) -
      REFERENCE_MAX_WIDTH_RESERVE,
  );
  return Math.min(Math.max(width, REFERENCE_MIN_WIDTH), max);
}

interface ReferenceStore {
  text: string;
  width: number;
  setText: (text: string) => void;
  setWidth: (width: number) => void;
  clear: () => void;
  hydrate: (data: { text: string; width: number }) => void;
}

export const useReferenceStore = create<ReferenceStore>((set) => ({
  text: "",
  width: REFERENCE_DEFAULT_WIDTH,
  setText: (text) => set({ text }),
  setWidth: (width) => set({ width: clampReferenceWidth(width) }),
  clear: () => set({ text: "" }),
  hydrate: ({ text, width }) =>
    set({ text, width: clampReferenceWidth(width) }),
}));
