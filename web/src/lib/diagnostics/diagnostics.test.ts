import { describe, test, expect } from "bun:test";
import { classifyProvider, type ProviderProbe } from "./classify";
import { formatReport } from "./report";
import { sanitizeHome } from "./sanitize";
import { summarizeFailure } from "./failure";
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
        discovery: {
          kind: "failed",
          failure: { summary: "No such file or directory (os error 2)", raw: "" },
        },
      }),
    );
    expect(result.status).toBe("not-found");
  });

  // Сообщение приходит из std::io::Error самого Sendoff и локализовано системной
  // локалью, а отчёт вставляют в публичную issue. Английская строка «not found in
  // Sendoff PATH» говорит то же самое и лучше.
  test("при not-found локализованная причина не прикладывается", () => {
    const result = classifyProvider(
      probe({
        location: { kind: "not-found" },
        discovery: {
          kind: "failed",
          failure: { summary: "Нет такого файла или каталога (os error 2)", raw: "" },
        },
      }),
    );
    expect(result.failure).toBeUndefined();
  });

  test("discovery упал + файл есть → error (scope/версия CLI), причина сохранена дословно", () => {
    const message = "program not allowed on the configured shell scope: herdr-agent-list";
    const result = classifyProvider(
      probe({ discovery: { kind: "failed", failure: { summary: message, raw: message } } }),
    );
    expect(result.status).toBe("error");
    expect(result.failure?.summary).toBe(message);
  });

  test("успешный discovery не тащит failure, упавший не тащит таргеты", () => {
    expect(classifyProvider(probe()).failure).toBeUndefined();
    expect(
      classifyProvider(
        probe({ discovery: { kind: "failed", failure: { summary: "boom", raw: "boom" } } }),
      ).targets,
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
    home: "/home/u",
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
        discovery: {
          kind: "failed",
          failure: {
            summary: "no server running",
            raw: "tmux error: no server running",
          },
        },
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

  test("отчёт несёт и короткую формулировку, и полный сырой вывод", () => {
    const withRaw = formatReport({
      ...diagnostics,
      providers: [
        classifyProvider(
          probe({
            source: "orca",
            label: "Orca",
            executable: "orca-ide",
            discovery: {
              kind: "failed",
              failure: {
                code: "runtime_unavailable",
                summary: "Could not read Orca runtime metadata",
                raw: '{"ok":false,"error":{"code":"runtime_unavailable"}}',
              },
            },
          }),
        ),
      ],
    });
    expect(withRaw).toContain("Target discovery failed: runtime_unavailable");
    expect(withRaw).toContain("Could not read Orca runtime metadata");
    expect(withRaw).toContain('"code":"runtime_unavailable"');
  });

  test("у не найденного бинаря в отчёте только английская строка про PATH", () => {
    expect(report).toContain("tmux not found in Sendoff PATH");
    expect(report).not.toContain("Target discovery failed");
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

// Отчёт вставляют в публичную issue — имя пользователя из путей уезжать не должно.
describe("sanitizeHome", () => {
  test("домашний каталог заменяется на ~ во всех вхождениях", () => {
    expect(sanitizeHome("/home/ex1te/.local/bin/herdr", "/home/ex1te")).toBe("~/.local/bin/herdr");
    expect(
      sanitizeHome("cannot read /home/ex1te/a and /home/ex1te/b", "/home/ex1te"),
    ).toBe("cannot read ~/a and ~/b");
  });

  test("хвостовой слэш не съедает разделитель", () => {
    expect(sanitizeHome("/home/ex1te/.config/orca", "/home/ex1te/")).toBe("~/.config/orca");
  });

  test("без известного home текст не трогается", () => {
    expect(sanitizeHome("/home/ex1te/x", null)).toBe("/home/ex1te/x");
  });

  test("корневой home не превращает текст в кашу из ~", () => {
    expect(sanitizeHome("/usr/bin/tmux", "/")).toBe("/usr/bin/tmux");
    expect(sanitizeHome("/usr/bin/tmux", "")).toBe("/usr/bin/tmux");
  });

  test("пути, не относящиеся к home, остаются как есть", () => {
    expect(sanitizeHome("/usr/bin/tmux", "/home/ex1te")).toBe("/usr/bin/tmux");
  });
});

// Разбор JSON-конверта, а не регекс по строке: и orca-ide, и herdr отвечают
// {"ok":false,"error":{"code","message"}}.
describe("summarizeFailure", () => {
  const envelope = JSON.stringify({
    id: "local",
    ok: false,
    error: {
      code: "runtime_unavailable",
      message: "Could not read Orca runtime metadata at ~/.config/orca/orca-runtime.json",
    },
  });

  test("code и message достаются из конверта", () => {
    const result = summarizeFailure(envelope, "fallback");
    expect(result.code).toBe("runtime_unavailable");
    expect(result.summary).toContain("Could not read Orca runtime metadata");
  });

  test("не-JSON отдаёт fallback без выдуманного кода", () => {
    const result = summarizeFailure("tmux error: no server running", "tmux error: no server running");
    expect(result.code).toBeUndefined();
    expect(result.summary).toBe("tmux error: no server running");
  });

  test("JSON без конверта ошибки отдаёт fallback", () => {
    expect(summarizeFailure('{"ok":true,"result":{}}', "fallback").summary).toBe("fallback");
  });

  test("пустой вывод отдаёт fallback", () => {
    expect(summarizeFailure("   ", "fallback").summary).toBe("fallback");
  });

  test("код без сообщения не теряется, текст берётся из fallback", () => {
    const result = summarizeFailure('{"error":{"code":"boom"}}', "fallback");
    expect(result.code).toBe("boom");
    expect(result.summary).toBe("fallback");
  });
});
