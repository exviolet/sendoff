import { create } from "zustand";

export type Theme = "dark" | "light";

interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  hydrate: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: "dark",

  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

  setTheme: (theme) => set({ theme }),

  hydrate: (theme) => set({ theme }),
}));
