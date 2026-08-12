import { describe, expect, test } from "bun:test";
import {
  FORMATTING_ITEMS,
  applySlashItem,
  detectSlashQuery,
  filterSlashItems,
  slashItems,
  type SlashItem,
} from "./slashMenu";

function item(id: string): SlashItem {
  const found = FORMATTING_ITEMS.find((i) => i.id === id);
  if (!found) throw new Error(`нет пункта ${id}`);
  return found;
}

const phrase: SlashItem = {
  id: "phrase:direct",
  label: "Do it directly",
  hint: "phrase",
  section: "Phrases",
  kind: "raw",
  payload: "Do it directly:\n\n",
};

// Применить пункт так, как это делает Editor: получить патч и склеить новое значение.
function applied(value: string, caret: number, id: SlashItem | string) {
  const trigger = detectSlashQuery(value, caret);
  if (!trigger) throw new Error("триггер не найден");
  const target = typeof id === "string" ? item(id) : id;
  const patch = applySlashItem(value, trigger, caret, target);
  return {
    text: value.slice(0, patch.from) + patch.text + value.slice(patch.to),
    caret: patch.selStart,
  };
}

describe("detectSlashQuery", () => {
  test("слэш в начале строки открывает меню", () => {
    expect(detectSlashQuery("/", 1)).toEqual({ from: 0, query: "" });
    expect(detectSlashQuery("/code", 5)).toEqual({ from: 0, query: "code" });
  });

  test("слэш после пробела и после переноса строки открывает", () => {
    expect(detectSlashQuery("run /h", 6)).toEqual({ from: 4, query: "h" });
    expect(detectSlashQuery("first\n/h", 8)).toEqual({ from: 6, query: "h" });
    expect(detectSlashQuery("\t/h", 3)).toEqual({ from: 1, query: "h" });
  });

  // Главная защита от ложных срабатываний: слэш в тексте — обычный символ.
  test("слэш внутри слова НЕ открывает: пути, дроби, даты", () => {
    expect(detectSlashQuery("src/lib", 7)).toBeNull();
    expect(detectSlashQuery("и/или", 5)).toBeNull();
    expect(detectSlashQuery("12/08", 5)).toBeNull();
    expect(detectSlashQuery("см. src/lib/db.ts", 17)).toBeNull();
  });

  test("пробел в запросе закрывает меню", () => {
    expect(detectSlashQuery("/code block", 11)).toBeNull();
  });

  test("второй слэш закрывает меню", () => {
    expect(detectSlashQuery("/a/b", 4)).toBeNull();
  });

  test("перенос строки после слэша закрывает меню", () => {
    expect(detectSlashQuery("/code\nnext", 10)).toBeNull();
  });

  test("слишком длинный запрос перестаёт быть запросом", () => {
    const long = "/" + "a".repeat(25);
    expect(detectSlashQuery(long, long.length)).toBeNull();
  });

  test("нет слэша слева от каретки — нет триггера", () => {
    expect(detectSlashQuery("plain text", 10)).toBeNull();
    expect(detectSlashQuery("", 0)).toBeNull();
  });

  test("каретка перед слэшем не считается: меню принадлежит тексту слева", () => {
    expect(detectSlashQuery("x /code", 2)).toBeNull();
  });
});

describe("filterSlashItems", () => {
  const all = slashItems([phrase]);

  test("пустой запрос отдаёт каталог целиком, фразы первыми", () => {
    const out = filterSlashItems(all, "");
    expect(out.length).toBe(FORMATTING_ITEMS.length + 1);
    expect(out[0].id).toBe("phrase:direct");
  });

  test("фильтрует по подписи", () => {
    const out = filterSlashItems(all, "head");
    expect(out.length).toBe(4);
    expect(out.every((i) => i.label.startsWith("Heading"))).toBe(true);
  });

  test("фильтрует по самому синтаксису", () => {
    expect(filterSlashItems(all, "```")[0].id).toBe("codeblock");
    expect(filterSlashItems(all, "---")[0].id).toBe("hr");
  });

  test("фразы ищутся вместе с markdown", () => {
    expect(filterSlashItems(all, "directly")[0].id).toBe("phrase:direct");
  });

  test("ничего не совпало — пустой список (меню закроется, а не повиснет)", () => {
    expect(filterSlashItems(all, "zzzz")).toHaveLength(0);
  });

  // Иначе заголовок секции рисуется по нескольку раз: пункты чередуются по очкам.
  test("секции не перемешиваются: все фразы идут раньше любого markdown", () => {
    const out = filterSlashItems(all, "o");
    const firstFormatting = out.findIndex((i) => i.section === "Formatting");
    const lastPhrase = out.map((i) => i.section).lastIndexOf("Phrases");
    expect(firstFormatting).toBeGreaterThan(-1);
    expect(lastPhrase).toBeGreaterThan(-1);
    expect(lastPhrase).toBeLessThan(firstFormatting);
  });

  test("порядок каталога держится на равных очках", () => {
    // «list» есть и в Ordered, и в Task, и в Unordered — идут в порядке каталога.
    const ids = filterSlashItems(all, "list").map((i) => i.id);
    expect(ids.slice(0, 3)).toEqual(["ol", "task", "ul"]);
  });
});

describe("applySlashItem", () => {
  test("маркер строки съедает слэш и встаёт в начало", () => {
    expect(applied("/h2", 3, "h2")).toEqual({ text: "## ", caret: 3 });
  });

  test("отступ строки сохраняется", () => {
    expect(applied("  /ul", 5, "ul")).toEqual({ text: "  - ", caret: 4 });
  });

  test("текст слева — маркер уезжает на свою строку, а не липнет к хвосту", () => {
    expect(applied("intro /ul", 9, "ul")).toEqual({ text: "intro \n- ", caret: 9 });
  });

  test("забор кода ставит каретку внутрь", () => {
    expect(applied("/code", 5, "codeblock")).toEqual({ text: "```\n\n```", caret: 4 });
  });

  test("забор внутри вложенного пункта уносит его отступ на все строки", () => {
    expect(applied("  /code", 7, "codeblock")).toEqual({
      text: "  ```\n  \n  ```",
      caret: 8,
    });
  });

  test("черта встаёт своим блоком, каретка на следующей строке", () => {
    expect(applied("/hr", 3, "hr")).toEqual({ text: "---\n", caret: 4 });
  });

  test("блок посреди строки начинается с новой строки", () => {
    expect(applied("text /code", 10, "codeblock")).toEqual({
      text: "text \n```\n\n```",
      caret: 10,
    });
  });

  test("фраза вставляется телом как есть, каретка после неё", () => {
    expect(applied("/dir", 4, phrase)).toEqual({
      text: "Do it directly:\n\n",
      caret: 17,
    });
  });

  test("фраза уважает текст вокруг каретки", () => {
    expect(applied("a /d b", 4, phrase)).toEqual({
      text: "a Do it directly:\n\n b",
      caret: 19,
    });
  });

  // Хвост строки не теряется и не подчищается: маркер несёт свой пробел, пробел строки
  // остаётся на месте. Съедать чужой символ ради косметики — угадывание, а `#  tail`
  // markdown читает как заголовок ровно так же.
  test("хвост строки справа от каретки не теряется", () => {
    expect(applied("/h1 tail", 3, "h1")).toEqual({ text: "#  tail", caret: 2 });
  });
});
