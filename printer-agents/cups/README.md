# RELAY Front Counter CUPS bridge

The bridge runs only on `127.0.0.1`; CUPS remains private to the Raspberry Pi. The signed-in Front Counter browser claims RELAY print jobs and hands each label to this local service. No Supabase key or RELAY password is stored in the service.

1. Enable SSH locally on the Pi if remote commissioning is required: `sudo raspi-config` → Interface Options → SSH.
2. Confirm the DYMO exists and make it the CUPS default: `lpstat -p -d`.
3. From this folder run `sudo ./install.sh`.
4. Open `http://127.0.0.1:8765/health` on the Pi. It must report `ok: true` and the intended DYMO queue.
5. Keep Chrome signed in to RELAY as Front Counter and open `/terminal`.
6. Print one isolated test job and scan it successfully. Confirm Front Counter is marked as the default station and Samantha is marked as the backup.

Do not expose TCP 631 or 8765 to the LAN. The Front Counter is the default station after commissioning. Samantha's DYMO station automatically adopts queued labels when CUPS reports a printer fault, empty label roll or stale terminal heartbeat.
