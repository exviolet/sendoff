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
(`Ctrl+Enter` → агент herdr, агент Orca или tmux-pane).

Не pipeline-builder, не knowledge base, не code editor. Bulk find & replace и пресеты — не
самоцель, а наследие исходного use-case (правка тона текста), которое осталось полезным.

Всё локально: без бэкенда, без API-ключей, без сетевых вызовов из webview (см. security-границу
в корневом `CLAUDE.md`).

## Commands

```bash
bun dev               # Vite dev server
bun tsc -b            # типы (должно быть 0 ошибок)
bun lint              # ESLint (должно быть 0)
bun test              # тесты чистой логики + слоя IndexedDB (должно быть 0 fail)
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
  (reopen), `pendingClose`, привязка к терминалу (`binding`), `hydrate`. **Самый нагруженный стор.**
- `editorHistory.ts` — undo/redo-стек (per-tab), вне Zustand.
- `presetsStore.ts` — пресеты замен.
- `triggerPhrasesStore.ts` — trigger phrases (`Ctrl+K`).
- `themeStore.ts` — `dark | light | system`; в Tauri слушает нативную тему окна.
- `settingsStore.ts` — `fontSize`, `wordWrap`, `tmuxAutoSubmit`, `fontFamily`, `phraseInsertMode` (`Ctrl+K`: префиксом ко всему промпту / в позицию каретки).
- `lastTargetStore.ts` — последний выбранный таргет `{source, handle, label}` (**in-memory, НЕ персистится**: хендлы эфемерны). `source` обязателен — без него хендл двусмыслен между провайдерами.
- `referenceStore.ts` — текст/ширина reference-панели.
- `toastStore.ts` — тосты (`toast(msg, type)`).

### Pure logic (`src/lib/`) — без side effects
- `replaceEngine.ts` — find/replace, пресеты, regex.
- `tabUtils.ts` — `makeTab`, `makeAutoTitle`, `normalizeTab`, `partitionPinned`, `canCleanupTab`.
- `tmuxResolve.ts` / `herdrResolve.ts` — резолв привязки в живой хендл (**критический путь**, см. Gotchas). Чистые, проверяются без Tauri.
- `terminalTargets/` — абстракция терминальных таргетов: `types.ts` (контракт), `herdr.ts` / `orca.ts` / `tmux.ts` (провайдеры), `shell.ts` (запуск scoped-команд + JSON-narrowing), `index.ts` (реестр, `providerFor`, `describeBinding`, `sameBinding`, `statusOf`).
- `markdownEdit.ts` — отступы, продолжение списков, обёртки `**`/`*`, автопары. Каждая операция
  возвращает `EditPatch | null` (`null` = отдать клавишу браузеру), DOM не трогает.
- `db.ts` — схема IndexedDB (**и есть источник правды по схеме**, не дублировать в markdown).
  Соединение **одно на приложение** и кэшируется: открытые соединения блокируют апгрейд
  версии, поэтому «по соединению на вызов» однажды повесило бы следующий bump `DB_VERSION`.
- `platform.ts` — `isTauri`.

### Hooks (`src/hooks/`)
- `useSessionPersistence.ts` — дебаунс 500ms, синк всех сторов в IndexedDB; флаг `isHydrated`
  блокирует запись до конца восстановления.
- `useKeyboardShortcuts.ts` — глобальный `keydown`-листенер (по `e.code`, не `e.key`).
- `useEditorKeymap.ts` — `keydown` **самой textarea** (Tab/Enter/Ctrl+B/Ctrl+I/автопары).
  Живёт локально, а не в глобальном листенере: операции работают с выделением textarea.
- `useFileIO.ts` — сохранение/открытие файлов, export/import бэкапа.
- `useCommands.ts` — каталог команд палитры.
- `useTerminalActions.ts` — **один** хук на все таргеты: цепочка резолва, пикер, привязка, тосты, clipboard-фолбэк.
- `useTargetStatus.ts` — живой статус привязанного агента (опрос 3с, только когда окно в фокусе).

### Отправка промпта (`Ctrl+Enter`)
Диспетчера в `App.tsx` больше нет: `useTerminalActions` берёт `tab.binding`, находит провайдера
через `providerFor` и работает с ним. Цепочка: **Explicit** (привязка таба) → **Last**
(последний выбор, in-memory) → **Modal** (единый `TargetPicker` с секциями herdr / Orca / tmux).

**Провайдеры отправляют по-разному, и это не случайность:**
- **tmux** — `set-buffer` + `paste-buffer -p` + settle 80мс + `send-keys Enter`.
- **Orca** — ручная bracketed-paste обёртка `\x1b[200~…\x1b[201~` + settle 80мс + `--enter`.
- **herdr** — `agent prompt`, и всё: обёртка и settle **не нужны и вредны** (уедут в промпт
  литералом). У herdr также **нет флага `--json`** — вывод и так JSON, лишний флаг роняет команду.

### Статус агента
`statusOf(binding)` берёт статус из `listTargets()` провайдера и находит свою строку через
`sameBinding` — **отдельного метода в контракте нет и не нужно**: статус уже едет в таргетах.
tmux их не отдаёт → вернётся `null` сам собой, без ветки по источнику.

Неоднозначность → `null`, а не первое совпадение (тот же инвариант, что при отправке).

**Подпись показывается только у состояний, ждущих действия пользователя** (`blocked`/`waiting`),
остальное — тихая точка. Основание не вкусовое: по release-notes herdr 0.7.5 `blocked` = «агент
встал и ждёт, пока пользователь ответит». Заодно ширина StatusBar не гуляет на каждом опросе.

Опрос, а не подписка: хуков от herdr/Orca к нам не ведёт — это та самая граница, описанная в
ROADMAP в заметке про agent-hooks (listener сломал бы no-egress-постуру редактора).

### Editor (`src/components/Editor/`)
`<textarea>` не умеет подсветку. Оверлей: `<div>` точно под текстареа (тот же шрифт/размер/скролл)
рендерит `<mark>` на позициях совпадений; текстареа сверху с `background: transparent`.

Клавиатурные правки (`useEditorKeymap` → `applyPatch`) идут **мимо `onChange`**: патч кладётся
через `setRangeText`, потом руками зовётся `updateContent`. Обязательный шаг — **отменить висящий
`rafRef`**: он держит значение, снятое ДО патча, и, сработав следом, откатил бы правку.

**Слэш-меню** (`lib/slashMenu.ts` + `Editor/SlashMenu.tsx` + `Editor/caretCoords.ts`, tasks/17):
`/` в начале строки или после пробела открывает инлайн-список — фразы-триггеры, затем
markdown-леса. Четыре вещи, которые тут легко сломать:
- **Детект по тексту слева от каретки, НЕ по коду клавиши.** На ЙЦУКЕН физическая `Slash` даёт
  «.», проверка по `e.code`/`e.key` открывала бы меню не от того символа.
- **Перехват клавиш стоит ДО `useEditorKeymap`**, иначе `Enter` уходит в `continueList`, а `Tab`
  — в `indentSelection`. `Escape` требует `stopPropagation`: глобальный листенер закрыл бы
  заодно панели, которых пользователь не трогал.
- **Состояние `null`, пока меню закрыто** — иначе вернётся ре-рендер на каждую букву, ровно тот,
  которого избегает `renderContent`.
- **Триггер перечитывается из живой textarea в момент вставки**, а не берётся из состояния:
  сохранённый мог устареть (внешняя правка, смена таба) и увести патч по чужим индексам.

Фразы отсюда встают **всегда в каретку**, даже когда `phraseInsertMode` стоит на `prepend`:
`/` вызывается в конкретной точке текста. `Ctrl+K` свою настройку сохраняет.

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
  binding?: TabBinding;       // ОДИН таргет на таб (было три взаимоисключимых поля)
}

// lib/terminalTargets/types.ts. Хранится СТАБИЛЬНЫЙ дескриптор, хендл резолвится живьём.
type TabBinding =
  | { source: "tmux";  session: string; window: string; windowId?: string }
  | { source: "orca";  worktree: string; titleHint?: string }
  | { source: "herdr"; paneId: string; workspace: string; tab: string };

interface TriggerPhrase { id: string; label: string; body: string; order: number }
interface ReplacePreset  { id: string; name: string; pairs: ReplacePair[] }
```

## Keyboard Shortcuts

Все — по `e.code` (см. Gotchas). Актуальный список — `src/hooks/useKeyboardShortcuts.ts`
(глобальные) и `src/hooks/useEditorKeymap.ts` (только когда фокус в редакторе).

| Сочетание | Действие |
|-----------|----------|
| `Ctrl+Enter` | Отправить промпт (по привязке таба) |
| `Ctrl+Shift+Enter` | Единый target picker (herdr / Orca / tmux) |
| `Ctrl+Alt+B` / `Ctrl+Alt+Shift+B` | Привязать / отвязать таб к терминалу |
| `Ctrl+B` / `Ctrl+I` | **Редактор:** жирный / курсив |
| `Ctrl+M` / `Ctrl+Shift+M` | **Редактор:** инлайн-код / блок кода |
| `Tab` / `Shift+Tab` | **Редактор:** отступ / убрать отступ (вкладывает пункт списка) |
| `Ctrl+Shift+,` / `.` | Сдвинуть таб влево / вправо (второй аккорд — `Ctrl+Shift+PgUp`/`PgDn`) |
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
| `/` | **Редактор:** слэш-меню (фразы + markdown), в начале строки или после пробела |
| `Ctrl+F` / `Ctrl+H` | Find / Find & Replace |
| `Ctrl+S` / `Ctrl+O` | Записать сейчас (запись и так автоматическая) / открыть файл |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+R` | Reference panel |
| `Alt+M` | Markdown preview |
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
   fallback; несколько совпадений → `ambiguous` → переспросить, **не отправлять**. Тот же
   инвариант держат Orca и herdr: у herdr `pane_id` персистится, **но номера панелей
   переиспользуются**, поэтому резолв требует совпадения id И пары лейблов. Тип `Resolution`
   разводит `not-found` и `ambiguous` намеренно — пользователь должен понимать, почему
   открылся пикер. **Не откатывать к матчингу только по имени** — это баг 2026-07-10.

3. **Custom equality в Zustand-селекторах.** `TabBar` подписан через `tabsMetaEqual` — при
   добавлении нового поля в `Tab`, влияющего на отрисовку полосы, **его надо добавить и в
   `tabsMetaEqual`**, иначе полоса молча «замерзает». Ловушка срабатывала уже четырежды:
   `orcaBinding`, `workspaceId`, `groupId`, `herdrBinding`.

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

9. **`catch` вокруг Tauri-вызовов ловит не `Error`.** `Command.execute()` из
   `tauri-plugin-shell` отклоняет промис **строкой** — ошибка приходит из Rust, и в `Error` её
   никто не оборачивает. Поэтому `error instanceof Error ? error.message : "…"` тихо выбрасывает
   настоящую причину: так сбой отправки у 2-го пользователя показал «Herdr: Неизвестная ошибка» и
   стал нерасследуемым. Описывать ошибки только через `describeError` из `lib/terminalTargets`.

   ⚠️ **И даже настоящее сообщение из шелла врёт про причину.** `plugin-shell` в `commands.rs`
   разбирает результат `scope.prepare` и любой отказ — включая **провал регекс-валидатора
   аргумента** — отдаёт как `program not allowed on the configured shell scope: <entry>`.
   Настоящая ошибка печатается только под `#[cfg(debug_assertions)]`, в релизной сборке
   теряется совсем. Так у 2-го пользователя выглядел herdr 0.6.10: `pane_id`
   `w657cefe818690a-1` не подошёл под валидатор `^w[A-Za-z0-9]+:p[A-Za-z0-9]+$`, а текст винил
   разрешение. Поэтому `runScoped` дописывает хендл через `withTarget` — **не убирать**, это
   единственное, что делает такой отказ диагностируемым по одному скриншоту.

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
- **Архив закрытых табов живёт в сторе `tabs` с маркером `closedAt`**, а не в отдельном
  сторе: новый object store = bump версии, а он у 2-го пользователя ломает откат на
  старый бинарь. Расщепление на живые/архив — на границе персистенса (`loadSession`),
  поэтому в сторе `tabs` всегда только живые и архив не может протечь в UI.
- **Смена формы поля внутри таба тоже не требует bump** — табы кладутся в IndexedDB целиком.
  Так три поля привязок схлопнулись в `binding`: конверсия легаси живёт в `normalizeTab`
  (нормализация на чтении, там же где `titleSource`), старые поля стираются. Это НЕ миграция
  данных — но **не удалять эту ветку**, пока у второго пользователя может лежать старая база.

## Тесты

`bun test` (встроен в bun, отдельного раннера нет). Файлы — `*.test.ts` рядом с проверяемым
модулем. Единственная dev-зависимость ради тестов — `fake-indexeddb`.

**Что покрыто и почему именно оно** (не «всё подряд», а места с ценой ошибки):
- `lib/targetResolve.test.ts` — резолв tmux и herdr. Самый дорогой класс ошибок в проекте:
  промпт, улетевший НЕ ТОМУ агенту (баг 2026-07-10). Инвариант «при неоднозначности не
  угадывать» проверяется здесь, а не глазами на живой топологии.
- `lib/tabUtils.test.ts` — `normalizeTab` (единственная функция, читающая ЧУЖУЮ базу) плюс
  инварианты полосы: `arrangeTabs`, `partitionGroups`, `stepTab`, `canCleanupTab`.
- `lib/db.test.ts` — round-trip сессии, порченые значения, **апгрейд v5→v6 и v1→v6**.
- `lib/terminalTargets/terminalTargets.test.ts` — `sameBinding`, `describeError`, сужение
  вывода CLI.

**НЕ покрыто сознательно:** компоненты и хуки. Ломаются от вёрстки, а не от багов, и требуют
jsdom + testing-library. Заводить, когда появится дефект, который они бы поймали.

Тесты нельзя писать «по реализации»: `stepTab` уже поймал НЕВЕРНОЕ ожидание в тесте, а не
дефект в коде (таб на левом краю не может выйти из группы — соседа слева нет).

## Code Quality Rules

- TypeScript strict — без `any`; `unknown` + type guards.
- Логика без side effects — в `src/lib/` чистыми функциями (так вынесен `tmuxResolve.ts`, что
  позволило проверить критический резолв без Tauri).
- Компоненты ~150 строк максимум — логику выносить в хуки.
- Коммиты — русские, Conventional Commits.
- **Язык: UI — английский, комментарии и коммиты — русские.** Всё, что видит пользователь
  (подписи, плейсхолдеры, `title`/`aria-label`, тосты, тексты диалогов, `label`/`group` в
  `lib/shortcuts.ts`, сид-данные `DEFAULT_PRESETS` / `DEFAULT_PHRASES`), пишется по-английски.
  Комментарии, имена тестов и сообщения коммитов остаются русскими — это внутренняя
  поверхность, её читают автор и агенты, а не пользователи.
  i18n (переключатель языков, файлы локализации) — **явный отказ**, см. ROADMAP.
  > Правило заведено 2026-08-09, когда язык унифицировали: до этого UI говорил на двух
  > языках **внутри одной панели** (`placeholder="Поиск по всем табам..."` рядом с
  > `title="Case sensitive"`), потому что раскол шёл по возрасту кода, а не по смыслу.

## Модалки-пикеры

Все построены на `usePickerModal` + `PickerModal` (примитив извлечён в #9). Консьюмеры:
`TabSwitcher`, `GlobalSearchPanel`, `CommandPalette`, `TargetPicker`, `WorkspaceSwitcher`,
`TabGroupPicker`. Новые писать **на примитиве**, не изобретая свой.

Сгруппированные списки (`TargetPicker`, `GlobalSearchPanel`) держат **плоский курсор сквозь
секции**: плоский массив `rows` — источник правды для индекса, секции рисуются поверх него
общим счётчиком `cursor++`, каждая строка клеит `data-picker-index`. Не заводить курсор
на секцию — доскролл и `Enter` в примитиве работают по плоскому индексу.

`TriggerPhrasePicker` — единственный НЕ на примитиве (двухрежимная модалка list/edit, где
`Enter`/стрелки обязаны быть нативными). Решение автора: не трогать.
