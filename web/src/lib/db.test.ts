import { describe, test, expect, beforeEach } from "bun:test";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { closeDB, loadSession, saveSession, type SessionSnapshot } from "./db";
import type { Tab } from "../store/editorStore";

// Единственный слой, где можно реально навредить чужим данным: у 2-го пользователя
// в этой базе лежит его работа. Проверяем round-trip и апгрейд старых версий на
// настоящем IndexedDB (fake-indexeddb — та же спецификация, без браузера).

const DB_NAME = "rewrite-db";

async function wipe() {
  // Соединение обязано быть закрыто: открытое БЛОКИРУЕТ deleteDatabase, и весь
  // файл повисает на первом же тесте после round-trip'а.
  await closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function tab(id: string, extra: Partial<Tab> = {}): Tab {
  return {
    id,
    title: id,
    content: `текст ${id}`,
    createdAt: 1,
    updatedAt: 2,
    workspaceId: "ws-1",
    ...extra,
  } as Tab;
}

function snapshot(over: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    tabs: [tab("a"), tab("b")],
    activeTabId: "a",
    tabCounter: 2,
    workspaces: [{ id: "ws-1", name: "Default", createdAt: 0 }],
    activeWorkspaceId: "ws-1",
    tabGroups: [],
    presets: [],
    triggerPhrases: [],
    theme: "dark",
    fontSize: 13,
    wordWrap: true,
    tmuxAutoSubmit: true,
    fontFamily: "",
    phraseInsertMode: "prepend",
    referenceText: "",
    referenceWidth: 320,
    ...over,
  };
}

beforeEach(wipe);

describe("round-trip сессии", () => {
  test("что записали, то и прочитали", async () => {
    const snap = snapshot({
      fontSize: 18,
      fontFamily: "JetBrainsMono Nerd Font",
      phraseInsertMode: "cursor",
      theme: "light",
      referenceText: "заметка",
      tabGroups: [{ id: "g", name: "Группа", color: "blue", collapsed: true, workspaceId: "ws-1", createdAt: 0 }],
      tabs: [tab("a", { groupId: "g", pinned: true }), tab("b")],
    });
    await saveSession(snap);
    const out = await loadSession();

    expect(out.tabs.map((t) => t.id)).toEqual(["a", "b"]);
    expect(out.tabs[0].groupId).toBe("g");
    expect(out.tabs[0].pinned).toBe(true);
    expect(out.tabGroups[0].collapsed).toBe(true);
    expect(out.fontSize).toBe(18);
    expect(out.fontFamily).toBe("JetBrainsMono Nerd Font");
    expect(out.phraseInsertMode).toBe("cursor");
    expect(out.theme).toBe("light");
    expect(out.referenceText).toBe("заметка");
  });

  test("порядок табов держится ключом tabOrder, а не порядком выдачи стора", async () => {
    // getAll отдаёт по ключу (алфавитно) — без tabOrder полоса перетасовалась бы.
    await saveSession(snapshot({ tabs: [tab("z"), tab("a"), tab("m")], activeTabId: "z" }));
    expect((await loadSession()).tabs.map((t) => t.id)).toEqual(["z", "a", "m"]);
  });

  test("удалённые табы не воскресают (стор переписывается целиком)", async () => {
    await saveSession(snapshot({ tabs: [tab("a"), tab("b"), tab("c")] }));
    await saveSession(snapshot({ tabs: [tab("a")], activeTabId: "a" }));
    expect((await loadSession()).tabs.map((t) => t.id)).toEqual(["a"]);
  });

  test("привязки переживают запись и чтение", async () => {
    const binding = { source: "herdr", paneId: "wK:p1", workspace: "rw", tab: "claude" } as const;
    await saveSession(snapshot({ tabs: [tab("a", { binding })] }));
    expect((await loadSession()).tabs[0].binding).toEqual(binding);
  });
});

describe("пустая и порченая база", () => {
  test("чтение пустой базы даёт рабочие дефолты, а не падение", async () => {
    const out = await loadSession();
    expect(out.tabs).toEqual([]);
    expect(out.activeTabId).toBeNull();
    expect(out.theme).toBe("dark");
    expect(out.fontSize).toBe(13);
    expect(out.wordWrap).toBe(true);
    expect(out.phraseInsertMode).toBe("prepend");
  });

  test("незнакомое значение phraseInsertMode → исходное поведение, не сбой", async () => {
    await saveSession(snapshot());
    const db = await openDB(DB_NAME, 6);
    await db.put("meta", { мусор: true } as never, "phraseInsertMode");
    db.close();
    expect((await loadSession()).phraseInsertMode).toBe("prepend");
  });

  test("tabOrder со ссылками на удалённые табы не создаёт дыр", async () => {
    await saveSession(snapshot({ tabs: [tab("a")], activeTabId: "a" }));
    const db = await openDB(DB_NAME, 6);
    await db.put("meta", ["призрак", "a"], "tabOrder");
    db.close();
    const out = await loadSession();
    expect(out.tabs.map((t) => t.id)).toEqual(["a"]);
    expect(out.tabs.every(Boolean)).toBe(true);
  });
});

describe("апгрейд старых версий базы", () => {
  test("v5 → v6: табы 2-го пользователя целы, стор групп создан пустым", async () => {
    // Старая база: нет tabGroups, у табов нет groupId, зато есть isDirty.
    const legacy = await openDB(DB_NAME, 5, {
      upgrade(db) {
        db.createObjectStore("tabs", { keyPath: "id" });
        db.createObjectStore("presets", { keyPath: "id" });
        db.createObjectStore("meta");
        db.createObjectStore("triggerPhrases", { keyPath: "id" });
        db.createObjectStore("workspaces", { keyPath: "id" });
      },
    });
    await legacy.put("tabs", {
      id: "old", title: "Старый таб", content: "накопленная работа",
      isDirty: true, createdAt: 1, updatedAt: 2, workspaceId: "ws-1",
      tmuxBinding: { session: "work", window: "claude" },
    } as never);
    await legacy.put("meta", ["old"], "tabOrder");
    legacy.close();

    const out = await loadSession();
    expect(out.tabs).toHaveLength(1);
    expect(out.tabs[0].content).toBe("накопленная работа");
    expect(out.tabGroups).toEqual([]);
  });

  test("v1 → v6: база без workspaces и triggerPhrases открывается", async () => {
    const ancient = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore("tabs", { keyPath: "id" });
        db.createObjectStore("presets", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
    await ancient.put("tabs", { id: "t1", title: "Древний", content: "текст", createdAt: 0, updatedAt: 0 } as never);
    ancient.close();

    const out = await loadSession();
    expect(out.tabs[0].content).toBe("текст");
    expect(out.workspaces).toEqual([]);
    expect(out.triggerPhrases).toEqual([]);
  });
});
