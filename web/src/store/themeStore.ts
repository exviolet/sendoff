import { create } from "zustand";
import { isTauri } from "../lib/platform";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface ThemeStore {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  hydrate: (theme: Theme) => void;
}

let systemDark: boolean = (() => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return true;
})();

function resolve(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: "dark",
  resolvedTheme: resolve("dark"),

  toggleTheme: () =>
    set((s) => {
      const next: Theme =
        s.theme === "dark" ? "light" : s.theme === "light" ? "system" : "dark";
      return { theme: next, resolvedTheme: resolve(next) };
    }),

  setTheme: (theme) => set({ theme, resolvedTheme: resolve(theme) }),

  hydrate: (theme) => set({ theme, resolvedTheme: resolve(theme) }),
}));

function applySystemChange(isDark: boolean) {
  systemDark = isDark;
  const { theme } = useThemeStore.getState();
  if (theme === "system") {
    useThemeStore.setState({ resolvedTheme: isDark ? "dark" : "light" });
  }
}

// Browser: CSS media query
if (!isTauri && typeof window !== "undefined" && window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => applySystemChange(mq.matches));
}

// Tauri: native OS/GTK theme via Tauri window API
if (isTauri) {
  (async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const current = await win.theme();
      if (current === "dark" || current === "light") {
        applySystemChange(current === "dark");
      }
      await win.onThemeChanged(({ payload }) => {
        applySystemChange(payload === "dark");
      });
    } catch {
      // Fallback: keep matchMedia-initialized value
    }
  })();
}
