#!/usr/bin/env python3
"""Loopback-only RELAY to CUPS bridge for the Front Counter Raspberry Pi."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime
import json
import os
import re
import subprocess
import tempfile
from zoneinfo import ZoneInfo

HOST = "127.0.0.1"
PORT = int(os.environ.get("RELAY_CUPS_PORT", "8765"))
PRINTER = os.environ.get("RELAY_CUPS_PRINTER", "").strip()
ALLOWED_ORIGIN = os.environ.get("RELAY_ALLOWED_ORIGIN", "https://relay-ryoz.vercel.app")
TOKEN_RE = re.compile(r"^RLY-[A-Z0-9]{8,32}$")
CODE39 = {
    "0":"nnnwwnwnn", "1":"wnnwnnnnw", "2":"nnwwnnnnw", "3":"wnwwnnnnn",
    "4":"nnnwwnnnw", "5":"wnnwwnnnn", "6":"nnwwwnnnn", "7":"nnnwnnwnw",
    "8":"wnnwnnwnn", "9":"nnwwnnwnn", "A":"wnnnnwnnw", "B":"nnwnnwnnw",
    "C":"wnwnnwnnn", "D":"nnnnwwnnw", "E":"wnnnwwnnn", "F":"nnwnwwnnn",
    "G":"nnnnnwwnw", "H":"wnnnnwwnn", "I":"nnwnnwwnn", "J":"nnnnwwwnn",
    "K":"wnnnnnnww", "L":"nnwnnnnww", "M":"wnwnnnnwn", "N":"nnnnwnnww",
    "O":"wnnnwnnwn", "P":"nnwnwnnwn", "Q":"nnnnnnwww", "R":"wnnnnnwwn",
    "S":"nnwnnnwwn", "T":"nnnnwnwwn", "U":"wwnnnnnnw", "V":"nwwnnnnnw",
    "W":"wwwnnnnnn", "X":"nwnnwnnnw", "Y":"wwnnwnnnn", "Z":"nwwnwnnnn",
    "-":"nwnnnnwnw", ".":"wwnnnnwnn", " ":"nwwnnnwnn", "*":"nwnnwnwnn",
}

def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    paths = [Path("/usr/share/fonts/truetype/dejavu") / name, Path("/usr/share/fonts/dejavu") / name]
    for path in paths:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()

def fit_text(draw, value, box_width, initial, bold=True):
    size = initial
    while size > 16:
        selected = font(size, bold)
        if draw.textbbox((0, 0), value, font=selected)[2] <= box_width:
            return selected
        size -= 2
    return font(size, bold)

def draw_code39(draw, value, x, y, width, height):
    encoded = f"*{value}*"
    if any(character not in CODE39 for character in encoded):
        raise ValueError("Barcode contains a character unsupported by Code 39")
    units = sum(3 if width_code == "w" else 1 for char in encoded for width_code in CODE39[char]) + len(encoded) - 1
    narrow = max(1, width // units)
    used = units * narrow
    cursor = x + max(0, (width - used) // 2)
    for char_index, char in enumerate(encoded):
        for index, width_code in enumerate(CODE39[char]):
            segment = narrow * (3 if width_code == "w" else 1)
            if index % 2 == 0:
                draw.rectangle((cursor, y, cursor + segment - 1, y + height), fill="black")
            cursor += segment
        if char_index < len(encoded) - 1:
            cursor += narrow

def format_ready_at(value):
    if not value:
        return "Not recorded"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
        return parsed.astimezone(ZoneInfo("Europe/London")).strftime("%d %b %Y · %H:%M")
    except (ValueError, TypeError):
        return "Not recorded"

def render_label(payload, path):
    token = str(payload.get("label_token", "")).strip().upper()
    if not TOKEN_RE.match(token):
        raise ValueError("Invalid RELAY label token")
    job = str(payload.get("job_number") or "TBC")[:32]
    requester = str(payload.get("requested_by") or "Not recorded")[:48]
    ready = format_ready_at(payload.get("ready_at"))

    image = Image.new("L", (1050, 425), "white")
    draw = ImageDraw.Draw(image)
    draw.text((36, 22), "RELAY", font=font(31, True), fill="black")
    draw.text((1014, 22), "PARTS READY", font=font(28, True), fill="black", anchor="ra")
    draw.line((36, 67, 1014, 67), fill="black", width=2)

    draw.text((36, 88), "JOB NUMBER", font=font(17, True), fill="black")
    draw.text((36, 112), job, font=fit_text(draw, job, 330, 60), fill="black")
    draw.text((405, 88), "REQUESTED BY", font=font(17, True), fill="black")
    draw.text((405, 122), requester, font=fit_text(draw, requester, 275, 31), fill="black")
    draw.text((728, 88), "READY AT", font=font(17, True), fill="black")
    draw.text((728, 122), ready, font=fit_text(draw, ready, 286, 27), fill="black")

    draw_code39(draw, token, 74, 218, 902, 100)
    draw.text((525, 345), job, font=fit_text(draw, job, 902, 30), fill="black", anchor="ma")
    image.save(path, "PNG", dpi=(300, 300))

def printer_name():
    if PRINTER:
        return PRINTER
    result = subprocess.run(["lpstat", "-d"], check=True, capture_output=True, text=True, timeout=5)
    match = re.search(r":\s*(.+)$", result.stdout.strip())
    if not match:
        raise RuntimeError("No default CUPS printer is configured")
    return match.group(1).strip()

class Handler(BaseHTTPRequestHandler):
    def send_json_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def reply(self, payload, status=200):
        self.send_json_headers(status)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_json_headers(204)

    def do_GET(self):
        if self.path != "/health":
            return self.reply({"ok": False, "error": "Not found"}, 404)
        try:
            selected = printer_name()
            subprocess.run(["lpstat", "-p", selected], check=True, capture_output=True, text=True, timeout=5)
            self.reply({"ok": True, "printer": selected})
        except Exception as error:
            self.reply({"ok": False, "error": str(error)}, 503)

    def do_POST(self):
        if self.path != "/print":
            return self.reply({"ok": False, "error": "Not found"}, 404)
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 16384)
            payload = json.loads(self.rfile.read(length))
            selected = printer_name()
            with tempfile.NamedTemporaryFile(prefix="relay-label-", suffix=".png", delete=False) as temporary:
                path = temporary.name
            try:
                render_label(payload, path)
                result = subprocess.run(
                    ["lp", "-d", selected, "-o", "media=w102h252", "-o", "fit-to-page", path],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                self.reply({"ok": True, "printer": selected, "cupsJob": result.stdout.strip()})
            finally:
                Path(path).unlink(missing_ok=True)
        except Exception as error:
            self.reply({"ok": False, "error": str(error)}, 500)

    def log_message(self, format, *args):
        return

if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
