#!/usr/bin/env bash
# Insan installer for macOS and Linux.
# Installs into ~/.local/share/insan, builds it, and adds an "insan" command
# (plus a menu entry on Linux / an app launcher on macOS). No sudo needed.
set -euo pipefail

PORT="${INSAN_PORT:-3210}"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${INSAN_DIR:-$HOME/.local/share/insan}"
BIN="$HOME/.local/bin"
export NEXT_TELEMETRY_DISABLED=1

fail() { echo; echo "Install failed: $1" >&2; exit 1; }

echo "Insan installer"
echo "Install folder: $DEST"

echo; echo "[1/5] Checking Node.js (20.9 or newer)"
command -v node >/dev/null || fail "Node.js is not installed. Get the LTS version from https://nodejs.org (or your package manager) and run this again."
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)' \
  || fail "Node.js $(node -v) is too old. Install 20.9 or newer from https://nodejs.org."
echo "Node.js $(node -v) found"

echo; echo "[2/5] Copying the app"
mkdir -p "$DEST"
if [ "$SRC" != "$(cd "$DEST" && pwd)" ]; then
  if command -v rsync >/dev/null; then
    rsync -a --delete --exclude node_modules --exclude .next --exclude .git --exclude .claude "$SRC/" "$DEST/"
  else
    (cd "$SRC" && tar cf - --exclude node_modules --exclude .next --exclude .git --exclude .claude .) | (cd "$DEST" && tar xf -)
  fi
fi
cd "$DEST"

echo; echo "[3/5] Downloading dependencies (one time, needs internet, a few minutes)"
npm ci --no-audit --no-fund --loglevel=error || fail "npm could not install the dependencies. Check your internet connection."
node scripts/copy-pdf-worker.mjs >/dev/null

echo; echo "[4/5] Building the app"
npm run build --silent || fail "the build did not finish. Scroll up for the error."

echo; echo "[5/5] Adding the 'insan' command"
mkdir -p "$BIN"
cat > "$BIN/insan" <<EOF
#!/usr/bin/env bash
# Opens Insan; starts the local server in the background if needed. "insan stop" stops it.
export NEXT_TELEMETRY_DISABLED=1
URL="http://localhost:$PORT/"
if [ "\${1:-}" = "stop" ]; then pkill -f "next start -p $PORT" && echo "Insan stopped."; exit 0; fi
if ! curl -fsS -o /dev/null "\$URL" 2>/dev/null; then
  (cd "$DEST" && nohup node node_modules/next/dist/bin/next start -p $PORT >/dev/null 2>&1 &)
  for _ in \$(seq 1 60); do curl -fsS -o /dev/null "\$URL" 2>/dev/null && break; sleep 0.5; done
fi
if command -v open >/dev/null; then open "\$URL"; else xdg-open "\$URL" >/dev/null 2>&1 || echo "Open \$URL"; fi
EOF
chmod +x "$BIN/insan"

case "$(uname -s)" in
  Linux)
    mkdir -p "$HOME/.local/share/applications"
    cat > "$HOME/.local/share/applications/insan.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Insan
Comment=Rewrite AI-sounding text so it reads like a person wrote it
Exec=$BIN/insan
Icon=$DEST/public/icon.svg
Categories=Office;TextTools;
EOF
    ;;
  Darwin)
    mkdir -p "$HOME/Applications"
    printf '#!/bin/bash\n"%s/insan"\n' "$BIN" > "$HOME/Applications/Insan.command"
    chmod +x "$HOME/Applications/Insan.command"
    ;;
esac

echo
echo "Insan is installed. Run: insan   (or 'insan stop' to stop it)"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Note: add $BIN to your PATH, or run $BIN/insan";; esac
"$BIN/insan" || true
