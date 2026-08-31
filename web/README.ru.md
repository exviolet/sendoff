<div align="center">

<img src="public/favicon.svg" alt="Sendoff" width="112" height="112" />

# sendoff-web

**Редакторская половина [Sendoff](https://github.com/exviolet/sendoff) — SPA на React + TypeScript.**

<img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=for-the-badge" alt="License MIT" />
<img src="https://img.shields.io/badge/status-personal_project-c4b5fd?style=for-the-badge" alt="Status: personal project" />

[English](README.md) · Русский

</div>

> ### 👉 Ищешь само приложение?
>
> **[github.com/exviolet/sendoff](https://github.com/exviolet/sendoff)** — там
> загрузки, демо, список возможностей и справка по клавишам.
>
> Этот репозиторий — фронтенд, подключённый туда git-сабмодулем `web/`.

Sendoff — prompt-first редактор для терминальных агентов: пишешь промпт на
нормальной поверхности для ввода и отправляешь его прямо в уже запущенного агента
по `Ctrl+Enter`. В этом репозитории живёт сам редактор — табы, workspace'ы,
markdown-редактирование, поиск и замена, слэш-меню и слой персистенса на IndexedDB.

Без бэкенда, без API-ключей, без телеметрии. Всё работает на клиенте.

## Чего эта половина не умеет

**Отправка работает только в desktop-сборке.** Прямая запись в терминал агента
идёт через Tauri shell, который есть только у
[desktop-приложения](https://github.com/exviolet/sendoff). В обычной вкладке
браузера `Ctrl+Enter` откатывается на копирование буфера в clipboard.

По той же причине только в десктопе: нативные файловые диалоги, перетаскивание
файла в редактор, кастомный title bar, живой статус агента и гард
single-instance. Всё остальное — вся поверхность редактирования — здесь и
работает в браузере.

Sendoff — **desktop-first**; вкладка браузера даёт полноценный редактор, но без
моста в терминал.

## Быстрый старт

```bash
bun install
bun dev
```

Открой [http://localhost:5173](http://localhost:5173).

```bash
bun run build      # продакшен-сборка
bun run preview    # локально проверить продакшен-сборку
bun test           # чистая логика + слой IndexedDB
```

> `bun tsc -b`, а не `tsc --noEmit`: корневой `tsconfig.json` — solution-stub с
> `"files": []`, поэтому `--noEmit` проверяет ноль файлов и всегда зелёный.

## Стек

| Слой | Выбор |
|------|-------|
| Фреймворк | React 19 + TypeScript (strict) |
| Сборка | Vite + Bun |
| Стили | Tailwind CSS v4 |
| Состояние | Zustand |
| Persistence | IndexedDB (`idb`) |
| Редактор | Нативный `<textarea>` + кастомный overlay — без Monaco/CodeMirror |

Заметки по архитектуре, инварианты и грабли, которые стоит знать до правок, —
в [`CLAUDE.md`](CLAUDE.md).

## Статус

Личный инструмент, в ежедневном использовании. Репозиторий публичный как
портфолио — **работает для меня, но поддержка и стабильность не гарантируются.**
Тесты покрывают только чистую логику и слой IndexedDB; компоненты и хуки
сознательно не покрыты. Контрибуции не запрашиваются — форкай свободно.

> Раньше назывался **Rewrite**. Переименован в августе 2026 — почему, см. в
> [главном репозитории](https://github.com/exviolet/sendoff/blob/master/README.ru.md#статус). База
> IndexedDB намеренно осталась `rewrite-db`: эта строка — путь к твоим данным,
> а не подпись.

## Благодарности

В комплекте [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (v2.304) под
[SIL Open Font License 1.1](public/assets/fonts/JetBrainsMono-OFL.txt).
Системный Nerd Font имеет приоритет, если установлен, — чтобы иконки в выводе
агента не ломались.

## Лицензия

[MIT](LICENSE)
