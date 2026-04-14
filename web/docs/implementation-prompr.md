# Rewrite — Personal Text Editor
## Prompt for Claude Code Opus 4.6

---

## Role

You are an expert React + TypeScript developer. You will build **Rewrite** — a fast, minimal personal text editor as a local web application. The goal is a tool that opens instantly in a browser tab, lets the user paste any text, quickly find/replace, rewrite, and manage multiple documents — without the overhead of VS Code, Obsidian, or Notion.

---

## Product Vision

**The problem**: The developer needs to quickly paste text, make targeted edits (e.g. replace "Вы" → "Мы", "ваш" → "наш"), and move on. No existing tool hits the sweet spot between "too primitive" (browser textarea, Telegram) and "too heavy" (Obsidian, VS Code, Neovim).

**The solution**: A focused local web app — fast, distraction-free, always open in a browser tab.

**Strategy**: Build the web app first to nail UX and features. Wrap in Tauri v2 later for desktop icon, fast launch, and proper Wayland support. The web app must be self-contained so the Tauri wrapper requires zero changes to frontend code.

---

## Tech Stack

| Layer       | Technology                                |
|-------------|-------------------------------------------|
| Framework   | React 19 + TypeScript (strict)            |
| Build       | Vite + Bun                                |
| Styling     | Tailwind CSS v4                           |
| Editor      | Native `<textarea>` enhanced with custom hooks (no heavy editor libraries in MVP) |
| State       | Zustand                                   |
| Persistence | IndexedDB via `idb` library               |
| Routing     | None needed (single page)                 |

> **No backend. No API keys. No Tauri in Phase 1–4.** Everything runs in the browser.

---

## Implementation Phases

Implement strictly one phase at a time. After each phase: run the verification checklist, confirm it passes, then ask for approval before continuing.

---

### Phase 1 — Project Scaffold + Core Editor

**Goal**: A working text editor in the browser. Just a textarea, but done right.

**Steps**:

1. Scaffold the project:
   ```bash
   bun create vite rewrite --template react-ts
   cd rewrite
   bun install
   bun add zustand idb
   bun add -d tailwindcss @tailwindcss/vite prettier eslint
   ```

2. Configure Tailwind CSS v4 via `@tailwindcss/vite` plugin.

3. Configure `tsconfig.json` with `"strict": true`.

4. Create the main editor layout:
   - Full-viewport app: header bar (top) + editor area (fills remaining height)
   - Header: app name "Rewrite", tab bar, action buttons
   - Editor: a `<textarea>` that fills 100% of available space, no resize handle, monospace font, comfortable line height

5. Zustand store `useEditorStore`:
   ```ts
   interface Tab {
     id: string;           // uuid
     title: string;        // filename or "Untitled N"
     content: string;
     isDirty: boolean;
     createdAt: number;
     updatedAt: number;
   }

   interface EditorStore {
     tabs: Tab[];
     activeTabId: string | null;
     // actions:
     createTab: () => void;
     closeTab: (id: string) => void;
     setActiveTab: (id: string) => void;
     updateContent: (id: string, content: string) => void;
     renameTab: (id: string, title: string) => void;
   }
   ```

6. `<TabBar />` component:
   - Render all open tabs as horizontal pills/tabs
   - Active tab: visually distinct
   - Dirty indicator: small dot `●` on tab when `isDirty === true`
   - `+` button: creates new empty tab
   - `×` button on each tab: close tab (if dirty, show native `confirm()` dialog)
   - On close of last tab: auto-create a new empty Untitled tab

7. Keyboard shortcuts (global, captured with `useEffect` on `document`):
   - `Ctrl+N` — new tab
   - `Ctrl+W` — close current tab
   - `Ctrl+Tab` — switch to next tab
   - `Ctrl+Shift+Tab` — switch to previous tab

**Verification**:
- [ ] `bun dev` starts with no errors
- [ ] Multiple tabs can be opened, content is independent per tab
- [ ] Dirty indicator appears on typing, active tab is visually clear
- [ ] `bun tsc --noEmit` passes with zero errors

---

### Phase 2 — Find & Replace

**Goal**: Fast, real-time search and replace across the current document.

**Steps**:

1. `<FindReplacePanel />` component — a panel that slides in from the bottom or top (not a modal):
   - Find input field
   - Replace input field
   - Options (as toggle buttons): `Aa` (case sensitive), `.*` (regex)
   - Match counter display: `3 of 12` (or `No matches`)
   - Buttons: **Find Next**, **Find Prev**, **Replace**, **Replace All**
   - Close button (`×`) or `Escape` key to dismiss

2. Keyboard shortcuts:
   - `Ctrl+F` — open Find panel (focus on find input)
   - `Ctrl+H` — open Find & Replace panel (focus on find input)
   - `Escape` — close panel, return focus to textarea
   - `Enter` in find input — Find Next
   - `Shift+Enter` in find input — Find Prev

3. Implementation logic (pure functions, no library needed):
   - Compute all match positions in `content` string
   - Display count
   - On "Replace": replace match at current index, move to next
   - On "Replace All": replace all matches at once, update tab content via store

4. Highlight matches in textarea:
   > Note: native `<textarea>` cannot highlight text. Use a layered approach:
   > - A `<div>` positioned exactly behind the textarea (same font, size, scroll)
   > - The div renders HTML with `<mark>` elements at match positions
   > - The textarea sits on top with `background: transparent`
   > - Sync scroll position between div and textarea

**Verification**:
- [ ] `Ctrl+F` opens panel, typing finds matches in real-time
- [ ] Match counter is accurate
- [ ] Replace All updates textarea content immediately
- [ ] Panel closes on `Escape` and returns focus to editor
- [ ] `bun tsc --noEmit` passes

---

### Phase 3 — Replace Presets (Core Feature)

**Goal**: One-click bulk replacements for common rewriting tasks.

This is the primary use case: e.g. converting formal "Вы/Ваш" tone to collaborative "Мы/Наш".

**Steps**:

1. Data model for a preset:
   ```ts
   interface ReplacePair {
     from: string;
     to: string;
     caseSensitive: boolean;
     wholeWord: boolean;      // match whole word only
   }

   interface ReplacePreset {
     id: string;
     name: string;            // e.g. "Вы → Мы (формальный)"
     pairs: ReplacePair[];
   }
   ```

2. Default presets (hardcoded, loaded on first run):
   ```ts
   const DEFAULT_PRESETS: ReplacePreset[] = [
     {
       id: 'vy-my',
       name: 'Вы → Мы',
       pairs: [
         { from: 'Вы',    to: 'Мы',    caseSensitive: true,  wholeWord: true },
         { from: 'вы',    to: 'мы',    caseSensitive: true,  wholeWord: true },
         { from: 'Ваш',   to: 'Наш',   caseSensitive: true,  wholeWord: false },
         { from: 'ваш',   to: 'наш',   caseSensitive: true,  wholeWord: false },
         { from: 'Вашего','to': 'Нашего', caseSensitive: true, wholeWord: false },
         { from: 'Вам',   to: 'Нам',   caseSensitive: true,  wholeWord: false },
       ]
     },
     {
       id: 'my-vy',
       name: 'Мы → Вы (обратно)',
       pairs: [
         { from: 'Мы',    to: 'Вы',    caseSensitive: true,  wholeWord: true },
         { from: 'мы',    to: 'вы',    caseSensitive: true,  wholeWord: true },
         { from: 'Наш',   to: 'Ваш',   caseSensitive: true,  wholeWord: false },
         { from: 'наш',   to: 'ваш',   caseSensitive: true,  wholeWord: false },
       ]
     }
   ];
   ```

3. `<PresetsPanel />` component (sidebar or dropdown):
   - List of presets with their name
   - Each preset: **Apply** button + edit icon + delete icon
   - **Apply**: runs all pairs in sequence on current tab content, updates store, marks tab dirty
   - Shows a small toast/notification: `Replaced 14 occurrences`

4. Preset Editor (inline form):
   - Name input
   - List of `from → to` pairs (add/remove rows)
   - Per-pair toggles: case sensitive, whole word
   - Save button

5. Preset storage: stored in Zustand + persisted to IndexedDB (same as tabs)

6. Zustand store `usePresetsStore`:
   ```ts
   interface PresetsStore {
     presets: ReplacePreset[];
     addPreset: (preset: ReplacePreset) => void;
     updatePreset: (id: string, preset: Partial<ReplacePreset>) => void;
     deletePreset: (id: string) => void;
     applyPreset: (presetId: string, tabId: string) => void;
   }
   ```

**Verification**:
- [ ] Default presets appear in the UI on first load
- [ ] "Вы → Мы" preset correctly replaces all variants in test text
- [ ] Custom preset can be created, saved, and applied
- [ ] Applied replacements are undoable with `Ctrl+Z` (browser native undo in textarea)
- [ ] `bun tsc --noEmit` passes

---

### Phase 4 — Session Persistence + Export/Import

**Goal**: App remembers everything between browser restarts. Files can be saved/loaded.

**Steps**:

1. IndexedDB schema via `idb`:
   ```ts
   // DB name: 'rewrite-db', version: 1
   // Stores:
   //   'tabs'    — Tab objects, indexed by id
   //   'presets' — ReplacePreset objects, indexed by id
   //   'meta'    — key/value: { activeTabId, version }
   ```

2. Persistence hooks:
   - `useSessionPersistence()`: on every store change (debounced 500ms), serialize and write to IndexedDB
   - On app mount: read from IndexedDB, restore tabs, active tab, and presets
   - If DB is empty (first launch): create one empty "Untitled 1" tab

3. File export/import:
   - `Ctrl+S` — save current tab content as `.txt` file (use browser `<a download>` trick)
   - `Ctrl+O` — open file picker (`<input type="file">` hidden, triggered programmatically), load `.txt` file content into new tab
   - Export button in UI also available for discoverability

4. Import/Export all sessions:
   - "Export all" button: downloads `rewrite-backup.json` containing all tabs + presets
   - "Import backup" button: reads the JSON file and merges into current session

**Verification**:
- [ ] Close and reopen the browser tab — all tabs, content, and presets are restored
- [ ] `Ctrl+S` downloads current tab content as a `.txt` file
- [ ] `Ctrl+O` loads a `.txt` file into a new tab
- [ ] Export/import backup round-trip works (export → clear IndexedDB → import → everything restored)
- [ ] `bun tsc --noEmit` passes

---

### Phase 5 — AI Prompt Builder (No API Required)

**Goal**: Build a "wrap in Claude prompt" feature. No API calls — just smart clipboard operations.

**Steps**:

1. Prompt template model:
   ```ts
   interface PromptTemplate {
     id: string;
     name: string;
     template: string;   // {{TEXT}} placeholder for selected/full content
   }
   ```

2. Default prompt templates:
   ```ts
   const DEFAULT_TEMPLATES: PromptTemplate[] = [
     {
       id: 'rewrite-formal',
       name: 'Переписать (формально)',
       template: `Перепиши следующий текст, заменив все обращения на "мы"/"наш" вместо "вы"/"ваш". Сохрани структуру и смысл. Верни только готовый текст без пояснений.\n\n{{TEXT}}`
     },
     {
       id: 'rewrite-friendly',
       name: 'Сделать дружелюбнее',
       template: `Перепиши следующий текст в более дружелюбном и неформальном тоне. Сохрани всю информацию. Верни только готовый текст.\n\n{{TEXT}}`
     },
     {
       id: 'custom',
       name: 'Свой промпт',
       template: `{{INSTRUCTION}}\n\n{{TEXT}}`
     }
   ]
   ```

3. `<AIPromptPanel />` — triggered by `Ctrl+K` or "AI" button in header:
   - Dropdown: select template
   - Preview: shows the assembled prompt (template + current text or selection)
   - If template has `{{INSTRUCTION}}`: show extra text input for custom instruction
   - Source toggle: "Selected text" / "Full document"
   - Primary button: **"Скопировать промпт"** — copies assembled prompt to clipboard
   - Secondary button: **"Скопировать только текст"**
   - After copy: show toast `Промпт скопирован → вставь в Claude Desktop`

4. "Paste result" helper:
   - After copying, show a subtle secondary action: **"Вставить результат"** button
   - Clicking it focuses the textarea — user pastes the AI result manually
   - If text is selected, paste replaces the selection; otherwise appends

5. Template editor (accessible from the panel):
   - User can create/edit/delete custom prompt templates
   - Persisted in IndexedDB alongside presets

**Verification**:
- [ ] `Ctrl+K` opens the AI panel
- [ ] Selecting a template + clicking "Скопировать промпт" puts correct text in clipboard
- [ ] Custom instruction input appears only for templates with `{{INSTRUCTION}}`
- [ ] Templates can be created and are persisted across sessions
- [ ] `bun tsc --noEmit` passes

---

### Phase 6 — Polish & Build

**Goal**: Production-ready web app, ready to be wrapped in Tauri later.

**Steps**:

1. Command palette (`Ctrl+P`):
   - Fuzzy-searchable list of all actions: New Tab, Close Tab, Find, Replace, Apply Preset, AI Prompt, Export, Import
   - Keyboard navigable (`↑↓`, `Enter`, `Escape`)

2. Word count & stats in status bar (bottom bar):
   - Characters, words, lines (updates on content change, debounced 100ms)
   - Current tab title (editable on double-click)

3. Distraction-free mode (`Ctrl+Shift+F`):
   - Hides header and status bar
   - Centers textarea with `max-width: 780px`, comfortable padding
   - Toggle off with same shortcut or `Escape`

4. Keyboard shortcut reference (`Ctrl+?`): modal listing all shortcuts

5. Production build + verification:
   ```bash
   bun run build
   bun run preview   # test the production build locally
   ```

6. `README.md` with:
   - How to run locally (`bun install && bun dev`)
   - All keyboard shortcuts
   - How to build for production
   - Note: "Tauri wrapping planned for Phase 7"

**Verification**:
- [ ] `bun run build` completes with no errors
- [ ] `bun run preview` — app works correctly from production build
- [ ] All keyboard shortcuts work and are listed in `Ctrl+?` modal
- [ ] `bun tsc --noEmit` passes

---

## File Structure

```
rewrite/
├── src/
│   ├── components/
│   │   ├── TabBar/
│   │   │   └── TabBar.tsx
│   │   ├── Editor/
│   │   │   ├── Editor.tsx           # textarea + highlight overlay
│   │   │   └── useHighlight.ts      # match highlight logic
│   │   ├── FindReplace/
│   │   │   └── FindReplacePanel.tsx
│   │   ├── Presets/
│   │   │   ├── PresetsPanel.tsx
│   │   │   └── PresetEditor.tsx
│   │   ├── AIPrompt/
│   │   │   └── AIPromptPanel.tsx
│   │   ├── CommandPalette/
│   │   │   └── CommandPalette.tsx
│   │   └── StatusBar/
│   │       └── StatusBar.tsx
│   ├── store/
│   │   ├── editorStore.ts           # tabs state
│   │   └── presetsStore.ts          # presets + prompt templates
│   ├── hooks/
│   │   ├── useSessionPersistence.ts  # IndexedDB sync
│   │   ├── useFileIO.ts              # export/import file helpers
│   │   └── useKeyboardShortcuts.ts   # global shortcuts
│   ├── lib/
│   │   ├── db.ts                     # idb database setup
│   │   ├── replaceEngine.ts          # pure replace logic (no side effects)
│   │   └── promptBuilder.ts          # template + text assembly
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## Code Quality Rules

- TypeScript strict mode (`"strict": true`)
- No `any` — use `unknown` + type guards
- All replace/search logic in `src/lib/` as pure functions with no side effects (easy to unit test)
- Components max ~150 lines — extract logic into custom hooks
- Prettier + ESLint configured and clean before each phase commit
- Commit after each phase with message: `feat: Phase N — <description>`

---

## Self-Verification Checklist (run after EVERY phase)

```bash
bun tsc --noEmit      # Zero TypeScript errors
bun lint              # Zero ESLint warnings/errors
bun dev               # App runs in browser, test the phase manually
```

---

## Tauri Wrapping (Phase 7 — Future)

> Do not implement this now. This section is for reference only.

When Phase 6 is complete and UX is validated, Phase 7 will:
1. Run `bun create tauri-app --template react-ts` into an existing project
2. Point Tauri at the Vite dev server / build output — zero frontend changes
3. Add `tauri-plugin-fs` + `tauri-plugin-dialog` to replace browser `<a download>` / `<input type="file">`
4. Replace IndexedDB with filesystem-backed storage (optional, IndexedDB still works in Tauri)
5. Add app icon + `.desktop` entry for Arch Linux

**No Rust knowledge required** — the entire backend will use pre-built Tauri plugins.

---

## Start Instruction

**Begin with Phase 1.**

1. Show the exact commands you will run to scaffold the project
2. List every file you will create, with full paths
3. Implement Phase 1 completely
4. Run the verification checklist and show the output
5. Ask explicitly: _"Phase 1 complete. Proceed to Phase 2?"_ — wait for confirmation
