import { describe, expect, test } from "bun:test";
import { formatChord, matchShortcut, matchesChord, type ShortcutEvent } from "./shortcuts";

function key(
  code: string,
  modifiers: Partial<Omit<ShortcutEvent, "code">> = {},
): ShortcutEvent {
  return {
    code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe("shortcut matching", () => {
  test("requires exact equality of every modifier", () => {
    const ctrlPageDown = { code: "PageDown", ctrl: true };

    expect(matchesChord(key("PageDown", { ctrlKey: true }), ctrlPageDown)).toBe(true);
    expect(matchesChord(key("PageDown", { metaKey: true }), ctrlPageDown)).toBe(true);
    expect(
      matchesChord(key("PageDown", { ctrlKey: true, shiftKey: true }), ctrlPageDown),
    ).toBe(false);
    expect(
      matchesChord(key("PageDown", { ctrlKey: true, altKey: true }), ctrlPageDown),
    ).toBe(false);
  });

  test("finds a command by each chord in its defaults list", () => {
    expect(matchShortcut(key("Tab", { ctrlKey: true }), "global")?.id).toBe("next-tab");
    expect(matchShortcut(key("PageDown", { ctrlKey: true }), "global")?.id).toBe(
      "next-tab",
    );
    expect(matchShortcut(key("Tab", { ctrlKey: true, shiftKey: true }), "global")?.id).toBe(
      "previous-tab",
    );
    expect(matchShortcut(key("PageUp", { ctrlKey: true }), "global")?.id).toBe(
      "previous-tab",
    );
  });

  test("does not match tab switching when Ctrl+Shift+PageDown moves the tab", () => {
    expect(
      matchShortcut(key("PageDown", { ctrlKey: true, shiftKey: true }), "global")?.id,
    ).toBe("move-tab-right");
  });
});

describe("shortcut labels", () => {
  test("formats physical key codes for people", () => {
    const cases = [
      [{ code: "KeyB" }, "B"],
      [{ code: "Comma" }, ","],
      [{ code: "Slash" }, "/"],
      [{ code: "Period" }, "."],
      [{ code: "PageDown" }, "PgDn"],
      [{ code: "PageUp" }, "PgUp"],
      [{ code: "Enter" }, "Enter"],
      [{ code: "Tab" }, "Tab"],
    ] as const;

    for (const [chord, label] of cases) {
      expect(formatChord(chord)).toBe(label);
    }
  });

  test("orders modifiers as Ctrl, Alt, Shift, then key", () => {
    expect(formatChord({ code: "KeyB", ctrl: true, alt: true, shift: true })).toBe(
      "Ctrl+Alt+Shift+B",
    );
  });
});
