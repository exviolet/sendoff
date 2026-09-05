import { describe, test, expect } from "bun:test";
import { TOOLBAR_BUTTONS, sanitizeHiddenToolbarButtons } from "./toolbarButtons";

describe("sanitizeHiddenToolbarButtons", () => {
  test("пустой список для всего, что не массив — база хранит что угодно", () => {
    expect(sanitizeHiddenToolbarButtons(undefined)).toEqual([]);
    expect(sanitizeHiddenToolbarButtons(null)).toEqual([]);
    expect(sanitizeHiddenToolbarButtons("presets")).toEqual([]);
    expect(sanitizeHiddenToolbarButtons({ presets: true })).toEqual([]);
  });

  test("незнакомый id отбрасывается, знакомый остаётся", () => {
    expect(sanitizeHiddenToolbarButtons(["presets", "no-such-button", 42, null]))
      .toEqual(["presets"]);
  });

  test("каталог целиком проходит без потерь", () => {
    const all = TOOLBAR_BUTTONS.map((b) => b.id);
    expect(sanitizeHiddenToolbarButtons(all)).toEqual(all);
  });

  test("id кнопок уникальны — иначе тумблер гасил бы две сразу", () => {
    const ids = TOOLBAR_BUTTONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
