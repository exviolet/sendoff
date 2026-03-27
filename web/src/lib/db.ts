import { openDB, type DBSchema } from "idb";
import type { Tab } from "../store/editorStore";
import type { ReplacePreset } from "../store/presetsStore";

interface RewriteBoxDB extends DBSchema {
  tabs: {
    key: string;
    value: Tab;
  };
  presets: {
    key: string;
    value: ReplacePreset;
  };
  meta: {
    key: string;
    value: string | number;
  };
}

const DB_NAME = "rewritebox-db";
const DB_VERSION = 1;

function getDB() {
  return openDB<RewriteBoxDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("tabs")) {
        db.createObjectStore("tabs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("presets")) {
        db.createObjectStore("presets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    },
  });
}

export async function loadSession() {
  const db = await getDB();
  const tabs = await db.getAll("tabs");
  const presets = await db.getAll("presets");
  const activeTabId = (await db.get("meta", "activeTabId")) as string | undefined;
  const tabCounter = (await db.get("meta", "tabCounter")) as number | undefined;
  return { tabs, presets, activeTabId: activeTabId ?? null, tabCounter: tabCounter ?? 0 };
}

export async function saveSession(
  tabs: Tab[],
  activeTabId: string | null,
  tabCounter: number,
  presets: ReplacePreset[]
) {
  const db = await getDB();
  const tx = db.transaction(["tabs", "presets", "meta"], "readwrite");

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

  // Meta
  const metaStore = tx.objectStore("meta");
  await metaStore.put(activeTabId ?? "", "activeTabId");
  await metaStore.put(tabCounter, "tabCounter");

  await tx.done;
}
