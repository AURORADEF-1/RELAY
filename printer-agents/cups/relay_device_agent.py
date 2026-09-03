#!/usr/bin/env python3
"""Outbound-only RELAY device control agent for the Front Counter Pi."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


AGENT_VERSION = "1.0.0"
ALLOWED_COMMANDS = {"refresh_session", "reboot", "shutdown"}


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


class RelayDeviceAgent:
    def __init__(self) -> None:
        self.supabase_url = required_env("RELAY_SUPABASE_URL").rstrip("/")
        self.anon_key = required_env("RELAY_SUPABASE_ANON_KEY")
        self.device_token = required_env("RELAY_DEVICE_TOKEN")
        self.poll_seconds = max(int(os.environ.get("RELAY_DEVICE_POLL_SECONDS", "5")), 3)
        self.home = Path(os.environ.get("RELAY_DEVICE_HOME", "/home/mlpparts"))
        self.last_heartbeat = 0.0

    def request(self, path: str, payload: dict[str, Any]) -> Any:
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.anon_key}",
            "Content-Type": "application/json",
        }
        request = urllib.request.Request(
            f"{self.supabase_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"RELAY API returned HTTP {error.code}: {detail}") from error

    def rpc(self, name: str, payload: dict[str, Any] | None = None) -> Any:
        return self.request(f"/rest/v1/rpc/{name}", payload or {})

    @staticmethod
    def uptime_seconds() -> int:
        try:
            return max(int(float(Path("/proc/uptime").read_text().split()[0])), 0)
        except (OSError, ValueError, IndexError):
            return 0

    def heartbeat(self) -> None:
        self.rpc(
            "front_counter_device_heartbeat",
            {
                "p_device_token": self.device_token,
                "p_hostname": socket.gethostname(),
                "p_uptime_seconds": self.uptime_seconds(),
                "p_agent_version": AGENT_VERSION,
            },
        )
        self.last_heartbeat = time.time()

    def refresh_session(self) -> str:
        launcher = self.home / ".local/bin/relay-display-kiosk.sh"
        if not launcher.is_file():
            raise RuntimeError("The RELAY kiosk launcher is not installed.")
        uid = os.getuid()
        environment = os.environ.copy()
        environment.update(
            {
                "HOME": str(self.home),
                "XDG_RUNTIME_DIR": f"/run/user/{uid}",
                "WAYLAND_DISPLAY": environment.get("WAYLAND_DISPLAY", "wayland-0"),
                "DISPLAY": environment.get("DISPLAY", ":0"),
            }
        )
        log_path = Path("/tmp/relay-device-refresh.log")
        with log_path.open("ab") as log:
            subprocess.Popen(
                ["/usr/bin/bash", str(launcher)],
                cwd=str(self.home),
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        return "Browser refresh accepted; the wallboard and terminal are relaunching."

    @staticmethod
    def power_action(action: str) -> str:
        systemctl_action = "reboot" if action == "reboot" else "poweroff"
        subprocess.run(
            ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "--no-block", systemctl_action],
            check=True,
            timeout=10,
        )
        return (
            "Front Counter reboot accepted."
            if action == "reboot"
            else "Front Counter shutdown accepted. Physical power is required to turn it on again."
        )

    def execute(self, command: str) -> str:
        if command not in ALLOWED_COMMANDS:
            raise RuntimeError("Unsupported Front Counter command.")
        if command == "refresh_session":
            return self.refresh_session()
        return self.power_action(command)

    def complete(self, command: str, succeeded: bool, result: str) -> None:
        self.rpc(
            "complete_front_counter_device_command",
            {
                "p_device_token": self.device_token,
                "p_command": command,
                "p_succeeded": succeeded,
                "p_result": result[:500],
            },
        )

    def run_once(self) -> None:
        if time.time() - self.last_heartbeat >= 15:
            self.heartbeat()
        claimed = self.rpc(
            "claim_front_counter_device_command",
            {"p_device_token": self.device_token},
        ) or []
        if not claimed:
            return
        command = str(claimed[0].get("command", "")).strip().lower()
        try:
            result = self.execute(command)
            self.complete(command, True, result)
        except Exception as error:
            self.complete(command, False, str(error))

    def run(self) -> None:
        retry_seconds = self.poll_seconds
        while True:
            try:
                self.run_once()
                retry_seconds = self.poll_seconds
            except Exception as error:
                print(f"RELAY device agent warning: {error}", flush=True)
                retry_seconds = min(max(retry_seconds * 2, 10), 60)
            time.sleep(retry_seconds)


if __name__ == "__main__":
    RelayDeviceAgent().run()
