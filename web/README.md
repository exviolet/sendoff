<div align="center">

<img src="public/favicon.svg" alt="Sendoff" width="112" height="112" />

# sendoff-web

**The editor half of [Sendoff](https://github.com/exviolet/sendoff) — React + TypeScript SPA.**

<img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=for-the-badge" alt="License MIT" />
<img src="https://img.shields.io/badge/status-personal_project-c4b5fd?style=for-the-badge" alt="Status: personal project" />

English · [Русский](README.ru.md)

</div>

> ### 👉 Looking for the app?
>
> **[github.com/exviolet/sendoff](https://github.com/exviolet/sendoff)** — that's
> where the downloads, the demo, the feature list, and the shortcut reference live.
>
> This repository is the frontend, consumed there as the `web/` git submodule.

Sendoff is a prompt-first editor for terminal coding agents: write a prompt in a
real editing surface, then fire it straight into the agent you're already running
with `Ctrl+Enter`. This repo holds the editor itself — tabs, workspaces, markdown
editing, find & replace, the slash menu, and the IndexedDB persistence layer.

No backend, no API keys, no telemetry. Everything runs client-side.

## What this half cannot do

**Sending is desktop-only.** The direct write into an agent's terminal goes
through the Tauri shell, which only the [desktop build](https://github.com/exviolet/sendoff)
has. In a plain browser tab `Ctrl+Enter` falls back to copying the buffer to the
clipboard.

Also desktop-only, all for the same reason: native file dialogs, dragging a file
into the editor, the custom title bar, live agent status, and the single-instance
guard. Everything else — the whole editing surface — is here and runs in a browser.

Sendoff is **desktop-first**; a browser tab gives you a capable editor without the
terminal bridge.

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

## Status

A personal tool, used daily. Public so it can serve as a portfolio piece — **it
works for me, but no support or stability is guaranteed.** Tests cover pure logic
and the IndexedDB layer only; components and hooks are not covered on purpose.
Contributions aren't being solicited — fork freely instead.

> Formerly called **Rewrite**. Renamed in August 2026 — see the
> [main repo](https://github.com/exviolet/sendoff#status) for why. The IndexedDB
> database is still named `rewrite-db` on purpose: that string is a path to your
> data, not a label.

## Credits

Bundles [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (v2.304), licensed
under the [SIL Open Font License 1.1](public/assets/fonts/JetBrainsMono-OFL.txt).
A system Nerd Font is preferred when present, so agent output keeps its icons.

## License

[MIT](LICENSE)
