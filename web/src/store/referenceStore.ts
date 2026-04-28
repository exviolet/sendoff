import { createWithEqualityFn as create } from "zustand/traditional";

interface ReferenceStore {
  text: string;
  setText: (text: string) => void;
  clear: () => void;
  hydrate: (text: string) => void;
}

export const useReferenceStore = create<ReferenceStore>((set) => ({
  text: "",
  setText: (text) => set({ text }),
  clear: () => set({ text: "" }),
  hydrate: (text) => set({ text }),
}));
