import { describe, test, expect } from "bun:test";
import { decideOnboarding, hasExistingUserData, ONBOARDING_VERSION } from "./onboarding";
import type { Tab, TabGroup, Workspace } from "../store/editorStore";

const wsId = "ws-1";

// Ровно то, что создаёт hydrate на пустой базе: один workspace «Default» и один пустой
// «Untitled 1». Это НЕ признак существующего пользователя.
const defaultWorkspace: Workspace = { id: wsId, name: "Default", createdAt: 0 };
const freshTab: Tab = {
  id: "t-1",
  title: "Untitled 1",
  content: "",
  createdAt: 0,
  updatedAt: 0,
  titleSource: "auto",
  workspaceId: wsId,
};

const pristine = {
  tabs: [freshTab],
  closedTabs: [] as Tab[],
  workspaces: [defaultWorkspace],
  tabGroups: [] as TabGroup[],
};

describe("hasExistingUserData: признаки перечислены явно, а не выводятся из наличия записей", () => {
  test("автосозданные workspace и пустой таб признаком НЕ являются", () => {
    expect(hasExistingUserData(pristine)).toBe(false);
  });

  test("совсем пустая база — тоже не признак", () => {
    expect(hasExistingUserData({ tabs: [], closedTabs: [], workspaces: [], tabGroups: [] })).toBe(
      false,
    );
  });

  test("набранный текст — признак", () => {
    expect(hasExistingUserData({ ...pristine, tabs: [{ ...freshTab, content: "привет" }] })).toBe(true);
  });

  test("пробелы текстом не считаются", () => {
    expect(hasExistingUserData({ ...pristine, tabs: [{ ...freshTab, content: "  \n " }] })).toBe(false);
  });

  test("названный человеком или пришедший из файла таб — признак", () => {
    expect(hasExistingUserData({ ...pristine, tabs: [{ ...freshTab, titleSource: "manual" }] })).toBe(true);
    expect(hasExistingUserData({ ...pristine, tabs: [{ ...freshTab, titleSource: "file" }] })).toBe(true);
  });

  test("привязка, пин и группа — признаки", () => {
    const bound: Tab = {
      ...freshTab,
      binding: { source: "tmux", session: "work", window: "claude" },
    };
    expect(hasExistingUserData({ ...pristine, tabs: [bound] })).toBe(true);
    expect(hasExistingUserData({ ...pristine, tabs: [{ ...freshTab, pinned: true }] })).toBe(true);
    expect(hasExistingUserData({ ...pristine, tabs: [{ ...freshTab, groupId: "g-1" }] })).toBe(true);
  });

  test("архив закрытых табов — признак", () => {
    expect(hasExistingUserData({ ...pristine, closedTabs: [freshTab] })).toBe(true);
  });

  test("второй workspace и переименованный первый — признаки", () => {
    expect(
      hasExistingUserData({
        ...pristine,
        workspaces: [defaultWorkspace, { id: "ws-2", name: "Work", createdAt: 0 }],
      }),
    ).toBe(true);
    expect(
      hasExistingUserData({ ...pristine, workspaces: [{ ...defaultWorkspace, name: "Work" }] }),
    ).toBe(true);
  });
});

describe("decideOnboarding", () => {
  test("провал чтения запрещает онбординг: поверх StorageErrorBanner он читается как потеря данных", () => {
    expect(
      decideOnboarding({ storageError: "boom", onboardingVersion: null, data: pristine }),
    ).toEqual({ kind: "skip" });
  });

  test("провал чтения запрещает онбординг даже при обжитой базе", () => {
    expect(
      decideOnboarding({
        storageError: "boom",
        onboardingVersion: null,
        data: { ...pristine, closedTabs: [freshTab] },
      }),
    ).toEqual({ kind: "skip" });
  });

  test("пройденный онбординг больше не показывается", () => {
    expect(
      decideOnboarding({ storageError: null, onboardingVersion: 1, data: pristine }),
    ).toEqual({ kind: "skip" });
  });

  test("чистая база без ключа → показать", () => {
    expect(
      decideOnboarding({ storageError: null, onboardingVersion: null, data: pristine }),
    ).toEqual({ kind: "show" });
  });

  // Случай 2-го пользователя: у него 75+ табов и никакого ключа, потому что фича новее
  // его базы. Показать ему «добро пожаловать» — худший исход всей задачи.
  test("обжитая база без ключа → тихий backfill, не показ", () => {
    expect(
      decideOnboarding({
        storageError: null,
        onboardingVersion: null,
        data: { ...pristine, tabs: [{ ...freshTab, content: "накопленное" }] },
      }),
    ).toEqual({ kind: "backfill", version: ONBOARDING_VERSION });
  });
});
