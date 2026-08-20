import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeFrontCounterIdentifier } from "@/lib/front-counter";

describe("front counter identifiers", () => {
  it("normalizes job and verbal collection codes", () => {
    expect(normalizeFrontCounterIdentifier(" 53904 ")).toBe("53904");
    expect(normalizeFrontCounterIdentifier(" ab23cd ")).toBe("AB23CD");
  });

  it("extracts a RELAY label token from keyboard-scanner wrappers", () => {
    expect(normalizeFrontCounterIdentifier("scan:RLY-ABC12345:end")).toBe("RLY-ABC12345");
  });

  it("does not silently reinterpret unknown content", () => {
    expect(normalizeFrontCounterIdentifier("not a relay code")).toBe("NOT A RELAY CODE");
  });
});

describe("front counter live operations", () => {
  it("notifies every admin when a new fitter collection enters the queue", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260820130000_notify_admins_of_front_counter_collection.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("'front_counter_collection'");
    expect(migration).toContain("from public.profiles profile");
    expect(migration).toContain("where profile.role = 'admin'");
    expect(migration).toContain("if is_new_request then");
  });

  it("starts the wallboard alone until the portrait DSI terminal is detected", () => {
    const kiosk = readFileSync(
      resolve(process.cwd(), "printer-agents/cups/relay-display-kiosk.sh"),
      "utf8",
    );

    expect(kiosk).toContain('launch_relay_window "$RELAY_BASE_URL/wallboard"');
    expect(kiosk).toContain('if [[ -n "$touch_output" ]]');
    expect(kiosk).toContain('launch_relay_window "$RELAY_BASE_URL/terminal"');
    expect(kiosk).toContain('--app="$url"');
    expect(kiosk).toContain("--ozone-platform=wayland");
    expect(kiosk).not.toContain("--start-fullscreen");

    const windowRules = readFileSync(
      resolve(process.cwd(), "printer-agents/cups/relay-labwc-rc.xml"),
      "utf8",
    );

    expect(windowRules).toContain('title="RELAY Wallboard*"');
    expect(windowRules).toContain('name="MoveToOutput" direction="right" wrap="no"');
    expect(windowRules).toContain('title="RELAY Front Counter Terminal*"');
    expect(windowRules).toContain('name="MoveToOutput" direction="left" wrap="no"');
    expect(windowRules).not.toContain('output="HDMI-A-2"');
  });
});
