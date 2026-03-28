# RewriteBox

Fast, minimal browser-based text editor for bulk find & replace. Primary use case: converting text tone (e.g. formal "Вы/Ваш" to collaborative "Мы/Наш") using reusable presets.

No backend, no API keys — everything runs client-side.

## Quick Start

```bash
bun install
bun dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Production Build

```bash
bun run build
bun run preview   # test the production build locally
```

## Features

- Tabbed editor with drag & drop reorder
- Find & Replace with real-time highlight overlay
- Replace Presets — save and apply bulk replacement rules
- AI Prompt Builder — assemble prompts from templates, copy to clipboard
- Session persistence via IndexedDB
- File import/export (.txt, .md)
- Command Palette (Ctrl+P)
- Distraction-free mode
- Undo/Redo with debounced history

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / Previous tab |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find & Replace |
| `Ctrl+K` | AI Prompt panel |
| `Ctrl+P` | Command Palette |
| `Ctrl+S` | Save as .txt |
| `Ctrl+O` | Open file |
| `Ctrl+Shift+F` | Distraction-free mode |
| `Ctrl+/` | Keyboard shortcuts reference |
| `Escape` | Close panels |

## Tech Stack

- React 19 + TypeScript (strict)
- Vite + Bun
- Tailwind CSS v4
- Zustand (state management)
- IndexedDB via `idb` (persistence)

## Roadmap

- **Phase 7** — Tauri v2 desktop wrapper (zero frontend changes required)
