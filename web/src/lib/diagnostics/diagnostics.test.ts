import { describe, test, expect } from "bun:test";
import { classifyProvider, type ProviderProbe } from "./classify";
import { formatReport } from "./report";
import type { Diagnostics } from "./types";

const probe = (over: Partial<ProviderProbe> = {}): ProviderProbe => ({
  source: "herdr",
  label: "Herdr",
  executable: "herdr",
  location: { kind: "found", path: "/home/u/.local/bin/herdr" },
  discovery: { kind: "ok", targets: [] },
  ...over,
});

// Ровно та развилка, ради которой заводился второй сигнал: plugin-shell схлопывает
// отказ scope и отсутствие бинаря в неразличимые по тексту сообщения.
describe("classifyProvider: статус выводится из пары сигналов, а не из текста ошибки", () => {
  test("discovery прошёл → ready, даже если файл в PATH не найден", () => {
    const result = classifyProvider(
      probe({ location: { kind: "not-found" }, discovery: { kind: "ok", targets: [] } }),
    );
    expect(result.status).toBe("ready");
  });

  test("discovery упал + файла нет → not-found", () => {
    const result = classifyProvider(
      probe({
        location: { kind: "not-found" },
        discovery: { kind: "failed", message: "No such file or directory (os error 2)" },
      }),
    );
    expect(result.status).toBe("not-found");
  });

  test("discovery упал + файл есть → error (scope/версия CLI), причина сохранена дословно", () => {
    const message = "program not allowed on the configured shell scope: herdr-agent-list";
    const result = classifyProvider(probe({ discovery: { kind: "failed", message } }));
    expect(result.status).toBe("error");
    expect(result.detail).toBe(message);
  });

  test("успешный discovery не тащит detail, упавший не тащит таргеты", () => {
    expect(classifyProvider(probe()).detail).toBeUndefined();
    expect(
      classifyProvider(probe({ discovery: { kind: "failed", message: "boom" } })).targets,
    ).toEqual([]);
  });

  test("ready с нулём таргетов — валидное состояние, а не ошибка", () => {
    const result = classifyProvider(probe({ discovery: { kind: "ok", targets: [] } }));
    expect(result.status).toBe("ready");
    expect(result.targets).toEqual([]);
  });
});

const diagnostics: Diagnostics = {
  app: {
    name: "Sendoff",
    version: "0.2.0",
    tauriVersion: "2.10.3",
    identifier: "dev.sendoff.app",
    webkitVersion: "2.50.4",
    dataDir: "/home/u/.local/share/dev.sendoff.app",
    userAgent: "Mozilla/5.0 …",
  },
  providers: [
    classifyProvider(
      probe({
        discovery: {
          kind: "ok",
          targets: [{ primary: "rw/claude", handle: "w657cefe818690a-1" }],
        },
      }),
    ),
    classifyProvider(
      probe({
        source: "tmux",
        label: "tmux",
        executable: "tmux",
        location: { kind: "not-found" },
        discovery: { kind: "failed", message: "tmux error: no server running" },
      }),
    ),
  ],
};

describe("formatReport", () => {
  const report = formatReport(diagnostics);

  test("несёт версии и путь к данным — то, чем опознаётся отказ чтения IndexedDB", () => {
    expect(report).toContain("Sendoff 0.2.0 (dev.sendoff.app)");
    expect(report).toContain("WebKitGTK 2.50.4");
    expect(report).toContain("Data: /home/u/.local/share/dev.sendoff.app");
  });

  test("хендл каждого таргета попадает в отчёт: на нём ломается send при зелёном discovery", () => {
    expect(report).toContain("handle: w657cefe818690a-1");
  });

  test("ненайденный бинарь описан как невидимый Sendoff, а не как отсутствующий в системе", () => {
    expect(report).toContain("tmux not found in Sendoff PATH");
    expect(report).not.toContain("not installed");
  });

  test("причина отказа переносится дословно", () => {
    expect(report).toContain("tmux error: no server running");
  });

  test("неизвестная версия WebKit печатается словом, а не пустотой", () => {
    const unknown = formatReport({
      ...diagnostics,
      app: { ...diagnostics.app, webkitVersion: null, dataDir: null },
    });
    expect(unknown).toContain("WebKitGTK unknown");
    expect(unknown).toContain("Data: unknown");
  });
});
