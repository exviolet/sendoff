import { openDB, type DBSchema } from "idb";
import type { Tab } from "../store/editorStore";
import type { ReplacePreset } from "../store/presetsStore";
import type { PromptTemplate } from "./promptBuilder";

interface RewriteDB extends DBSchema {
  tabs: {
    key: string;
    value: Tab;
  };
  presets: {
    key: string;
    value: ReplacePreset;
  };
  promptTemplates: {
    key: string;
    value: PromptTemplate;
  };
  meta: {
    key: string;
    value: string | number | boolean;
  };
}

const DB_NAME = "rewrite-db";
const DB_VERSION = 3;

function getDB() {
  return openDB<RewriteDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      // v1: tabs, presets, meta
      if (!db.objectStoreNames.contains("tabs")) {
        db.createObjectStore("tabs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("presets")) {
        db.createObjectStore("presets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }

      // v2: promptTemplates store
      if (!db.objectStoreNames.contains("promptTemplates")) {
        db.createObjectStore("promptTemplates", { keyPath: "id" });
      }

      // v3: add `order` field to existing promptTemplates
      if (oldVersion >= 2 && oldVersion < 3) {
        const store = tx.objectStore("promptTemplates");
        let idx = 0;
        void store.openCursor().then(function iterate(cursor): Promise<void> | undefined {
          if (!cursor) return;
          const value = cursor.value as unknown as { order?: number };
          if (value.order === undefined) {
            value.order = idx++;
            cursor.update(value as unknown as PromptTemplate);
          }
          return cursor.continue().then(iterate);
        });
      }
    },
  });
}

export async function loadSession() {
  const db = await getDB();
  const tabs = await db.getAll("tabs");
  const presets = await db.getAll("presets");
  const promptTemplates = await db.getAll("promptTemplates");
  const activeTabId = (await db.get("meta", "activeTabId")) as string | undefined;
  const tabCounter = (await db.get("meta", "tabCounter")) as number | undefined;
  const theme = (await db.get("meta", "theme")) as string | undefined;
  const fontSize = (await db.get("meta", "fontSize")) as number | undefined;
  const wordWrap = (await db.get("meta", "wordWrap")) as boolean | undefined;
  return {
    tabs, presets, promptTemplates,
    activeTabId: activeTabId ?? null,
    tabCounter: tabCounter ?? 0,
    theme: theme ?? "dark",
    fontSize: fontSize ?? 13,
    wordWrap: wordWrap ?? true,
  };
}

export async function saveSession(
  tabs: Tab[],
  activeTabId: string | null,
  tabCounter: number,
  presets: ReplacePreset[],
  promptTemplates: PromptTemplate[],
  theme: string,
  fontSize: number,
  wordWrap: boolean,
) {
  const db = await getDB();
  const tx = db.transaction(["tabs", "presets", "promptTemplates", "meta"], "readwrite");

  // Clear and rewrite tabs
  const tabStore = tx.objectStore("tabs");
  await tabStore.clear();
  for (const tab of tabs) {
    await tabStore.put(tab);
  }

  // Clear and rewrite presets
  const presetStore = tx.objectStore("presets");
  await presetStore.clear();
  for (const preset of presets) {
    await presetStore.put(preset);
  }

  // Clear and rewrite prompt templates
  const templateStore = tx.objectStore("promptTemplates");
  await templateStore.clear();
  for (const tpl of promptTemplates) {
    await templateStore.put(tpl);
  }

  // Meta
  const metaStore = tx.objectStore("meta");
  await metaStore.put(activeTabId ?? "", "activeTabId");
  await metaStore.put(tabCounter, "tabCounter");
  await metaStore.put(theme, "theme");
  await metaStore.put(fontSize, "fontSize");
  await metaStore.put(wordWrap, "wordWrap");

  await tx.done;
}
