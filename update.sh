set -e

cd "$(dirname "$0")"

# Перенос каталога данных (com.rewrite.app → dev.sendoff.app) делает install.sh —
# он зовётся ниже и лежит на обоих путях установки. Здесь его дублировать нельзя:
# перенос ДО сборки оставил бы упавшее обновление со старым бинарником и уехавшими данными.

echo "→ git pull (desktop, ff-only)…"
git pull --ff-only

echo "→ bun install (на случай смены зависимостей)…"
bun install

echo "→ сборка бинаря (--no-bundle, без AppImage/linuxdeploy)…"
bun run build:bin

echo "→ установка…"
./install.sh

echo "✓ Sendoff обновлён до $(git rev-parse --short HEAD). Перезапусти приложение из меню."
