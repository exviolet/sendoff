import { describe, expect, test } from "bun:test";
import {
  assignChord,
  effectiveChords,
  findChordOwner,
  formatChord,
  isValidChord,
  matchShortcut,
  matchesChord,
  resetAllShortcuts,
  resetShortcut,
  sanitizeShortcutOverrides,
  type ShortcutEvent,
  type ShortcutOverrides,
} from "./shortcuts";

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
    expect(matchShortcut(key("Tab", { ctrlKey: true }), "global", {})?.id).toBe("next-tab");
    expect(matchShortcut(key("PageDown", { ctrlKey: true }), "global", {})?.id).toBe(
      "next-tab",
    );
    expect(matchShortcut(key("Tab", { ctrlKey: true, shiftKey: true }), "global", {})?.id).toBe(
      "previous-tab",
    );
    expect(matchShortcut(key("PageUp", { ctrlKey: true }), "global", {})?.id).toBe(
      "previous-tab",
    );
  });

  test("does not match tab switching when Ctrl+Shift+PageDown moves the tab", () => {
    expect(
      matchShortcut(key("PageDown", { ctrlKey: true, shiftKey: true }), "global", {})?.id,
    ).toBe("move-tab-right");
  });
});

describe("shortcut overrides", () => {
  test("effective chords use an override when present and defaults otherwise", () => {
    const overrides: ShortcutOverrides = {
      "new-tab": [{ code: "KeyQ", ctrl: true }],
      "close-tab": [],
    };

    expect(effectiveChords("new-tab", overrides)).toEqual([{ code: "KeyQ", ctrl: true }]);
    expect(effectiveChords("close-tab", overrides)).toEqual([]);
    expect(effectiveChords("open", overrides)).toEqual([{ code: "KeyO", ctrl: true }]);
    expect(matchShortcut(key("KeyQ", { ctrlKey: true }), "global", overrides)?.id).toBe(
      "new-tab",
    );
    expect(matchShortcut(key("KeyN", { ctrlKey: true }), "global", overrides)).toBeUndefined();
  });

  test("finds a chord owner only within the requested scope", () => {
    const chord = { code: "KeyK", ctrl: true };
    const overrides: ShortcutOverrides = {
      bold: [chord],
      "trigger-phrases": [chord],
    };

    expect(findChordOwner(chord, "editor", overrides)?.id).toBe("bold");
    expect(findChordOwner(chord, "global", overrides)?.id).toBe("trigger-phrases");
  });

  test("assigning a busy chord steals it from the previous owner", () => {
    const result = assignChord({}, "close-tab", { code: "KeyN", ctrl: true });

    expect(result).toEqual({
      ok: true,
      stolenFrom: "new-tab",
      overrides: {
        "new-tab": [],
        "close-tab": [
          { code: "KeyW", ctrl: true },
          { code: "KeyN", ctrl: true },
        ],
      },
    });
  });

  test("reset removes one override or all overrides", () => {
    const overrides: ShortcutOverrides = {
      "new-tab": [{ code: "KeyQ", ctrl: true }],
      "close-tab": [{ code: "KeyX", ctrl: true }],
    };

    expect(resetShortcut(overrides, "new-tab")).toEqual({
      "close-tab": [{ code: "KeyX", ctrl: true }],
    });
    expect(resetAllShortcuts()).toEqual({});
  });

  test("modifier-only chords are invalid and cannot be assigned", () => {
    const chord = { code: "ControlLeft", ctrl: true };

    expect(isValidChord(chord)).toBe(false);
    expect(isValidChord({ code: "KeyA", ctrl: true })).toBe(true);
    expect(assignChord({}, "new-tab", chord)).toEqual({
      ok: false,
      reason: "invalid-chord",
    });
  });

  test("cannot steal the last chord that opens shortcut settings", () => {
    expect(assignChord({}, "new-tab", { code: "Slash", ctrl: true })).toEqual({
      ok: false,
      reason: "would-unbind-shortcuts",
      owner: "shortcuts",
    });
  });

  test("sanitization drops unknown ids, non-arrays, and broken chords", () => {
    expect(sanitizeShortcutOverrides({
      unknown: [{ code: "KeyU", ctrl: true }],
      "new-tab": "not-an-array",
      "close-tab": [
        { code: "KeyQ", ctrl: true },
        { code: 42, ctrl: true },
        { code: "KeyW", ctrl: "yes" },
      ],
      open: [{ code: "" }],
      save: [],
      shortcuts: [],
    })).toEqual({
      "close-tab": [{ code: "KeyQ", ctrl: true }],
      save: [],
    });
    expect(sanitizeShortcutOverrides("not-an-object")).toEqual({});
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
