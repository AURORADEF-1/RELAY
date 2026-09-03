#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

install -d -m 0755 /opt/relay-device-agent
install -m 0755 relay_device_agent.py /opt/relay-device-agent/relay_device_agent.py
install -m 0644 relay-device-agent.service /etc/systemd/system/relay-device-agent.service

if [[ ! -f /etc/relay-device-agent.env ]]; then
  install -m 0600 relay-device-agent.env.example /etc/relay-device-agent.env
  echo "Created /etc/relay-device-agent.env. Add the production values before starting the service."
fi

systemctl daemon-reload
systemctl enable relay-device-agent.service

echo "Installed relay-device-agent.service. Start it after /etc/relay-device-agent.env is configured."
