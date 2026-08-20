#!/usr/bin/env bash

set -uo pipefail

RELAY_BASE_URL="${RELAY_BASE_URL:-https://relay-ryoz.vercel.app}"
CHROMIUM_BIN="${CHROMIUM_BIN:-chromium}"
CHROMIUM_PROFILE="${CHROMIUM_PROFILE:-Default}"

wait_for_displays() {
  local attempt
  for attempt in $(seq 1 30); do
    if wlr-randr 2>/dev/null | grep -q '^HDMI-A-'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

find_output() {
  local prefix="$1"
  wlr-randr 2>/dev/null | awk -v prefix="$prefix" '$1 ~ ("^" prefix) { print $1; exit }'
}

launch_relay_window() {
  local url="$1"
  nohup "$CHROMIUM_BIN" \
    --profile-directory="$CHROMIUM_PROFILE" \
    --ozone-platform=wayland \
    --app="$url" \
    --start-fullscreen \
    --no-first-run \
    --no-default-browser-check \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=Translate \
    >/tmp/relay-kiosk-chromium.log 2>&1 &
}

if ! wait_for_displays; then
  echo "RELAY kiosk: no HDMI display detected" >&2
  exit 1
fi

hdmi_output="$(find_output 'HDMI-A-')"
touch_output="$(find_output 'DSI-')"

if [[ -n "$touch_output" ]]; then
  wlr-randr \
    --output "$touch_output" --preferred --pos 0,0 --transform normal \
    --output "$hdmi_output" --preferred --pos 720,0 --transform normal || true
fi

pkill -TERM chromium 2>/dev/null || true
sleep 2

launch_relay_window "$RELAY_BASE_URL/wallboard"

if [[ -n "$touch_output" ]]; then
  sleep 3
  launch_relay_window "$RELAY_BASE_URL/terminal"
fi
