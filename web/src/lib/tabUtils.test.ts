import { describe, test, expect } from "bun:test";
import {
  arrangeTabs,
  canCleanupTab,
  makeAutoTitle,
  makeTab,
  normalizeTab,
  partitionGroups,
  partitionPinned,
  pruneGroups,
  reorderTabs,
  stepTab,
  visibleTabsOf,
} from "./tabUtils";
import type { Tab, TabGroup } from "../store/editorStore";

const WS = "ws-1";

function tab(id: string, extra: Partial<Tab> & Record<string, unknown> = {}): Tab {
  return {
    id,
    title: id,
    content: "",
    createdAt: 0,
    updatedAt: 0,
    workspaceId: WS,
    ...extra,
  } as Tab;
}

// normalizeTab — единственная функция, которая читает ЧУЖУЮ базу. Ошибка здесь не
// «неудобно», а «у второго пользователя пропали привязки». Проверяем обе стороны:
// что легаси поднимается и что старые поля стираются.
describe("normalizeTab: чтение старых баз", () => {
  test("tmux-привязка старой формы поднимается в binding", () => {
    const out = normalizeTab(tab("t", { tmuxBinding: { session: "work", window: "claude", windowId: "@1" } }));
    expect(out.binding).toEqual({ source: "tmux", session: "work", window: "claude", windowId: "@1" });
    expect("tmuxBinding" in out).toBe(false);
  });

  test("orca-привязка старой формы", () => {
    const out = normalizeTab(tab("t", { orcaBinding: { worktree: "wt", titleHint: "claude" } }));
    expect(out.binding).toEqual({ source: "orca", worktree: "wt", titleHint: "claude" });
    expect("orcaBinding" in out).toBe(false);
  });

  test("herdr-привязка старой формы", () => {
    const out = normalizeTab(tab("t", { herdrBinding: { paneId: "wK:p1", workspace: "rw", tab: "claude" } }));
    expect(out.binding).toEqual({ source: "herdr", paneId: "wK:p1", workspace: "rw", tab: "claude" });
    expect("herdrBinding" in out).toBe(false);
  });

  test("порченые данные с тремя привязками разом: приоритет herdr → orca → tmux, лишние стёрты", () => {
    const out = normalizeTab(tab("t", {
      tmuxBinding: { session: "s", window: "w" },
      orcaBinding: { worktree: "wt" },
      herdrBinding: { paneId: "wK:p1", workspace: "rw", tab: "claude" },
    }));
    expect(out.binding?.source).toBe("herdr");
    expect("tmuxBinding" in out).toBe(false);
    expect("orcaBinding" in out).toBe(false);
  });

  test("новая форма не трогается", () => {
    const binding = { source: "tmux", session: "work", window: "claude" } as const;
    expect(normalizeTab(tab("t", { binding })).binding).toEqual(binding);
  });

  test("привязки нет — поле не появляется (а не undefined в базе)", () => {
    expect("binding" in normalizeTab(tab("t"))).toBe(false);
  });

  test("isDirty из эпохи ручного Ctrl+S стирается, контент цел", () => {
    const out = normalizeTab(tab("t", { isDirty: true, content: "важный текст" }));
    expect("isDirty" in out).toBe(false);
    expect(out.content).toBe("важный текст");
  });

  test("titleSource выводится из имени, если его нет: Untitled N = auto", () => {
    expect(normalizeTab(tab("t", { title: "Untitled 7" })).titleSource).toBe("auto");
    expect(normalizeTab(tab("t", { title: "Мой промпт" })).titleSource).toBe("manual");
  });

  test("ручное имя НЕ перезаписывается содержимым", () => {
    const out = normalizeTab(tab("t", { title: "Моё имя", titleSource: "manual", content: "первая строка" }));
    expect(out.title).toBe("Моё имя");
  });

  test("авто-имя пересчитывается из содержимого", () => {
    const out = normalizeTab(tab("t", { title: "Untitled 3", content: "  первая строка  \nвторая" }));
    expect(out.title).toBe("первая строка");
  });
});

describe("makeAutoTitle", () => {
  test("берётся первая НЕПУСТАЯ строка, пробелы схлопываются", () => {
    expect(makeAutoTitle("\n\n   \n  привет   мир  \nещё", "fallback")).toBe("привет мир");
  });

  test("пустой контент → fallback", () => {
    expect(makeAutoTitle("   \n\n ", "Untitled 5")).toBe("Untitled 5");
  });

  test("длинная строка обрезается с многоточием", () => {
    const out = makeAutoTitle("я".repeat(100), "f");
    expect(out).toHaveLength(48);
    expect(out.endsWith("...")).toBe(true);
  });
});

describe("порядок полосы: пины и группы", () => {
  test("пины уходят влево, относительный порядок сохраняется", () => {
    const tabs = [tab("a"), tab("b", { pinned: true }), tab("c"), tab("d", { pinned: true })];
    expect(partitionPinned(tabs).map((t) => t.id)).toEqual(["b", "d", "a", "c"]);
  });

  test("группа стягивается в непрерывный run на позицию своего первого таба", () => {
    const tabs = [tab("a", { groupId: "g" }), tab("b"), tab("c", { groupId: "g" })];
    expect(partitionGroups(tabs).map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  test("закреплённый таб в run не втягивается (пин ⊕ группа), порядок не рвётся", () => {
    const tabs = [tab("p", { pinned: true, groupId: "g" }), tab("a", { groupId: "g" }), tab("b")];
    const out = partitionGroups(tabs).map((t) => t.id);
    expect(out).toEqual(["p", "a", "b"]);
  });

  test("arrangeTabs держит оба инварианта разом", () => {
    const tabs = [tab("a", { groupId: "g" }), tab("b"), tab("p", { pinned: true }), tab("c", { groupId: "g" })];
    expect(arrangeTabs(tabs).map((t) => t.id)).toEqual(["p", "a", "c", "b"]);
  });

  test("две группы не перемешиваются", () => {
    const tabs = [tab("a", { groupId: "g1" }), tab("x", { groupId: "g2" }), tab("b", { groupId: "g1" })];
    expect(partitionGroups(tabs).map((t) => t.id)).toEqual(["a", "b", "x"]);
  });
});

function group(id: string, collapsed = false): TabGroup {
  return { id, name: id, color: "accent", collapsed, workspaceId: WS, createdAt: 0 };
}

describe("видимость и чистка", () => {
  test("члены свёрнутой группы скрыты из полосы, но НЕ удалены", () => {
    const tabs = [tab("a", { groupId: "g" }), tab("b")];
    expect(visibleTabsOf(tabs, [group("g", true)], WS).map((t) => t.id)).toEqual(["b"]);
    expect(tabs).toHaveLength(2);
  });

  test("чужой workspace не попадает в видимые", () => {
    const tabs = [tab("a"), tab("b", { workspaceId: "другой" })];
    expect(visibleTabsOf(tabs, [], WS).map((t) => t.id)).toEqual(["a"]);
  });

  test("группа без табов исчезает, живая остаётся", () => {
    const tabs = [tab("a", { groupId: "g1" })];
    expect(pruneGroups(tabs, [group("g1"), group("g2")]).map((g) => g.id)).toEqual(["g1"]);
  });

  test("canCleanupTab: пустой авто-таб — да; с текстом, закреплённый или переименованный — нет", () => {
    expect(canCleanupTab(tab("a", { title: "Untitled 1", content: "   " }))).toBe(true);
    expect(canCleanupTab(tab("a", { title: "Untitled 1", content: "текст" }))).toBe(false);
    expect(canCleanupTab(tab("a", { title: "Untitled 1", pinned: true }))).toBe(false);
    expect(canCleanupTab(tab("a", { title: "Моё имя", titleSource: "manual" }))).toBe(false);
  });
});

describe("stepTab: одно нажатие — ровно одно изменение", () => {
  const groups = [group("g")];

  test("шаг вправо меняется местами с соседом", () => {
    const tabs = [tab("a"), tab("b")];
    expect(stepTab(tabs, [], "a", 1)?.map((t) => t.id)).toEqual(["b", "a"]);
  });

  test("граница группы — сама по себе шаг: меняется ТОЛЬКО членство", () => {
    const tabs = [tab("x"), tab("c", { groupId: "g" })];
    const out = stepTab(tabs, groups, "x", 1)!;
    expect(out.map((t) => t.id)).toEqual(["x", "c"]);
    expect(out.find((t) => t.id === "x")?.groupId).toBe("g");
  });

  test("выход из группы — тоже только членство", () => {
    const tabs = [tab("c", { groupId: "g" }), tab("x")];
    const out = stepTab(tabs, groups, "c", 1)!;
    expect(out.find((t) => t.id === "c")?.groupId).toBeUndefined();
  });

  // Документированная дорожка: X B [C D] E → … → X [C D] B E → X [C D] E B,
  // и столько же шагов влево возвращают ровно исходное состояние.
  test("путь сквозь группу полностью обратим", () => {
    const start = [tab("x"), tab("b"), tab("c", { groupId: "g" }), tab("d", { groupId: "g" }), tab("e")];
    let tabs = start;
    for (let i = 0; i < 4; i++) tabs = stepTab(tabs, groups, "b", 1) ?? tabs;
    expect(arrangeTabs(tabs).map((t) => t.id)).toEqual(["x", "c", "d", "b", "e"]);
    for (let i = 0; i < 4; i++) tabs = stepTab(tabs, groups, "b", -1) ?? tabs;
    expect(JSON.stringify(arrangeTabs(tabs))).toBe(JSON.stringify(arrangeTabs(start)));
  });

  // Асимметрия по краю: слева соседа нет, поэтому выйти из группы влево нечем.
  // Не баг — «шаг» определён через соседа, а его не существует.
  test("на левом краю таб внутри группы остаётся в ней (шага влево нет)", () => {
    const tabs = [tab("x", { groupId: "g" }), tab("b", { groupId: "g" })];
    expect(stepTab(tabs, groups, "x", -1)).toBeNull();
  });

  test("через границу закреплённых шаг не переносит", () => {
    const tabs = [tab("p", { pinned: true }), tab("a")];
    expect(stepTab(tabs, [], "a", -1)).toBeNull();
  });

  test("таб, спрятанный в свёрнутой группе, не двигается", () => {
    const tabs = [tab("h", { groupId: "g" }), tab("b")];
    expect(stepTab(tabs, [group("g", true)], "h", 1)).toBeNull();
  });

  test("на краю полосы — no-op", () => {
    const tabs = [tab("a"), tab("b")];
    expect(stepTab(tabs, [], "b", 1)).toBeNull();
    expect(stepTab(tabs, [], "a", -1)).toBeNull();
  });
});

describe("reorderTabs: перенос броском", () => {
  // Тот самый дефект: вставка «перед целью» на шаге вправо возвращает таб на его же
  // место, и перетаскивание выглядит неработающим. Дефект жил с 2026-08-07.
  test("бросок на соседа СПРАВА реально двигает таб", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(reorderTabs(tabs, "a", "b")?.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  test("бросок на соседа слева работал и раньше — не сломан", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(reorderTabs(tabs, "c", "b")?.map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  test("бросок на последний таб уносит в конец, на первый — в начало", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(reorderTabs(tabs, "a", "c")?.map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(reorderTabs(tabs, "c", "a")?.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  test("бросок на себя и на несуществующий таб — null", () => {
    const tabs = [tab("a"), tab("b")];
    expect(reorderTabs(tabs, "a", "a")).toBeNull();
    expect(reorderTabs(tabs, "a", "zzz")).toBeNull();
    expect(reorderTabs(tabs, "zzz", "a")).toBeNull();
  });

  // Членство берётся у ЦЕЛИ, а не у соседа по индексу вставки: вправо таб встаёт после
  // цели, и на позиции вставки стоит уже следующий таб — с чужой группой.
  test("бросок вправо на член группы вводит таб в ЕЁ группу, а не в следующую", () => {
    const tabs = [tab("a"), tab("c", { groupId: "g" }), tab("z", { groupId: "g2" })];
    const out = reorderTabs(tabs, "a", "c")!;
    expect(out.find((t) => t.id === "a")?.groupId).toBe("g");
  });

  test("бросок наружу выводит таб из группы", () => {
    const tabs = [tab("x"), tab("c", { groupId: "g" })];
    const out = reorderTabs(tabs, "c", "x")!;
    expect(out.find((t) => t.id === "c")?.groupId).toBeUndefined();
  });

  test("закреплённый таб группу не меняет", () => {
    const tabs = [tab("p", { pinned: true }), tab("c", { groupId: "g" })];
    const out = reorderTabs(tabs, "p", "c")!;
    expect(out.find((t) => t.id === "p")?.groupId).toBeUndefined();
  });

  test("исходный массив не мутируется", () => {
    const tabs = [tab("a"), tab("b")];
    reorderTabs(tabs, "a", "b");
    expect(tabs.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("порядок после arrangeTabs остаётся законным", () => {
    const tabs = [tab("a"), tab("b"), tab("c", { groupId: "g" }), tab("d", { groupId: "g" })];
    const out = arrangeTabs(reorderTabs(tabs, "a", "c")!);
    expect(out.map((t) => t.id)).toEqual(["b", "c", "a", "d"]);
    expect(out.filter((t) => t.groupId === "g").map((t) => t.id)).toEqual(["c", "a", "d"]);
  });
});

describe("makeTab", () => {
  test("новый таб пустой, авто-титульный и без легаси-полей", () => {
    const t = makeTab(3, WS) as Tab & Record<string, unknown>;
    expect(t.title).toBe("Untitled 3");
    expect(t.content).toBe("");
    expect(t.titleSource).toBe("auto");
    expect("isDirty" in t).toBe(false);
  });
});
