import { describe, test, expect } from "bun:test";
import { useEditorStore } from "./editorStore";
import type { Tab, TabGroup, Workspace } from "./editorStore";

// hydrate — единственное место, где можно повредить ЧУЖУЮ базу: bootstrap старой формы,
// отвалившиеся workspace, ссылки табов на исчезнувшие группы, архив. У 2-го пользователя
// там его работа. Проверяем инварианты, а не «всё подряд».

const h = () => useEditorStore.getState().hydrate;
const s = () => useEditorStore.getState();

function tab(id: string, extra: Partial<Tab> = {}): Tab {
  return {
    id,
    title: id,
    content: "",
    createdAt: 0,
    updatedAt: 0,
    titleSource: "auto",
    workspaceId: "w1",
    ...extra,
  };
}

function ws(id: string, name = id): Workspace {
  return { id, name, createdAt: 0 };
}

function group(id: string, workspaceId: string): TabGroup {
  return { id, name: id, color: "accent", collapsed: false, workspaceId, createdAt: 0 };
}

describe("hydrate", () => {
  test("легаси-база без workspaces → создаётся Default, все табы в нём", () => {
    // workspaceId отсутствует (форма до workspaces) — не должен потерять таб.
    h()([tab("t1", { workspaceId: undefined as unknown as string })], "t1", 1, [], null, [], []);
    const st = s();
    expect(st.workspaces).toHaveLength(1);
    expect(st.workspaces[0].name).toBe("Default");
    expect(st.tabs).toHaveLength(1);
    expect(st.tabs[0].workspaceId).toBe(st.workspaces[0].id);
    expect(st.activeTabId).toBe("t1");
    expect(st.isHydrated).toBe(true);
  });

  test("таб с указателем на исчезнувший workspace → уезжает в первый, не теряется", () => {
    h()([tab("t1", { workspaceId: "gone" })], "t1", 1, [ws("w1")], "w1", [], []);
    expect(s().tabs.find((t) => t.id === "t1")!.workspaceId).toBe("w1");
  });

  test("группа, чей workspace не дожил → выкинута, groupId у таба снят", () => {
    const g = group("g1", "wDead"); // workspace не в списке
    h()([tab("t1", { workspaceId: "w1", groupId: "g1" })], "t1", 1, [ws("w1")], "w1", [g], []);
    const st = s();
    expect(st.tabGroups).toHaveLength(0);
    expect(st.tabs.find((t) => t.id === "t1")!.groupId).toBeUndefined();
  });

  test("инвариант pin ⊕ group: закреплённый таб теряет groupId, группа жива за счёт второго", () => {
    const g = group("g1", "w1");
    h()(
      [
        tab("t1", { workspaceId: "w1", groupId: "g1", pinned: true }),
        tab("t2", { workspaceId: "w1", groupId: "g1" }),
      ],
      "t1",
      2,
      [ws("w1")],
      "w1",
      [g],
      [],
    );
    const st = s();
    const t1 = st.tabs.find((t) => t.id === "t1")!;
    expect(t1.pinned).toBe(true);
    expect(t1.groupId).toBeUndefined(); // пин выигрывает
    expect(st.tabGroups.map((x) => x.id)).toContain("g1"); // t2 ещё в группе
    expect(st.tabs.find((t) => t.id === "t2")!.groupId).toBe("g1");
  });

  test("архив: закрытый таб с dangling workspace и группой → workspace в первый, группа снята", () => {
    h()(
      [tab("t1", { workspaceId: "w1" })],
      "t1",
      1,
      [ws("w1")],
      "w1",
      [],
      [tab("c1", { workspaceId: "gone", groupId: "g1" })],
    );
    const c1 = s().closedTabs.find((t) => t.id === "c1")!;
    expect(c1.workspaceId).toBe("w1"); // группа у закрытых не воскрешается призраком
    expect(c1.groupId).toBeUndefined();
  });

  test("активный workspace пуст → материализуется свежий таб в НЁМ, isHydrated", () => {
    // Активен w2, но табов в нём нет — инвариант «активный непуст».
    h()([tab("t1", { workspaceId: "w1" })], null, 1, [ws("w1"), ws("w2")], "w2", [], []);
    const st = s();
    expect(st.activeWorkspaceId).toBe("w2");
    const inW2 = st.tabs.filter((t) => t.workspaceId === "w2");
    expect(inW2).toHaveLength(1);
    expect(st.activeTabId).toBe(inW2[0].id);
    expect(st.isHydrated).toBe(true);
  });
});

// Закрытие расходилось по трём путям (одиночное, пачечное, cleanup), и cleanup был
// единственным без обрезки групп и очистки выделения. Тесты держат общий эпилог.
describe("эпилог закрытия", () => {
  test("cleanupEmptyTabs: группа, оставшаяся без табов, не переживает уборку", () => {
    h()(
      [tab("keep", { content: "текст" }), tab("e1", { groupId: "g1" }), tab("e2", { groupId: "g1" })],
      "keep", 3, [ws("w1")], "w1", [group("g1", "w1")], [],
    );
    expect(s().tabGroups.map((g) => g.id)).toEqual(["g1"]);

    expect(s().cleanupEmptyTabs()).toBe(2);
    expect(s().tabs.map((t) => t.id)).toEqual(["keep"]);
    expect(s().tabGroups).toEqual([]);
  });

  test("cleanupEmptyTabs: выделение не удерживает id убранных табов", () => {
    h()([tab("keep", { content: "текст" }), tab("e1")], "keep", 2, [ws("w1")], "w1", [], []);
    s().toggleTabSelection("keep");
    s().toggleTabSelection("e1");

    s().cleanupEmptyTabs();
    expect(s().selectedTabIds).toEqual(["keep"]);
  });

  test("closeTab последнего таба: refill создаёт свежий, группа закрытого не остаётся", () => {
    h()([tab("e1", { groupId: "g1" })], "e1", 1, [ws("w1")], "w1", [group("g1", "w1")], []);

    s().closeTab("e1");
    const st = s();
    expect(st.tabs).toHaveLength(1);
    expect(st.tabs[0].id).not.toBe("e1");
    expect(st.tabs[0].workspaceId).toBe("w1");
    expect(st.activeTabId).toBe(st.tabs[0].id);
    expect(st.tabGroups).toEqual([]);
  });
});
