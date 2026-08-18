// Человекочитаемая причина отказа провайдера. Чистая функция.
//
// И orca-ide, и herdr отвечают JSON-конвертом вида
// {"id":…,"ok":false,"error":{"code":…,"message":…}}. Разбираем его JSON.parse'ом и
// сужаем защитно — никакого regex-парсинга строк. Если конверт не распознан, сырой
// текст возвращается как есть: выдумывать формулировку за провайдера мы не вправе.

import { asRecord, asString } from "../terminalTargets/shell";

export interface FailureSummary {
  // Короткая машинная причина, если провайдер её назвал (`runtime_unavailable`).
  code?: string;
  // Одна строка для основного UI.
  summary: string;
}

export function summarizeFailure(raw: string, fallback: string): FailureSummary {
  const trimmed = raw.trim();
  if (!trimmed) return { summary: fallback };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { summary: fallback };
  }

  const error = asRecord(asRecord(parsed)?.error);
  if (!error) return { summary: fallback };

  const code = asString(error.code);
  const message = asString(error.message);
  if (!message) return code ? { code, summary: fallback } : { summary: fallback };

  return code ? { code, summary: message } : { summary: message };
}
