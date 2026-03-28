# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RewriteBox is a fast, minimal browser-based personal text editor. The primary use case is pasting text and applying bulk replacements (e.g. converting formal "Вы/Ваш" tone to collaborative "Мы/Наш"). No backend, no API keys — everything runs client-side.

## Commands

```bash
# Development
bun dev               # Start dev server
bun tsc --noEmit      # TypeScript type checking (must pass: zero errors)
bun lint              # ESLint validation (must pass: zero warnings/errors)

# Production
bun run build
bun run preview       # Test production build locally
```

**After every phase**: run `bun tsc --noEmit` and `bun lint` — both must be clean before proceeding.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript strict |
| Build | Vite + Bun |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin) |
| Editor | Native `<textarea>` + custom hooks (no Monaco/CodeMirror) |
| State | Zustand (`useEditorStore`, `usePresetsStore`, `usePromptTemplatesStore`) |
| Persistence | IndexedDB via `idb` (`rewritebox-db` v3) |

## Architecture

### State Stores (`src/store/`)
- `editorStore.ts` — tabs array, activeTabId, CRUD, reorderTab, undo/redo, markSaved, hydrate
- `presetsStore.ts` — replace presets with apply action, hydrate
- `promptTemplatesStore.ts` — AI prompt templates CRUD (with `order` field), hydrate with sorting

### Core Logic (`src/lib/`) — pure functions, no side effects
- `replaceEngine.ts` — findMatches, replaceAll, applyReplacePairs (regex support)
- `promptBuilder.ts` — `PromptTemplate` type, `assemblePrompt()`, `hasInstructionPlaceholder()`; uses `{{TEXT}}`/`{{INSTRUCTION}}` placeholders
- `db.ts` — `idb` schema v3 (stores: `tabs`, `presets`, `promptTemplates`, `meta`); includes v2→v3 migration

### Hooks (`src/hooks/`)
- `useSessionPersistence.ts` — debounced (500ms) IndexedDB sync; subscribes to all 3 stores; `isHydrated` flag prevents writes before restore completes
- `useFileIO.ts` — `Ctrl+S` saves `.txt` via `<a download>`, `Ctrl+O` opens file picker; export/import includes all stores
- `useKeyboardShortcuts.ts` — global `document` keyboard listener using `e.code` (not `e.key`)

### Editor Component (`src/components/Editor/`)
Native `<textarea>` cannot highlight text. The highlight overlay works as:
- A `<div>` positioned exactly behind the textarea (same font, size, scroll sync)
- The div renders `<mark>` elements at match positions
- Textarea sits on top with `background: transparent`

### Panel Architecture
`App.tsx` manages panel state (find/replace, presets, AI prompt). Presets and AI Prompt panels are mutually exclusive (`absolute right-0`). `textareaRef` is lifted to `App` and passed via props to `Editor` and `AIPromptPanel`.

## Data Models

```ts
interface Tab {
  id: string;        // uuid
  title: string;     // "Untitled N" or filename
  content: string;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ReplacePair {
  from: string;
  to: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

interface ReplacePreset {
  id: string;
  name: string;
  pairs: ReplacePair[];
}

interface PromptTemplate {
  id: string;
  name: string;
  template: string;  // {{TEXT}} and optionally {{INSTRUCTION}} placeholders
  order: number;
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / Previous tab |
| `Ctrl+F` | Find panel |
| `Ctrl+H` | Find & Replace panel |
| `Ctrl+K` | AI Prompt panel |
| `Ctrl+S` | Save as `.txt` |
| `Ctrl+O` | Open `.txt` file |
| `Ctrl+P` | Command palette |
| `Ctrl+Shift+F` | Distraction-free mode |
| `Ctrl+?` | Keyboard shortcuts modal |
| `Escape` | Close panels |

## Critical Gotchas

1. **Unicode word boundaries** — `\b` in JS regex doesn't work with Cyrillic. `replaceEngine.ts` uses Unicode-aware lookarounds: `(?<![\p{L}\p{N}])` / `(?![\p{L}\p{N}])` with flag `u`.

2. **Keyboard shortcuts use `e.code`, not `e.key`** — on Cyrillic layout `e.key` for Ctrl+S returns `"ы"`, not `"s"`. All shortcuts use `e.code` (`"KeyS"`, `"KeyO"`, etc.), except `Tab` and `Escape` which are layout-independent.

3. **ESLint React Compiler rules** — the project enables `react-hooks/refs`, `react-hooks/set-state-in-effect`, `react-hooks/preserve-manual-memoization`. Key constraints:
   - No reading `ref.current` during render — only in event handlers and effects
   - No synchronous `setState` in `useEffect` body
   - `useCallback` deps must match compiler-inferred dependencies

4. **Persistence hydration** — all three stores have `hydrate()`. The `isHydrated` flag in `useSessionPersistence` prevents IndexedDB writes before restore completes.

5. **Undo/Redo debounce** — 500ms debounce; fast typing saves only first snapshot of a "series". Large changes (`lenDiff > 1`) are recorded immediately. `flushPending()` is called before `undo()`/`redo()`.

## Implementation Phases

The project is built in phases — complete one fully before starting the next. See `docs/implementation-prompr.md` for full phase specifications.

1. **Phase 1** ✅ — Project scaffold + core editor (tabbed textarea, Zustand store)
2. **Phase 2** ✅ — Find & Replace panel with real-time highlight overlay
3. **Phase 3** ✅ — Replace Presets (core feature; default "Вы → Мы" preset)
4. **Phase 4** ✅ — Session persistence (IndexedDB) + file export/import
5. **Phase 5** ✅ — AI Prompt Builder (clipboard-based, no API calls)
6. **Phase 6** — Polish: command palette, distraction-free mode, production build
7. **Phase 7** (future) — Tauri v2 wrapper; zero frontend changes required

## Code Quality Rules

- TypeScript strict mode — no `any`, use `unknown` + type guards
- All replace/search logic lives in `src/lib/` as pure functions
- Components max ~150 lines — extract logic into custom hooks
- Commit after each phase: `feat(scope): описание на русском` (Conventional Commits, Russian messages)
