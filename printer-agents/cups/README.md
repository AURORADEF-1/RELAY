# RELAY Front Counter CUPS bridge

The bridge runs only on `127.0.0.1`; CUPS remains private to the Raspberry Pi. The signed-in Front Counter browser claims RELAY print jobs and hands each label to this local service. No Supabase key or RELAY password is stored in the service.

1. Enable SSH locally on the Pi if remote commissioning is required: `sudo raspi-config` → Interface Options → SSH.
2. Confirm the DYMO exists and make it the CUPS default: `lpstat -p -d`.
3. From this folder run `sudo ./install.sh`.
4. Open `http://127.0.0.1:8765/health` on the Pi. It must report `ok: true` and the intended DYMO queue.
5. Keep Chrome signed in to RELAY as Front Counter and open `/terminal`.
6. Print one isolated test job. Only after it prints and scans successfully should an administrator invoke `activate_front_counter_cups_station()` to move new READY labels from Samantha's station to the Pi.

Do not expose TCP 631 or 8765 to the LAN. Samantha remains the default print station until the explicit activation step.
