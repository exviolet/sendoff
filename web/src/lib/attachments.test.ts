import { describe, expect, test } from "bun:test";
import { insertAttachmentPath } from "./attachments";

const P = "/home/u/img.png";

describe("insertAttachmentPath", () => {
  test("в пустой текст — только путь, без пробелов по краям", () => {
    expect(insertAttachmentPath("", 0, 0, P)).toEqual({ content: P, caret: P.length });
  });

  test("после слова добавляет пробел слева — иначе агент читает одно слово", () => {
    const { content } = insertAttachmentPath("посмотри", 8, 8, P);
    expect(content).toBe(`посмотри ${P}`);
  });

  test("перед словом добавляет пробел справа", () => {
    const { content } = insertAttachmentPath("что тут", 0, 0, P);
    expect(content).toBe(`${P} что тут`);
  });

  test("между словами — пробелы с обеих сторон", () => {
    const { content } = insertAttachmentPath("до после", 2, 2, P);
    expect(content).toBe(`до ${P} после`);
  });

  test("рядом с уже имеющимися пробелами их не удваивает", () => {
    const { content } = insertAttachmentPath("до  после", 3, 3, P);
    expect(content).toBe(`до ${P} после`);
  });

  test("перенос строки считается пробельным — лишнего пробела не будет", () => {
    const { content } = insertAttachmentPath("строка\n", 7, 7, P);
    expect(content).toBe(`строка\n${P}`);
  });

  test("выделение заменяется целиком", () => {
    const { content } = insertAttachmentPath("возьми ЭТО дальше", 7, 10, P);
    expect(content).toBe(`возьми ${P} дальше`);
  });

  test("каретка встаёт за путём, когда пробел справа уже был", () => {
    const { content, caret } = insertAttachmentPath("до после", 2, 2, P);
    // Своего пробела тут не добавляется — иначе их стало бы два.
    expect(content.slice(0, caret)).toBe(`до ${P}`);
    expect(content.slice(caret)).toBe(" после");
  });

  test("каретка встаёт за добавленным пробелом, когда его дописали", () => {
    const { content, caret } = insertAttachmentPath("допосле", 2, 2, P);
    // Набор продолжается за путём, а не внутрь него.
    expect(content.slice(0, caret)).toBe(`до ${P} `);
    expect(content.slice(caret)).toBe("после");
  });
});

