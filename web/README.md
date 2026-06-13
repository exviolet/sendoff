<div align="center">

<img src="public/favicon.svg" alt="Rewrite" width="112" height="112" />

# Rewrite

**A prompt-first editor for drafting LLM prompts — fast, local, keyboard-driven.**

<img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=for-the-badge" alt="License MIT" />
<img src="https://img.shields.io/badge/status-personal_project-c4b5fd?style=for-the-badge" alt="Status: personal project" />
<img src="https://img.shields.io/badge/version-0.1.x-2a2650?style=for-the-badge" alt="Version 0.1.x" />

English · [Русский](README.ru.md)

</div>

Rewrite is a minimal text editor built around one workflow: write a prompt in a
real editing surface, then fire it straight into the terminal agent you're
already running. It was born from a concrete annoyance — the cramped input box
in Claude Code and the awkward scrollback in long `tmux` sessions. Rewrite gives
the prompt room to breathe before it's sent.

No backend, no API keys, no telemetry. Everything runs client-side.

> **Not** a pipeline builder, a knowledge base, or a code editor — by design.

## The core loop

```
┌─────────────┐   Ctrl+Enter    ┌──────────────┐
│   Rewrite   │ ──────────────► │  tmux pane   │
│  draft your │                 │  Claude Code │
│   prompt    │ ◄────────────── │  / any agent │
└─────────────┘   paste reply   └──────────────┘
        ▲ Ctrl+R reference panel keeps the reply in view
```

Draft the prompt → `Ctrl+Enter` sends it to the active `tmux` pane → keep the
agent's reply pinned in the reference panel while you write the next one.

> **The `tmux` send needs the [desktop build](https://github.com/exviolet/rewrite-desktop).**
> The direct write into a `tmux` pane goes through the Tauri shell, which only
> the desktop app has. In a plain browser tab `Ctrl+Enter` falls back to copying
> the buffer to the clipboard. Rewrite is **desktop-first**; the browser build is
> a limited editor without the terminal bridge.

## Features

**Prompt workflow**
- **Send to tmux** (`Ctrl+Enter`) — push the current buffer into the bound or
  active `tmux` pane without leaving the keyboard.
- **tmux target picker** (`Ctrl+Shift+Enter`) — choose the destination
  session / window / pane by name instead of relying on the active pane.
- **tmux tab-binding** (`Ctrl+B` / `Ctrl+Shift+B`) — bind a tab to a specific
  tmux window by `session:window` name; the status bar shows the live binding so
  `Ctrl+Enter` always lands in the right place.
- **Reference panel** (`Ctrl+R`) — a resizable, persisted side panel to keep an
  agent's reply visible while you compose the follow-up.

**Tabs that scale**
- Tabbed editor with drag-and-drop reorder; survives restarts (75+ tabs daily).
- Tabs auto-name themselves from the first line; empty tabs auto-clean.
- **Tab switcher** (`Ctrl+T`) with a live content preview.
- **Global tab search** (`Ctrl+Shift+D`) — full-text search across every tab.
- **Pin tabs** (`Ctrl+P`) — keep important drafts pinned at the front of the tab bar.

**Text tooling**
- Find & Replace with a real-time highlight overlay.
- Bulk find & replace with a diff preview before applying.
- **Replace presets** — reusable bulk-replacement rule sets (the original use
  case: tone conversion, e.g. formal `Вы/Ваш` → collaborative `Мы/Наш`).
- Markdown preview, distraction-free mode, command palette (`Ctrl+P`).

**Under the hood**
- Session persistence via IndexedDB — close and reopen, everything's there.
- File import/export (`.txt`, `.md`).
- Light / dark / system theme.

## Quick start

```bash
bun install
bun dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
bun run build      # production build
bun run preview    # serve the production build locally
```

> Looking for the native desktop app? See
> [**rewrite-desktop**](https://github.com/exviolet/rewrite-desktop) — a Tauri v2
> wrapper with native dialogs, a custom title bar, and the `tmux` integration.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send buffer to bound / active tmux pane |
| `Ctrl+Shift+Enter` | tmux target picker |
| `Ctrl+B` / `Ctrl+Shift+B` | Bind / unbind tab to tmux window |
| `Ctrl+R` | Toggle reference panel |
| `Ctrl+T` | Tab switcher (with preview) |
| `Ctrl+Shift+D` | Global tab search |
| `Ctrl+P` | Pin / unpin current tab |
| `Ctrl+N` / `Ctrl+W` | New / close tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+F` / `Ctrl+H` | Find / Find & Replace |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+S` / `Ctrl+O` | Save / open file |
| `Ctrl+.` | Toggle presets sidebar |
| `Ctrl+M` | Markdown preview |
| `Ctrl+Shift+F` | Distraction-free mode |
| `Ctrl+,` | Settings |
| `Ctrl+/` | Shortcuts reference |
| `Escape` | Close panels |

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite + Bun |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Persistence | IndexedDB (`idb`) |
| Editor | Native `<textarea>` + custom overlay — no Monaco/CodeMirror |

## Status

A personal tool, used daily, still on `v0.1.x`. Public so it can serve as a
portfolio piece — **it works for me, but no support or stability is guaranteed.**
Expect fast, unannounced breaking changes.

## License

MIT
