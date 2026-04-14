# Phase 7 — Tauri v2 Desktop Wrapper

## Архитектурное решение

Два отдельных репозитория:

```
rewrite          — browser SPA (текущий репо, деплой на Vercel/Pages)
rewrite-desktop  — Tauri v2 обёртка, web подключается как git submodule
```

**Почему два репо:**
- Browser-версия не содержит Rust/Tauri код
- Desktop развивается независимо, со своим релизным циклом
- Чистый деплой web-версии (Vercel/GitHub Pages)
- Submodule фиксирует конкретную версию web — desktop всегда собирается от стабильного коммита

---

## Структура rewrite-desktop

```
rewrite-desktop/
├── web/                          # git submodule → rewrite
├── src-tauri/
│   ├── src/
│   │   └── lib.rs                # минимальный Tauri entry point
│   ├── capabilities/
│   │   └── default.json          # Tauri v2 permissions
│   ├── icons/                    # иконки приложения
│   ├── tauri.conf.json           # конфигурация Tauri
│   ├── Cargo.toml
│   └── Cargo.lock
├── package.json                  # скрипты для dev/build
├── .gitmodules
├── CLAUDE.md
└── README.md
```

---

## Реализация

### Step 1 — Scaffold

```bash
# Создать репо
mkdir rewrite-desktop && cd rewrite-desktop
git init

# Подключить web как submodule
git submodule add git@github.com:<user>/rewrite.git web

# Инициализировать Tauri v2 в существующем проекте
bun add -d @tauri-apps/cli
bun tauri init
```

**tauri.conf.json** — ключевые настройки:
- `devUrl`: `http://localhost:5173` (Vite dev server из web/)
- `frontendDist`: `../web/dist` (production build)
- `productName`: `Rewrite`
- `identifier`: `com.rewrite.app`
- Размер окна: `1200×800`, `minWidth: 800`, `minHeight: 500`

**package.json** — скрипты:
```json
{
  "scripts": {
    "dev": "cd web && bun dev &; bun tauri dev",
    "build": "cd web && bun run build && bun tauri build",
    "update-web": "git submodule update --remote web"
  }
}
```

### Step 2 — Базовая обёртка (zero frontend changes)

Цель: web-приложение работает в нативном окне без изменений.

- Tauri window с WebView загружает SPA
- IndexedDB работает в Tauri WebView как в браузере
- Все шорткаты, тема, persist — всё работает из коробки
- Нет Rust-логики кроме дефолтного entry point

**Верификация:**
- [ ] `bun tauri dev` — приложение открывается в нативном окне
- [ ] Все табы, пресеты, настройки работают
- [ ] IndexedDB persist работает между перезапусками
- [ ] Все шорткаты работают (Ctrl+N, Ctrl+F, Ctrl+, и т.д.)

### Step 3 — Иконка и .desktop (Linux)

- Иконка приложения: SVG → PNG (32, 128, 256, 512px) в `src-tauri/icons/`
- `tauri.conf.json` → `bundle.icon`
- Linux: `.desktop` файл генерируется Tauri автоматически при `tauri build`

### Step 4 — Нативные файловые диалоги (опционально)

Заменить browser-костыли на нативные API:

```bash
bun add @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

**Что меняется во frontend:**
- `useFileIO.ts` — определять среду (`window.__TAURI__`) и использовать нативные API
- `Ctrl+S` → нативный Save Dialog вместо `<a download>`
- `Ctrl+O` → нативный Open Dialog вместо `<input type="file">`
- Drag & drop файлов — уже работает через web API

**Паттерн определения среды:**
```ts
const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
```

Важно: browser-версия должна продолжать работать без Tauri. Все нативные вызовы за `if (isTauri)` проверкой.

### Step 5 — Auto-update (опционально)

```bash
bun add @tauri-apps/plugin-updater
```

- Tauri built-in updater с GitHub Releases
- `tauri.conf.json` → `plugins.updater.endpoints` → GitHub releases API
- Проверка обновлений при запуске + кнопка в Settings

---

## Сборка и дистрибуция

### Development
```bash
bun tauri dev    # запускает Vite dev server + Tauri window
```

### Production build
```bash
bun tauri build  # собирает web + компилирует Rust → бинарник
```

**Linux (Arch):**
- Генерирует `.deb`, `.AppImage`
- Для Arch: можно создать PKGBUILD или использовать AppImage
- Wayland: Tauri v2 использует `wry` → WebKitGTK, поддерживает Wayland нативно

---

## Зависимости

| Зависимость | Версия | Назначение |
|-------------|--------|------------|
| Tauri CLI | v2 | Сборка и dev server |
| Rust | stable | Компиляция Tauri backend |
| @tauri-apps/api | v2 | JS API для Tauri |
| @tauri-apps/plugin-dialog | v2 | Нативные файловые диалоги (Step 4) |
| @tauri-apps/plugin-fs | v2 | Доступ к файловой системе (Step 4) |
| @tauri-apps/plugin-updater | v2 | Auto-update (Step 5) |

**Prerequisite:** Rust toolchain (`rustup`) должен быть установлен.

---

## Что НЕ меняется

- Frontend код в `rewrite` — ноль изменений для Step 1–3
- IndexedDB persistence — работает в Tauri WebView
- Все Zustand stores — без изменений
- Все компоненты — без изменений
- Тема, шорткаты, Command Palette — всё работает

Step 4+ потребует минимальных изменений в `useFileIO.ts` (проверка `isTauri`).
