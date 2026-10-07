#!/usr/bin/env bash
# Installs the Discord fight bot as a systemd user service so it survives reboots and restarts on crash.
# usage (on the server, run as the user that should own the process):
#   DISCORD_BOT_TOKEN=... ./tools/deploy-bot.sh
set -euo pipefail

if [ -z "${DISCORD_BOT_TOKEN:-}" ]; then
  echo "set DISCORD_BOT_TOKEN" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/stick2-discord-bot.service"
ENV_FILE="$REPO_DIR/.env.discord-bot"

mkdir -p "$UNIT_DIR"

cat > "$ENV_FILE" <<EOF
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_FIGHT_ROLE=${DISCORD_FIGHT_ROLE:-}
DISCORD_FIGHT_CHANNEL=${DISCORD_FIGHT_CHANNEL:-}
DISCORD_USER_COOLDOWN_MS=${DISCORD_USER_COOLDOWN_MS:-30000}
DISCORD_GLOBAL_COOLDOWN_MS=${DISCORD_GLOBAL_COOLDOWN_MS:-5000}
OUT_RETAIN_MS=${OUT_RETAIN_MS:-7200000}
OUT_CLEAN_INTERVAL_MS=${OUT_CLEAN_INTERVAL_MS:-900000}
EOF
chmod 600 "$ENV_FILE"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=stick2 Discord fight bot
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) $REPO_DIR/tools/discord-bot.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

npm --prefix "$REPO_DIR" install --omit=dev

systemctl --user daemon-reload
systemctl --user enable --now stick2-discord-bot.service

echo "deployed. check status: systemctl --user status stick2-discord-bot"
echo "tail logs: journalctl --user -u stick2-discord-bot -f"
echo "note: for the service to keep running after you log out, run: loginctl enable-linger \$USER"
