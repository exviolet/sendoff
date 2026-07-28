# CLAUDE.md

Guidance for AI agents (Claude Code, Codex) working in this repo.

> **Это `web/` — SPA-часть.** Она подключена submodule'ом в `rewrite-desktop` (Tauri-обёртка).
> Контракт сотрудничества, git-workflow, safety rails и позиционирование — в **корневом
> `CLAUDE.md` десктоп-репо**. Здесь только то, что специфично для `web/`.
>
> Источники правды: продуктовые решения — `docs/ROADMAP.md` (десктоп-репо), активные спеки —
> `tasks/NN-*.md` (десктоп-репо), backlog — GitHub Issues.

## Project Overview

**Rewrite — prompt-first редактор.** Цель: быстро формулировать LLM-промпты вне тесного input
в Claude Code / Codex и неудобного скролла в tmux, и **отправлять их прямо в терминал агента**
(`Ctrl+Enter` → tmux-pane или Orca-агент).

Не pipeline-builder, не knowledge base, не code editor. Bulk find & replace и пресеты — не
самоцель, а наследие исходного use-case (правка тона текста), которое осталось полезным.

Всё локально: без бэкенда, без API-ключей, без сетевых вызовов из webview (см. security-границу
в корневом `CLAUDE.md`).

## Commands

```bash
bun dev               # Vite dev server
bun tsc -b            # типы (должно быть 0 ошибок)
bun lint              # ESLint (должно быть 0)
bun run build         # tsc -b && vite build
bun run preview       # прод-сборка локально
```

> ⚠️ Только `tsc -b`, **не** `tsc --noEmit`. Корневой `tsconfig.json` — solution-stub
> (`"files": []` + project references), поэтому `--noEmit` проверяет **ноль файлов** и всегда
> зелёный. Реальный гейт — `-b` (идёт по references в `tsconfig.app.json`).

## Tech Stack

| Слой | Технология |
|------|-----------|
| Framework | React 19 + TypeScript strict |
| Build | Vite + Bun |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme` в `src/index.css`) |
| Editor | Нативный `<textarea>` + кастомные хуки (без Monaco/CodeMirror) |
| State | Zustand v5 |
| Persistence | IndexedDB через `idb` — **`rewrite-db` v4** |
| Desktop bridge | `@tauri-apps/api` + плагины `shell` / `fs` / `dialog` |

Версии — в `package.json` (единственный источник правды, не дублировать сюда).

## Architecture

### Stores (`src/store/`)
- `editorStore.ts` — табы, `activeTabId`, CRUD, pin, reorder, undo/redo, bulk-close, `closedTabs`
  (reopen), `pendingClose`, tmux/orca-привязки, `hydrate`. **Самый нагруженный стор.**
- `editorHistory.ts` — undo/redo-стек (per-tab), вне Zustand.
- `presetsStore.ts` — пресеты замен.
- `triggerPhrasesStore.ts` — trigger phrases (`Ctrl+K`).
- `themeStore.ts` — `dark | light | system`; в Tauri слушает нативную тему окна.
- `settingsStore.ts` — `fontSize`, `wordWrap`, `tmuxAutoSubmit`, `fontFamily`.
- `tmuxStore.ts` — последний выбранный tmux-таргет (**in-memory, НЕ персистится**: pane id эфемерны).
- `referenceStore.ts` — текст/ширина reference-панели.
- `toastStore.ts` — тосты (`toast(msg, type)`).

### Pure logic (`src/lib/`) — без side effects
- `replaceEngine.ts` — find/replace, пресеты, regex.
- `tabUtils.ts` — `makeTab`, `makeAutoTitle`, `normalizeTab`, `partitionPinned`, `canCleanupTab`.
- `tmuxResolve.ts` — парсинг топологии tmux + резолв привязки в pane (**критический путь**, см. Gotchas).
- `markdownEdit.ts` — отступы, продолжение списков, обёртки `**`/`*`, автопары. Каждая операция
  возвращает `EditPatch | null` (`null` = отдать клавишу браузеру), DOM не трогает.
- `db.ts` — схема IndexedDB (**и есть источник правды по схеме**, не дублировать в markdown).
- `platform.ts` — `isTauri`.

### Hooks (`src/hooks/`)
- `useSessionPersistence.ts` — дебаунс 500ms, синк всех сторов в IndexedDB; флаг `isHydrated`
  блокирует запись до конца восстановления.
- `useKeyboardShortcuts.ts` — глобальный `keydown`-листенер (по `e.code`, не `e.key`).
- `useEditorKeymap.ts` — `keydown` **самой textarea** (Tab/Enter/Ctrl+B/Ctrl+I/автопары).
  Живёт локально, а не в глобальном листенере: операции работают с выделением textarea.
- `useFileIO.ts` — сохранение/открытие файлов, export/import бэкапа.
- `useCommands.ts` — каталог команд палитры.
- `useTmuxSend.ts` / `useTmuxActions.ts` — отправка в tmux + цепочка резолва и picker.
- `useOrcaSend.ts` / `useOrcaActions.ts` — то же для Orca-агентов.

### Отправка промпта (`Ctrl+Enter`)
Диспетчер в `App.tsx`: таб с `orcaBinding` → Orca-флоу, иначе tmux-флоу.
tmux-цепочка: **Explicit** (привязка таба) → **Last** (последний выбор, in-memory) → **Modal** (picker).

### Editor (`src/components/Editor/`)
`<textarea>` не умеет подсветку. Оверлей: `<div>` точно под текстареа (тот же шрифт/размер/скролл)
рендерит `<mark>` на позициях совпадений; текстареа сверху с `background: transparent`.

Клавиатурные правки (`useEditorKeymap` → `applyPatch`) идут **мимо `onChange`**: патч кладётся
через `setRangeText`, потом руками зовётся `updateContent`. Обязательный шаг — **отменить висящий
`rafRef`**: он держит значение, снятое ДО патча, и, сработав следом, откатил бы правку.

### Panels
`App.tsx` держит состояние панелей (find/replace, presets, settings, reference, trigger phrases,
command palette, global search, shortcuts, distraction-free). Боковые панели взаимоисключимы.
`textareaRef` поднят в `App` и прокидывается вниз пропом.

## Data Models

```ts
interface Tab {
  id: string;                 // uuid
  title: string;
  content: string;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  titleSource?: "auto" | "manual" | "file";
  tmuxBinding?: TmuxBinding;  // взаимоисключимы: один таргет на таб
  orcaBinding?: OrcaBinding;
}

interface TmuxBinding {
  session: string;
  window: string;             // имя: отображение + fallback, НЕ уникально
  windowId?: string;          // #{window_id} (@N) — первичный ключ резолва
}

interface OrcaBinding {
  worktree: string;
  titleHint?: string;
}

interface TriggerPhrase { id: string; label: string; body: string; order: number }
interface ReplacePreset  { id: string; name: string; pairs: ReplacePair[] }
```

## Keyboard Shortcuts

Все — по `e.code` (см. Gotchas). Актуальный список — `src/hooks/useKeyboardShortcuts.ts`
(глобальные) и `src/hooks/useEditorKeymap.ts` (только когда фокус в редакторе).

| Сочетание | Действие |
|-----------|----------|
| `Ctrl+Enter` | Отправить промпт (Orca-привязка → Orca, иначе tmux) |
| `Ctrl+Shift+Enter` | tmux target picker |
| `Ctrl+Alt+B` / `Ctrl+Alt+Shift+B` | Привязать / отвязать таб к tmux-окну |
| `Ctrl+B` / `Ctrl+I` | **Редактор:** жирный / курсив |
| `Tab` / `Shift+Tab` | **Редактор:** отступ / убрать отступ (вкладывает пункт списка) |
| `Ctrl+G` | Положить таб в группу (пикер) |
| `Ctrl+Shift+W` | Workspace: переключить / создать |
| `Ctrl+N` / `Ctrl+W` | Новый / закрыть таб |
| `Ctrl+Shift+T` | Вернуть закрытый таб |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Следующий / предыдущий таб |
| `Ctrl+T` | Tab switcher |
| `Ctrl+Shift+D` | Global tab search |
| `Ctrl+P` | **Закрепить/открепить таб** (не палитра!) |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+K` | Trigger phrases |
| `Ctrl+F` / `Ctrl+H` | Find / Find & Replace |
| `Ctrl+S` / `Ctrl+O` | Сохранить / открыть файл |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+R` | Reference panel |
| `Ctrl+M` | Markdown preview |
| `Ctrl+E` | Фокус в редактор |
| `Ctrl+,` / `Ctrl+.` | Настройки / сайдбар (пресеты) |
| `Ctrl+/` | Модалка хоткеев |
| `Ctrl+Shift+F` | Distraction-free |
| `Ctrl+Shift+A` | Доскроллить к активному табу (локальный листенер в `TabBar`) |
| `Escape` | Закрыть панели |

## Critical Gotchas

1. **`e.code`, а не `e.key`.** На кириллической раскладке `e.key` для `Ctrl+S` вернёт `"ы"`.
   Везде `e.code` (`"KeyS"`), кроме `Tab`/`Escape` (раскладконезависимы).

2. **Не угадывать при неоднозначности в путях «отправить промпт агенту».** Текст, улетевший
   **не тому** агенту, хуже лишнего клика. `tmuxResolve.ts`: имя tmux-окна **не уникально**
   (два окна `claude` — норма agentic-флоу), поэтому резолв идёт по `window_id` (`@N`), имя —
   fallback; несколько совпадений → `ambiguous` → переспросить, **не отправлять**. Orca-резолв
   держит тот же инвариант (`matches.length === 1 ? handle : null`). **Не откатывать к матчингу
   только по имени** — это ровно тот баг, что чинили 2026-07-10.

3. **Custom equality в Zustand-селекторах.** `TabBar` подписан через `tabsMetaEqual` — при
   добавлении нового поля в `Tab`, влияющего на отрисовку полосы, **его надо добавить и в
   `tabsMetaEqual`**, иначе полоса молча «замерзает» (так уже было с `orcaBinding`).

4. **Unicode word boundaries.** `\b` в JS-regex не работает с кириллицей. `replaceEngine.ts`
   использует lookaround'ы `(?<![\p{L}\p{N}])` / `(?![\p{L}\p{N}])` с флагом `u`.

5. **ESLint React Compiler.** Включены `react-hooks/refs`, `react-hooks/set-state-in-effect`,
   `react-hooks/preserve-manual-memoization`: не читать `ref.current` в рендере; не звать
   синхронный `setState` в теле `useEffect`; деп-листы `useCallback` должны совпадать с
   выведенными компилятором.

6. **Hydration guard.** Флаг `isHydrated` в `useSessionPersistence` блокирует запись в IndexedDB
   до конца восстановления — иначе пустые дефолты затрут реальные данные. При провале чтения
   флаг **сознательно остаётся false**.

7. **Undo/redo дебаунс 500ms.** Быстрый набор пишет только первый снапшот «серии»; крупные
   изменения (`lenDiff > 1`) — сразу. `flushPending()` вызывается перед `undo()`/`redo()`.

8. **Реактивные индикаторы не дебаунсить** (StatusBar, dirty-метки). См. Safety Rails в корневом
   `CLAUDE.md`.

## Данные и IndexedDB — правила

Схема — в `src/lib/db.ts` (типизирована через `RewriteDB extends DBSchema`). **Не дублировать
её в markdown** — рукописная копия протухнет.

Правила (их из кода не вывести):
- **Миграций данных не вводим.** Ранняя стадия → clean sweep допустим (так `promptTemplates`
  выпилили целиком в v4).
- **НО: разрушающие изменения IndexedDB координировать со 2-м пользователем** — у него накоплены
  данные. Это единственное место, где можно реально навредить чужому человеку.
- **Аддитивные ключи в сторе `meta` не требуют bump версии БД** (так добавлен `fontFamily`).
  Bump нужен только под новый object store / индекс.

## Code Quality Rules

- TypeScript strict — без `any`; `unknown` + type guards.
- Логика без side effects — в `src/lib/` чистыми функциями (так вынесен `tmuxResolve.ts`, что
  позволило проверить критический резолв без Tauri).
- Компоненты ~150 строк максимум — логику выносить в хуки.
- Коммиты — русские, Conventional Commits.

## Known duplication (осознанная)

`TabSwitcher`, `GlobalSearchPanel`, `TmuxTargetPicker`, `CommandPalette`, `OrcaTargetPicker` —
пять вариаций **одного** паттерна «модалка со списком: query + фильтр + ↑↓ + Esc/Enter».
Извлечение общего примитива отложено осознанно (не смешивать с текущей фичей). Новые модалки
такого рода писать **по существующему паттерну**, не изобретая свой, — чтобы будущее извлечение
осталось механическим.
