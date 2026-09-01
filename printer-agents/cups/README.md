# RELAY Front Counter CUPS bridge

The bridge runs only on `127.0.0.1`; CUPS remains private to the Raspberry Pi. The signed-in Front Counter browser claims RELAY print jobs and hands each label to this local service. No Supabase key or RELAY password is stored in the service.

1. Enable SSH locally on the Pi if remote commissioning is required: `sudo raspi-config` → Interface Options → SSH.
2. Confirm the DYMO exists and make it the CUPS default: `lpstat -p -d`.
3. From this folder run `sudo ./install.sh`.
4. Open `http://127.0.0.1:8765/health` on the Pi. It must report `ok: true` and the intended DYMO queue.
5. Keep Chrome signed in to RELAY as Front Counter and open `/terminal`.
6. Print one isolated test job and scan it successfully. Confirm Front Counter is marked as the default station and Samantha is marked as the backup.

Do not expose TCP 631 or 8765 to the LAN. The Front Counter is the default station after commissioning. Samantha's DYMO station automatically adopts queued labels when CUPS reports a printer fault, empty label roll or stale terminal heartbeat.

## Dual-display kiosk

The Front Counter Pi can run both RELAY screens from the same signed-in Chromium profile:

- HDMI TV: `/wallboard`, full screen with no browser controls.
- 5-inch Raspberry Pi Touch Display 2: `/terminal`, portrait at 720 × 1280.
- Until the DSI display is connected, only the HDMI wallboard starts. The touch terminal starts automatically after the DSI display is detected at the next login or reboot.

Install `relay-display-kiosk.sh` as `~/.local/bin/relay-display-kiosk.sh`, `relay-labwc-rc.xml` as `~/.config/labwc/rc.xml`, and `relay-labwc-autostart` as `~/.config/labwc/autostart`. Keep the existing Chromium profile signed in as the Front Counter account so both app windows share the same RELAY session.

The launcher arranges the portrait DSI display to the left of the HDMI TV. Chromium must start windowed so Labwc can move each app window to the correct output before making it fullscreen; do not add Chromium's `--start-fullscreen` flag. The Labwc rules use left/right placement rather than fixed connector numbers, so either `HDMI-A-1` or `HDMI-A-2` works.

## Device control agent

The admin-only `/front-counter` tab uses an outbound device agent rather than exposing SSH, CUPS or another inbound Pi port to the internet. Install it with `sudo ./install-device-agent.sh`, place the Front Counter Supabase connection values in `/etc/relay-device-agent.env`, then start it with `sudo systemctl enable --now relay-device-agent`.

The agent accepts only three database-authorised commands: relaunch the two Chromium RELAY windows, reboot, and graceful shutdown. A shutdown Pi cannot be powered on through SSH; a future Power On button requires a managed PoE switch or smart power relay.
