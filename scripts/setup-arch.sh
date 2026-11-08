#!/usr/bin/env bash
# Installs everything needed to run and demo the project on Arch Linux:
# git, curl, Node.js, npm, the npm dependencies and (optionally) Postman.
#
# Usage: ./scripts/setup-arch.sh [--no-postman]
set -euo pipefail

if ! command -v pacman >/dev/null 2>&1; then
  echo "error: pacman not found, this script is for Arch Linux" >&2
  exit 1
fi

if [ "$EUID" -eq 0 ]; then
  echo "error: run as a regular user, sudo is used where needed" >&2
  exit 1
fi

with_postman=1
if [ "${1:-}" = "--no-postman" ]; then
  with_postman=0
fi

cd "$(dirname "$0")/.."

echo "==> Installing system packages"
sudo pacman -S --needed --noconfirm git curl nodejs npm

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  echo "error: Node.js 22.12 or newer is required, found $(node -v)" >&2
  exit 1
fi

echo "==> Installing npm dependencies"
npm install

if [ "$with_postman" -eq 1 ]; then
  echo "==> Installing Postman from Flathub"
  sudo pacman -S --needed --noconfirm flatpak
  flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  flatpak install --user -y flathub com.getpostman.Postman
fi

echo
echo "Done. Node $(node -v), npm $(npm -v)."
echo "Start the server:  node main.js -h 127.0.0.1 -p 3000 -c ./cache"
if [ "$with_postman" -eq 1 ]; then
  echo "Start Postman:     flatpak run com.getpostman.Postman"
fi
