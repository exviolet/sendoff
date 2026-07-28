import { useCallback } from "react";
import {
  autoPair,
  continueList,
  deletePair,
  indentSelection,
  outdentSelection,
  toggleCodeFence,
  toggleWrap,
  type EditPatch,
} from "../lib/markdownEdit";

// Клавиатура редактора: отступы, продолжение списков, markdown-обёртки, автопары.
// Живёт на самой textarea, а не в глобальном листенере — операции работают с её
// выделением, а Ctrl+B/Ctrl+I за пределами редактора смысла не имеют.
export function useEditorKeymap(applyPatch: (patch: EditPatch) => void) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;

      const { value, selectionStart: start, selectionEnd: end } = e.currentTarget;
      const ctrl = e.ctrlKey || e.metaKey;

      // preventDefault нужен даже когда патч ничего не меняет (Shift+Tab на строке без
      // отступа): иначе Tab уведёт фокус из редактора.
      function run(patch: EditPatch | null) {
        if (!patch) return;
        e.preventDefault();
        e.stopPropagation();
        applyPatch(patch);
      }

      // Tab/Enter/Backspace раскладконезависимы — по e.code, как и остальные хоткеи.
      if (!ctrl && !e.altKey && e.code === "Tab") {
        run(e.shiftKey ? outdentSelection(value, start, end) : indentSelection(value, start, end));
        return;
      }

      // Shift+Enter оставлен как обычный перенос — способ прервать список, не выходя из него.
      if (!ctrl && !e.altKey && !e.shiftKey && e.code === "Enter") {
        run(continueList(value, start, end));
        return;
      }

      if (ctrl && !e.altKey && !e.shiftKey && e.code === "KeyB") {
        run(toggleWrap(value, start, end, "**"));
        return;
      }

      if (ctrl && !e.altKey && !e.shiftKey && e.code === "KeyI") {
        run(toggleWrap(value, start, end, "*"));
        return;
      }

      // M — моноширинный: Ctrl+M инлайном, Ctrl+Shift+M забором. Превью переехало на Alt+M.
      if (ctrl && !e.altKey && e.code === "KeyM") {
        run(e.shiftKey ? toggleCodeFence(value, start, end) : toggleWrap(value, start, end, "`"));
        return;
      }

      if (!ctrl && !e.altKey && e.code === "Backspace") {
        run(deletePair(value, start, end));
        return;
      }

      // Здесь наоборот — e.key, а не e.code: важен вставляемый символ. На кириллице
      // клавиша Backquote даёт «ё», и автопару бэктика включать нельзя.
      if (!ctrl && !e.altKey && e.key.length === 1) {
        run(autoPair(value, start, end, e.key));
      }
    },
    [applyPatch]
  );
}
