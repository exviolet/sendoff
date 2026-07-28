<div align="center">

<img src="public/favicon.svg" alt="Rewrite" width="112" height="112" />

# Rewrite

**A prompt-first editor for drafting LLM prompts — fast, local, keyboard-driven.**

<img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=for-the-badge" alt="License MIT" />
<img src="https://img.shields.io/badge/status-personal_project-c4b5fd?style=for-the-badge" alt="Status: personal project" />
<img src="https://img.shields.io/badge/version-0.1.x-2a2650?style=for-the-badge" alt="Version 0.1.x" />

English · [Русский](README.ru.md)

</div>

<div align="center">

<img src="public/rewrite-demo.gif" alt="Draft a prompt in Rewrite, press Ctrl+Enter, and it lands in the tmux pane running Claude Code" width="900" />

<sub>Draft a prompt → <code>Ctrl+Enter</code> → it lands in the <code>tmux</code> pane running your agent.</sub>

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
- **tmux tab-binding** (`Ctrl+Alt+B` / `Ctrl+Alt+Shift+B`) — bind a tab to a specific
  tmux window by `windowId`; the status bar shows the live binding so
  `Ctrl+Enter` always lands in the right place. When two windows share a name,
  Rewrite asks instead of guessing — a prompt in the wrong agent is worse than
  an extra click.
- **[Orca ADE](https://github.com/stablyai/orca) agents** — if you run agents
  through Orca instead of raw tmux, `Ctrl+Enter` dispatches there: bind a tab to
  an agent and the prompt goes into that agent's terminal. Multi-line prompts
  arrive as one block (bracketed paste), submitted once.
- **Trigger phrases** (`Ctrl+K`) — reusable prompt fragments, inserted at the
  cursor.
- **Reference panel** (`Ctrl+R`) — a resizable, persisted side panel to keep an
  agent's reply visible while you compose the follow-up.

**Tabs that scale**
- Tabbed editor with drag-and-drop reorder; survives restarts (75+ tabs daily).
- Tabs auto-name themselves from the first line; empty tabs auto-clean.
- **Workspaces** (`Ctrl+Shift+W`) — group tabs by project; the tab bar shows
  only the active workspace, and pins are per-workspace.
- **Tab groups** (`Ctrl+G`) — colour-coded, named runs inside a workspace; collapse
  a group to a single chip, drag it as a whole, or act on several tabs at once with
  `Ctrl`+click. Collapsing only hides — it never closes anything.
- **Tab switcher** (`Ctrl+T`) with a live content preview.
- **Global tab search** (`Ctrl+Shift+D`) — full-text search across every tab,
  deliberately cross-workspace (the escape hatch out of isolation).
- **Pin tabs** (`Ctrl+P`) — keep important drafts pinned at the front of the tab bar.

**Text tooling**
- **Markdown editing** — `Ctrl+B` / `Ctrl+I` wrap (and unwrap) the selection or the
  word under the cursor; `Tab` / `Shift+Tab` indent and nest list items; `Enter`
  continues lists, numbering, checkboxes and blockquotes, and clears the marker on
  an empty item; brackets, quotes and backticks close around a selection, and a
  third backtick opens a fenced code block.
- Find & Replace with a real-time highlight overlay.
- Bulk find & replace with a diff preview before applying.
- **Replace presets** — reusable bulk-replacement rule sets (the original use
  case: tone conversion, e.g. formal `Вы/Ваш` → collaborative `Мы/Наш`).
- Markdown preview, distraction-free mode, command palette (`Ctrl+Shift+P`).

**Under the hood**
- Session persistence via IndexedDB — close and reopen, everything's there.
- File import/export (`.txt`, `.md`), plus full backup export/import.
- Light / dark / system theme, and a configurable editor font (`Ctrl+,`).

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
| `Ctrl+Alt+B` / `Ctrl+Alt+Shift+B` | Bind / unbind tab to tmux window |
| `Ctrl+B` / `Ctrl+I` | Bold / italic (selection or word under the cursor) |
| `Ctrl+M` / `Ctrl+Shift+M` | Inline code / fenced code block |
| `Tab` / `Shift+Tab` | Indent / outdent — nests list items |
| `Ctrl+R` | Toggle reference panel |
| `Ctrl+K` | Trigger phrases |
| `Ctrl+T` | Tab switcher (with preview) |
| `Ctrl+Shift+W` | Workspace switcher |
| `Ctrl+G` | Put the tab into a group (picker with a create row) |
| `Ctrl+Shift+D` | Global tab search |
| `Ctrl+P` | Pin / unpin current tab |
| `Ctrl+N` / `Ctrl+W` | New / close tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+Shift+PgUp` / `PgDn` | Move the tab left / right along the bar |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+F` / `Ctrl+H` | Find / Find & Replace |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+S` / `Ctrl+O` | Save / open file |
| `Ctrl+.` | Toggle presets sidebar |
| `Alt+M` | Markdown preview |
| `Ctrl+E` | Focus the editor |
| `Ctrl+Shift+F` | Distraction-free mode |
| `Ctrl+Shift+A` | Scroll to the active tab |
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

Honest scope, so nobody wastes an evening: Linux-only, no auto-update, no data
migrations (breaking changes land as clean sweeps), no tests, and issues may sit.
Contributions aren't being solicited — fork freely instead.

## Credits

Bundles [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (v2.304), licensed
under the [SIL Open Font License 1.1](public/assets/fonts/JetBrainsMono-OFL.txt).
A system Nerd Font is preferred when present, so agent output keeps its icons.

## License

[MIT](LICENSE)
