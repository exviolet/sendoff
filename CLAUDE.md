# Project Contract — Sendoff Desktop

> Этот файл — контракт сотрудничества между разработчиком и любым AI-агентом (Claude Code, Codex, Cursor, Aider). `AGENTS.md` — symlink сюда. Долгоживущие решения и roadmap живут в `docs/`, не в этом файле.

## Product Positioning
- **Sendoff — prompt-first editor.** Цель: быстро формулировать LLM-промпты вне маленького input в Claude Code и неудобного scroll в tmux.
- Не pipeline-builder, не knowledge base, не code editor.
- При любой новой фиче — сверять с позиционированием и приоритетом в [docs/ROADMAP.md](docs/ROADMAP.md). Pipeline/transformation-направление = red flag scope creep.

## Project Goals (приоритет)
> Пересмотрено 2026-07-07: курс на staged public OSS. Детали — docs/ROADMAP.md «Сессия 2026-07-07».
- **Primary:** личный инструмент + опыт работы с Tauri/Rust.
- **Primary:** **staged public OSS** — вести как настоящий открытый проект (стадии A презентабельность → B release-артефакты → C discoverability), честный scope, без обещаний enterprise-поддержки.
- **Secondary:** портфолио.

Следствия для решений: breaking changes без миграций всё ещё ок (ранняя стадия), но разрушающие data-изменения координировать со 2-м пользователем; для OSS-стадий **теперь оправданы** README+демо, лицензия, prebuilt release-артефакты, фикс дистрибуции (`--no-bundle` + `update.sh`), опц. CI (YAGNI-режим → нейтральный); без явного жильца по-прежнему НЕ делать Windows/macOS билды, i18n, CONTRIBUTING.md; «полировать для юзеров» vs «Tauri-эксперимент» — теперь баланс (есть внешние пользователи), не автоматически второе.

## Context
- **Solo dev, ранняя стадия (v0.2.0), 2 пользователя** (автор + друг — начал пользоваться сам, 2026-07). Курс на staged OSS. Миграции данных, feature flags, backwards-compat shims **не нужны** — clean sweeps допустимы, но разрушающие data-изменения (IndexedDB) координировать с другом (у него накоплены данные).
- GUI прошёл dogfooding: ежедневное использование, 75+ табов накопилось. Это значит UX-боль реальна, но не блокирует.

## Repo Layout
- `web/` — фронтенд редактора: React + Zustand + Vite, свой `package.json`, ставится и собирается из своего каталога. До 2026-08-31 жил отдельным репозиторием `exviolet/sendoff-web` и подключался сабмодулем — втянут в монорепо вместе со всей историей.
- `src-tauri/src/lib.rs` — точка входа Tauri v2 wrapper.
- `src-tauri/capabilities/default.json` — permission manifest.
- `src-tauri/tauri.conf.json` — Tauri-конфиг.
- `install.sh` / `uninstall.sh` — установка/удаление бинарника в `~/.local/` (Linux only).
- `update.sh` — обновление установленного Sendoff для консюмера (pull → `build:bin` → install).
- `landing/` — лендинг `sendoff-editor.pages.dev` (чистая статика: один `index.html` + `assets/`, без сборщика и зависимостей). Не часть приложения: в сборку десктопа не входит, зависимостей с `web/` не имеет.
- `docs/ROADMAP.md` — позиционирование, приоритеты, отказы. Источник правды по продуктовым решениям.
- `tasks/` — детальные task-спеки для приоритетных фич (создаются по мере того, как фича становится active).
- `HANDOFF.md` — per-session state (в `.gitignore`).
- `AGENTS.md` — symlink на этот файл (для codex/aider/cursor agent).

## Build & Test
- Install deps: `bun install`
- Dev: `bun dev` (Vite + Tauri window)
- Тесты: `cd web && bun test` (встроенный раннер bun; покрыты чистая логика и слой IndexedDB, компоненты — нет)
- Build production (полный бандл, AppImage/deb/rpm): `bun run build` — собирает все три. Скрипт выставляет `NO_STRIP=1`: **не убирать**, иначе AppImage снова падает (см. ниже). Для install в `~/.local/bin` не нужен.
  > **Почему `NO_STRIP=1`.** `linuxdeploy` таскает внутри себя `strip` из старых binutils, а системные библиотеки Arch собраны с `-z pack-relative-relocs` и содержат секцию `.relr.dyn` (`SHT_RELR`, тип `0x13`), которую тот `strip` не понимает → `failed to run linuxdeploy` без причины в выводе. Цена флага измерена и близка к нулю: AppDir 287 → 283 МБ (1.4%), потому что библиотеки Arch и так поставляются стрипнутыми. Диагноз 2026-08-09.
- Build бинаря без бандла: `bun run build:bin` (`tauri build --no-bundle`) — только `target/release/sendoff-desktop`, linuxdeploy не запускается. Основной путь для install.
- **Release-артефакты — только через контейнер** (`Dockerfile`, Ubuntu 22.04), не хостовой сборкой:
  ```bash
  docker build -t sendoff-appimage-builder .
  docker run --rm -v "$PWD":/src -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -e CARGO_TARGET_DIR=/src/src-tauri/target-docker \
    sendoff-appimage-builder bash -lc 'bun install && bun run build'
  ```
  > **Почему не хостом.** AppImage бандлит библиотеки, но **не glibc**: внутрь кладутся системные библиотеки сборочной машины, и они требуют её glibc. Собранный на Arch артефакт требовал **glibc 2.43** и не запускался нигде, кроме rolling-дистрибутивов — то есть ровно у тех, кто и так собирает из исходников. Ubuntu 22.04 даёт **2.35**: Ubuntu 22.04+, Debian 12+, Fedora 36+, Arch. Отдельный `CARGO_TARGET_DIR` обязателен — иначе Arch- и Ubuntu-объектники перетирают друг друга и обе сборки идут с нуля. Измерено 2026-08-09.
  >
  > Публикуется **только AppImage**. `.deb`/`.rpm` собираются той же командой, но их никто не ставил на Debian/Fedora — непроверенный артефакт в публичном релизе хуже его отсутствия.
  >
  > **Каждый релиз обязан нести две копии AppImage:** версионную (`Sendoff_<version>_amd64.AppImage`, как её называет бандлер) и версионезависимую `Sendoff_latest_amd64.AppImage` — `gh release upload <tag> Sendoff_latest_amd64.AppImage`. На вторую наведены три кнопки Download лендинга через `releases/latest/download/`; забыть её значит уронить их в 404. Имя выбрано так, чтобы подходить под глоб `Sendoff_*_amd64.AppImage` из `README.md`, `README.ru.md` и install-line лендинга — их править не нужно. Заведено 2026-08-23.
- Лендинг: сборки нет. Превью — `cd landing && python3 -m http.server 4323 --bind 127.0.0.1`. Правится `index.html` напрямую; шрифты и медиа лежат в `landing/assets/`.
- Install / remove binary: `./install.sh` / `./uninstall.sh`
- Обновить установленный Sendoff (консюмер): `./update.sh`

## Verification
| Изменения в | Команды |
|---|---|
| `web/src/**/*.ts(x)` | `cd web && bun tsc -b && bun lint && bun test` (НЕ `--noEmit`: корневой tsconfig — solution-stub с `files:[]`, `--noEmit` проверяет 0 файлов и всегда зелёный; реальный гейт — `-b`) |
| `web/src/lib/**` (чистая логика, `db.ts`) | `bun test` обязателен: там резолв таргетов (промпт не тому агенту) и чтение чужой базы |
| `src-tauri/src/**/*.rs` | `cd src-tauri && cargo check` |
| `src-tauri/capabilities/*.json`, `tauri.conf.json` | `bun run build` (валидация Tauri-манифеста) |
| `landing/**` | Сборочного гейта нет — страница одна, проверяется в браузере: все ассеты отдаются 200, обе темы, нет переполнения на 1512 / 979 / 390. Перед публикацией — **проверить, что кириллица осталась только в комментариях**: `<!-- -->`, `/* */` и `//` по правилам проекта русские, любой пользовательский текст — английский |

## Git Workflow (GitHub Flow)
- Базовая ветка: `master`. Без Git-Flow — нет `dev`, нет `release/*`.
- Новые фичи: `git switch -c feature/<name>` от `master`.
- Хотфиксы: `git switch -c fix/<name>` от `master`.
- Merge в `master` всегда `--no-ff` — границы фич видны в истории.
- Коммиты: атомарные, русские, Conventional Commits (`feat(scope): описание`).
- `git switch` вместо `git checkout`.

## Safety Rails

### NEVER
- Не добавлять Tauri permissions в `src-tauri/capabilities/default.json` без явного подтверждения. Модель: **редактор держит границу no-network-egress** — webview не делает произвольных сетевых вызовов и не спавнит произвольные процессы. (Реформулировано 2026-07-07: это НЕ «local-first как продуктовая догма» — сетевое/AI живёт в отдельном companion-продукте за opt-in границей, не в редакторе. Причина границы: `fs:scope-home-recursive` + сетевой egress = поверхность утечки; фронтенд — 13 тысяч строк, построчно не аудируется.) Исключения через `tauri-plugin-shell`:
  - `tmux` — отправка текста в выбранную pane + чтение топологии read-only (`list-panes`/`list-windows`/`list-sessions` для target picker'а). Заскоуплен `args:true`.
  - `orca-ide` (Orca ADE CLI) — **Policy B, scoped по подкомандам (НЕ `args:true`)**: только `terminal send` (отправка промпта), `terminal list` / `worktree ps` (read-only топология + `lastAssistantMessage`), `terminal wait --for tui-idle` (settle/refresh). Явно НЕ разрешены: `computer` (управление десктопом), `terminal create --command` (спавн процессов), `worktree create/rm`, browser/automations — поверхность `orca-ide` качественно опаснее tmux, `args:true` молча выдал бы desktop-control + произвольные процессы. Подтверждено 2026-07-01.
  - Остальной shell, сеть и произвольные процессы не разрешены.
  - NB: `fs`-read/write в home-scope **уже выдан** в манифесте (`fs:scope-home-recursive` + `allow-write-text-file`) — оговорка «без доступа к процессам» относится к shell/сети, не к fs.
- Не делать `git push --force` на `master`.
- Не запускать `./uninstall.sh` без подтверждения (стирает установленный бинарник).
- Не коммитить `HANDOFF.md`.
- Не вводить миграции данных, feature flags, backwards-compat shims.

### ALWAYS
- Перед merge в `master` — прогнать relevant verification из таблицы выше.
- В конце сессии — обновить `HANDOFF.md` (текущий статус, незакоммиченное, next steps, открытые риски). Это правило применимо к Claude Code сессиям; codex-сессии могут пропускать.
- При предложении новой фичи — сверить с приоритетом в [docs/ROADMAP.md](docs/ROADMAP.md). Не предлагать фичи из «Отложено».
- Реактивные UI-индикаторы (StatusBar, dirty-индикаторы и подобное) — **не дебаунсить**. Задержка >0 раздражает сильнее любой невидимой перф-выгоды. Оптимизировать только невидимое (custom equality в Zustand-селекторах, RAF debounce на тяжёлых операциях).
- **Язык: UI — английский, комментарии и коммиты — русские.** Новые пользовательские строки писать только по-английски (подписи, плейсхолдеры, `title`/`aria-label`, тосты, диалоги, реестр хоткеев, сид-данные). Комментарии, имена тестов, коммиты — русские. i18n — явный отказ, см. ROADMAP. Зафиксировано 2026-08-09; подробности для `web/` — в `web/CLAUDE.md`.

## Roles (multi-agent workflow)

Проект используется в режиме «архитектор + исполнитель»:

- **Claude Opus (architect)** — планирование, грилл-сессии, принятие архитектурных решений, финальные коммиты, обновление `docs/ROADMAP.md` и `tasks/*.md`.
- **Codex (executor)** — имплементация задач из `tasks/*.md` по детальному спеку. Не принимает решений вне спека; если упирается в неясность — оставляет TODO/комментарий, не угадывает.

Если запущены параллельно в tmux — оба видят `CLAUDE.md` (= `AGENTS.md`), `docs/ROADMAP.md`, `tasks/`, `HANDOFF.md`. Memory (`~/.claude/projects/...`) — только Claude Code, codex её не читает.

## Compact Instructions
При сжатии контекста сохранить:
- Текущая фича из `tasks/` и её статус.
- Принятые архитектурные решения и явные отказы (см. `docs/ROADMAP.md` секция «Явные отказы»).
- Verification-статус: что прошло, что упало, что не запускалось.
- Незакоммиченные файлы и текущая ветка.
- Открытые риски и TODO.
