import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Tab, Workspace, TabGroup } from "../store/editorStore";
import type { ReplacePreset } from "../store/presetsStore";
import type { TriggerPhrase } from "../store/triggerPhrasesStore";
import type { PhraseInsertMode } from "../store/settingsStore";

interface RewriteDB extends DBSchema {
  tabs: {
    key: string;
    // closedAt — маркер архива: таб закрыт, но не удалён. Живёт в том же сторе, чтобы
    // не заводить новый (новый store = bump версии = сломанный откат у 2-го пользователя).
    value: Tab & { closedAt?: number };
  };
  presets: {
    key: string;
    value: ReplacePreset;
  };
  triggerPhrases: {
    key: string;
    value: TriggerPhrase;
  };
  workspaces: {
    key: string;
    value: Workspace;
  };
  tabGroups: {
    key: string;
    value: TabGroup;
  };
  meta: {
    key: string;
    value: string | number | boolean | string[];
  };
}

const DB_NAME = "rewrite-db";
const DB_VERSION = 6;

// Соединение ОДНО на всё приложение и переиспользуется. Раньше каждый вызов открывал
// новое и не закрывал: при записи раз в 500 мс за сессию их копились сотни. Дело не
// только в утечке — открытые соединения БЛОКИРУЮТ апгрейд версии, то есть следующий
// же bump DB_VERSION повис бы у пользователя навсегда.
let dbPromise: Promise<IDBPDatabase<RewriteDB>> | null = null;

// Закрыть и забыть соединение. Нужно тестам, которые пересоздают базу с нуля;
// в приложении не зовётся — там соединение живёт столько же, сколько окно.
export function closeDB() {
  const pending = dbPromise;
  dbPromise = null;
  return pending?.then((db) => db.close()) ?? Promise.resolve();
}

function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<RewriteDB>(DB_NAME, DB_VERSION, {
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

      // v5: workspaces. Чисто аддитивно — существующие сторы не трогаем, миграции данных
      // нет. Табам без workspaceId «Default» присваивается при гидрации (editorStore).
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains("workspaces")) {
          db.createObjectStore("workspaces", { keyPath: "id" });
        }
      }

      // v6: группы табов. Тоже чисто аддитивно: существующие сторы не трогаем, миграции
      // нет. У старых табов groupId отсутствует — это валидное «вне групп», нормализуется
      // при гидрации. Порядок групп НЕ храним: он выводится из позиции первого таба группы
      // в tabOrder, отдельный ключ разъехался бы с реальной полосой.
      if (oldVersion < 6) {
        if (!db.objectStoreNames.contains("tabGroups")) {
          db.createObjectStore("tabGroups", { keyPath: "id" });
        }
      }
    },
  });
  return dbPromise;
}

// Reorder records to match the persisted id sequence. Records missing from the list
// (e.g. written before the order key existed) keep getAll's key order at the end.
function orderById<T extends { id: string }>(items: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
}

export async function loadSession() {
  const db = await getDB();
  // getAll returns records sorted by primary key (uuid), NOT tab order. Restore
  // the user's arrangement (incl. DnD reorder) from the persisted tabOrder list.
  // Архив закрытых табов лежит в ТОМ ЖЕ сторе с маркером closedAt — новый object store
  // потребовал бы bump версии, а он у второго пользователя ломает откат на старый бинарь.
  // Форма записи внутри таба менять версию не обязана (см. правила в web/CLAUDE.md).
  const storedTabs = (await db.getAll("tabs")) as (Tab & { closedAt?: number })[];
  const tabOrder = (await db.get("meta", "tabOrder")) as string[] | undefined;
  const live = storedTabs.filter((t) => typeof t.closedAt !== "number");
  const tabs = orderById(live, tabOrder);
  // Порядок архива — по времени закрытия: Ctrl+Shift+T обязан отдавать последний закрытый.
  const closedTabs = storedTabs
    .filter((t) => typeof t.closedAt === "number")
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))
    .map((stored) => {
      const tab = { ...stored };
      delete tab.closedAt; // маркер архива в модель таба не едет
      return tab as Tab;
    });
  const storedWorkspaces = await db.getAll("workspaces");
  const workspaceOrder = (await db.get("meta", "workspaceOrder")) as string[] | undefined;
  const workspaces = orderById(storedWorkspaces, workspaceOrder);
  const tabGroups = await db.getAll("tabGroups");
  const presets = await db.getAll("presets");
  const triggerPhrases = await db.getAll("triggerPhrases");
  const activeTabId = (await db.get("meta", "activeTabId")) as string | undefined;
  const activeWorkspaceId = (await db.get("meta", "activeWorkspaceId")) as string | undefined;
  const tabCounter = (await db.get("meta", "tabCounter")) as number | undefined;
  const theme = (await db.get("meta", "theme")) as string | undefined;
  const fontSize = (await db.get("meta", "fontSize")) as number | undefined;
  const wordWrap = (await db.get("meta", "wordWrap")) as boolean | undefined;
  const tmuxAutoSubmit = (await db.get("meta", "tmuxAutoSubmit")) as boolean | undefined;
  const fontFamily = (await db.get("meta", "fontFamily")) as string | undefined;
  // Сужаем на чтении, а не кастуем: в meta лежит что угодно, а неизвестный режим
  // тихо сломал бы вставку. Незнакомое значение = исходное поведение.
  const phraseInsertMode: PhraseInsertMode =
    (await db.get("meta", "phraseInsertMode")) === "cursor" ? "cursor" : "prepend";
  const referenceText = (await db.get("meta", "referenceText")) as string | undefined;
  const referenceWidth = (await db.get("meta", "referenceWidth")) as number | undefined;
  return {
    tabs, closedTabs, presets, triggerPhrases, workspaces, tabGroups,
    activeTabId: activeTabId ?? null,
    activeWorkspaceId: activeWorkspaceId ?? null,
    tabCounter: tabCounter ?? 0,
    theme: theme ?? "dark",
    fontSize: fontSize ?? 13,
    wordWrap: wordWrap ?? true,
    tmuxAutoSubmit: tmuxAutoSubmit ?? true,
    fontFamily: fontFamily ?? "",
    phraseInsertMode,
    referenceText: referenceText ?? "",
    referenceWidth: typeof referenceWidth === "number" ? referenceWidth : undefined,
  };
}

// Объектом, а не позиционными аргументами: их уже 14 — позиционный вызов стал бы
// нечитаемым и хрупким (перепутанный порядок тихо запишет не туда).
export interface SessionSnapshot {
  tabs: Tab[];
  closedTabs: Tab[];
  activeTabId: string | null;
  tabCounter: number;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  tabGroups: TabGroup[];
  presets: ReplacePreset[];
  triggerPhrases: TriggerPhrase[];
  theme: string;
  fontSize: number;
  wordWrap: boolean;
  tmuxAutoSubmit: boolean;
  fontFamily: string;
  phraseInsertMode: PhraseInsertMode;
  referenceText: string;
  referenceWidth: number;
}

export async function saveSession(
  {
    tabs,
    closedTabs,
    activeTabId,
    tabCounter,
    workspaces,
    activeWorkspaceId,
    tabGroups,
    presets,
    triggerPhrases,
    theme,
    fontSize,
    wordWrap,
    tmuxAutoSubmit,
    fontFamily,
    phraseInsertMode,
    referenceText,
    referenceWidth,
  }: SessionSnapshot,
) {
  const db = await getDB();
  const tx = db.transaction(
    ["tabs", "presets", "triggerPhrases", "workspaces", "tabGroups", "meta"],
    "readwrite",
  );

  // Clear and rewrite tabs
  const tabStore = tx.objectStore("tabs");
  await tabStore.clear();
  for (const tab of tabs) {
    await tabStore.put(tab);
  }
  // Индекс в массиве, а не Date.now(): архив уже отсортирован по времени закрытия, а
  // одинаковые метки у закрытых пачкой сломали бы порядок возврата.
  for (const [i, tab] of closedTabs.entries()) {
    await tabStore.put({ ...tab, closedAt: i + 1 });
  }

  // Clear and rewrite workspaces
  const workspaceStore = tx.objectStore("workspaces");
  await workspaceStore.clear();
  for (const ws of workspaces) {
    await workspaceStore.put(ws);
  }

  // Clear and rewrite tab groups
  const groupStore = tx.objectStore("tabGroups");
  await groupStore.clear();
  for (const group of tabGroups) {
    await groupStore.put(group);
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
  await metaStore.put(workspaces.map((w) => w.id), "workspaceOrder");
  await metaStore.put(activeTabId ?? "", "activeTabId");
  await metaStore.put(activeWorkspaceId, "activeWorkspaceId");
  await metaStore.put(tabCounter, "tabCounter");
  await metaStore.put(theme, "theme");
  await metaStore.put(fontSize, "fontSize");
  await metaStore.put(wordWrap, "wordWrap");
  await metaStore.put(tmuxAutoSubmit, "tmuxAutoSubmit");
  await metaStore.put(fontFamily, "fontFamily");
  await metaStore.put(phraseInsertMode, "phraseInsertMode");
  await metaStore.put(referenceText, "referenceText");
  await metaStore.put(referenceWidth, "referenceWidth");

  await tx.done;
}
