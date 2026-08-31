# `web/` — the editor

**The editing surface of Sendoff — React 19 + TypeScript SPA.** The product
README, the downloads, the demo, the feature list, and the shortcut reference
live in the [repository root](../README.md).

Tabs, workspaces, markdown editing, find & replace, the slash menu, and the
IndexedDB persistence layer are here. No backend, no API keys, no telemetry —
everything runs client-side.

## What this half cannot do

**Sending is desktop-only.** The direct write into an agent's terminal goes
through the Tauri shell in `src-tauri/`. In a plain browser tab `Ctrl+Enter`
falls back to copying the buffer to the clipboard.

Also desktop-only, all for the same reason: native file dialogs, dragging a file
into the editor, the custom title bar, live agent status, and the single-instance
guard. Everything else — the whole editing surface — runs in a browser.

Sendoff is **desktop-first**; a browser tab gives you a capable editor without
the terminal bridge, which is what makes `bun dev` a usable way to work on the UI.

## Quick start

```bash
bun install
bun dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
bun run build      # production build
bun run preview    # serve the production build locally
bun test           # pure logic + the IndexedDB layer
```

> `bun tsc -b`, not `tsc --noEmit` — the root `tsconfig.json` is a solution stub
> with `"files": []`, so `--noEmit` checks zero files and is always green.

To run the whole desktop app instead, use `bun dev` from the repository root —
Tauri installs and builds this directory itself.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite + Bun |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Persistence | IndexedDB (`idb`) |
| Editor | Native `<textarea>` + custom overlay — no Monaco/CodeMirror |

Architecture notes, invariants, and the gotchas worth knowing before changing
anything live in [`CLAUDE.md`](CLAUDE.md).

Bundles [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (v2.304), licensed
under the [SIL Open Font License 1.1](public/assets/fonts/JetBrainsMono-OFL.txt).
