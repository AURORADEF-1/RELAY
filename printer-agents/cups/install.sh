#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo ./install.sh"
  exit 1
fi

apt-get update
apt-get install -y cups cups-client python3-pil fonts-dejavu-core
id relay-print >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin relay-print
usermod -a -G lp,lpadmin relay-print
install -d -m 0755 /opt/relay-cups-bridge
install -m 0755 relay_cups_bridge.py /opt/relay-cups-bridge/relay_cups_bridge.py
install -m 0644 relay-cups-bridge.service /etc/systemd/system/relay-cups-bridge.service

if [[ ! -f /etc/relay-cups-bridge.env ]]; then
  printf '%s\n' \
    'RELAY_ALLOWED_ORIGIN=https://relay-ryoz.vercel.app' \
    'RELAY_CUPS_PORT=8765' \
    'RELAY_CUPS_PRINTER=FrontCounter' > /etc/relay-cups-bridge.env
  chmod 0640 /etc/relay-cups-bridge.env
fi

systemctl daemon-reload
systemctl enable --now cups relay-cups-bridge
echo "RELAY CUPS bridge installed. Confirm the DYMO is the CUPS default with: lpstat -d"
