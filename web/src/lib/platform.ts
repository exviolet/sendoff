export const isTauri =
  typeof window !== "undefined" && "__TAURI__" in window;
