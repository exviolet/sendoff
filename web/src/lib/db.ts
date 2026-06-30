import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Tab } from "../store/editorStore";
import type { ReplacePreset } from "../store/presetsStore";
import type { TriggerPhrase } from "../store/triggerPhrasesStore";

interface RewriteDB extends DBSchema {
  tabs: {
    key: string;
    value: Tab;
  };
  presets: {
    key: string;
    value: ReplacePreset;
  };
  triggerPhrases: {
    key: string;
    value: TriggerPhrase;
  };
  meta: {
    key: string;
    value: string | number | boolean | string[];
  };
}

const DB_NAME = "rewrite-db";
const DB_VERSION = 4;

function getDB() {
  return openDB<RewriteDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
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

      // v4: промпт-шаблоны (clipboard-обёртки) заменены на trigger phrases —
      // старый стор отбрасываем целиком (clean sweep, без миграции данных).
      if (oldVersion < 4) {
        // db типизирован новой схемой (promptTemplates в ней уже нет), поэтому к
        // легаси-стору обращаемся через нетипизированный IDBPDatabase — иначе
        // tsc -b ругается на строковый литерал не из union'а store-имён.
        const legacy = db as unknown as IDBPDatabase;
        if (legacy.objectStoreNames.contains("promptTemplates")) {
          legacy.deleteObjectStore("promptTemplates");
        }
        if (!db.objectStoreNames.contains("triggerPhrases")) {
          db.createObjectStore("triggerPhrases", { keyPath: "id" });
        }
      }
    },
  });
}

// Reorder tabs to match the persisted id sequence. Tabs missing from the list
// (e.g. written before tabOrder existed) keep getAll's key order at the end.
function orderTabs(tabs: Tab[], order: string[] | undefined): Tab[] {
  if (!order || order.length === 0) return tabs;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...tabs].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
}

export async function loadSession() {
  const db = await getDB();
  // getAll returns records sorted by primary key (uuid), NOT tab order. Restore
  // the user's arrangement (incl. DnD reorder) from the persisted tabOrder list.
  const storedTabs = await db.getAll("tabs");
  const tabOrder = (await db.get("meta", "tabOrder")) as string[] | undefined;
  const tabs = orderTabs(storedTabs, tabOrder);
  const presets = await db.getAll("presets");
  const triggerPhrases = await db.getAll("triggerPhrases");
  const activeTabId = (await db.get("meta", "activeTabId")) as string | undefined;
  const tabCounter = (await db.get("meta", "tabCounter")) as number | undefined;
  const theme = (await db.get("meta", "theme")) as string | undefined;
  const fontSize = (await db.get("meta", "fontSize")) as number | undefined;
  const wordWrap = (await db.get("meta", "wordWrap")) as boolean | undefined;
  const tmuxAutoSubmit = (await db.get("meta", "tmuxAutoSubmit")) as boolean | undefined;
  const referenceText = (await db.get("meta", "referenceText")) as string | undefined;
  const referenceWidth = (await db.get("meta", "referenceWidth")) as number | undefined;
  return {
    tabs, presets, triggerPhrases,
    activeTabId: activeTabId ?? null,
    tabCounter: tabCounter ?? 0,
    theme: theme ?? "dark",
    fontSize: fontSize ?? 13,
    wordWrap: wordWrap ?? true,
    tmuxAutoSubmit: tmuxAutoSubmit ?? true,
    referenceText: referenceText ?? "",
    referenceWidth: typeof referenceWidth === "number" ? referenceWidth : undefined,
  };
}

export async function saveSession(
  tabs: Tab[],
  activeTabId: string | null,
  tabCounter: number,
  presets: ReplacePreset[],
  triggerPhrases: TriggerPhrase[],
  theme: string,
  fontSize: number,
  wordWrap: boolean,
  tmuxAutoSubmit: boolean,
  referenceText: string,
  referenceWidth: number,
) {
  const db = await getDB();
  const tx = db.transaction(["tabs", "presets", "triggerPhrases", "meta"], "readwrite");

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

  // Clear and rewrite trigger phrases
  const phraseStore = tx.objectStore("triggerPhrases");
  await phraseStore.clear();
  for (const phrase of triggerPhrases) {
    await phraseStore.put(phrase);
  }

  // Meta
  const metaStore = tx.objectStore("meta");
  await metaStore.put(tabs.map((t) => t.id), "tabOrder");
  await metaStore.put(activeTabId ?? "", "activeTabId");
  await metaStore.put(tabCounter, "tabCounter");
  await metaStore.put(theme, "theme");
  await metaStore.put(fontSize, "fontSize");
  await metaStore.put(wordWrap, "wordWrap");
  await metaStore.put(tmuxAutoSubmit, "tmuxAutoSubmit");
  await metaStore.put(referenceText, "referenceText");
  await metaStore.put(referenceWidth, "referenceWidth");

  await tx.done;
}
