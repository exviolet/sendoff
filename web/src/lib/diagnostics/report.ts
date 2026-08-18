// Текстовый отчёт для «Copy diagnostic report». Чистая функция — тестируется без Tauri.
//
// Формат осознанно плоский текст, а не JSON: отчёт вставляют в issue или в мессенджер,
// и читать его должен человек. Статусы словами, без символов: ✓/!/○ в чужом шрифте
// съезжают, а в отчёте важно, чтобы «ready» осталось словом «ready».

import type { Diagnostics, ProviderDiagnostic } from "./types";

function providerBlock(p: ProviderDiagnostic): string[] {
  const lines: string[] = [`[${p.status}] ${p.label}`];

  lines.push(
    p.location.kind === "found"
      ? `  Executable: ${p.location.path ?? `${p.executable} (path unknown)`}`
      : `  Executable: ${p.executable} not found in Sendoff PATH`,
  );

  if (p.failure) {
    lines.push(
      p.failure.code
        ? `  Target discovery failed: ${p.failure.code}`
        : "  Target discovery failed:",
    );
    lines.push(`    ${p.failure.summary}`);

    // Полный сырой вывод остаётся ТОЛЬКО в отчёте: в UI он превращает экран в дамп
    // JSON, а для отладки по чужому репорту он и есть самое ценное. Печатается лишь
    // когда отличается от короткой формулировки — иначе это дубль.
    if (p.failure.raw.trim() !== p.failure.summary.trim()) {
      lines.push("    ---");
      // Многострочный вывод CLI: отступ на каждой строке, иначе продолжение
      // сливается со следующим блоком.
      for (const line of p.failure.raw.split("\n")) lines.push(`    ${line}`);
    }
  }

  if (p.status === "ready") {
    if (p.targets.length === 0) {
      lines.push("  No targets found");
    } else {
      lines.push(`  ${p.targets.length} target(s):`);
      for (const t of p.targets) {
        lines.push(`    ${t.primary}`);
        // Хендл отдельной строкой: именно его формат проверяют валидаторы send-пути
        // в capabilities/default.json, и именно на нём сломалась отправка у 2-го
        // пользователя при полностью успешном discovery.
        lines.push(`      handle: ${t.handle}`);
      }
    }
  }

  return lines;
}

export function formatReport({ app, providers }: Diagnostics): string {
  const lines: string[] = [
    "Sendoff Doctor",
    "",
    "Application",
    `  ${app.name} ${app.version} (${app.identifier})`,
    `  Tauri ${app.tauriVersion}`,
    `  WebKitGTK ${app.webkitVersion ?? "unknown"}`,
    `  Data: ${app.dataDir ?? "unknown"}`,
    `  UA: ${app.userAgent}`,
    "",
    "Terminal providers",
  ];

  for (const p of providers) {
    lines.push("");
    lines.push(...providerBlock(p));
  }

  return lines.join("\n");
}
