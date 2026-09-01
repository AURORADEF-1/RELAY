"use client";

import { useCallback, useEffect, useState } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type DeviceCommand = "refresh_session" | "reboot" | "shutdown";

type FrontCounterStatus = {
  station_name: string | null;
  device_online: boolean;
  device_last_seen_at: string | null;
  device_hostname: string | null;
  device_uptime_seconds: number | null;
  device_agent_version: string | null;
  printer_online: boolean;
  printer_name: string | null;
  printer_last_seen_at: string | null;
  printer_last_error: string | null;
  command: DeviceCommand | null;
  command_status: "pending" | "running" | "succeeded" | "failed" | null;
  command_requested_at: string | null;
  command_completed_at: string | null;
  command_result: string | null;
};

const commandLabels: Record<DeviceCommand, string> = {
  refresh_session: "Refresh RELAY screens",
  reboot: "Restart Pi",
  shutdown: "Shut down Pi",
};

export function FrontCounterControlPanel() {
  const [status, setStatus] = useState<FrontCounterStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommand, setActiveCommand] = useState<DeviceCommand | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const loadStatus = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setNotice({
          tone: "error",
          message: "RELAY connection settings are unavailable.",
        });
        setIsLoading(false);
        return;
      }

      if (!quiet) setIsLoading(true);
      try {
        const access = await getCurrentUserWithRole(supabase, {
          forceFresh: true,
        });
        if (!access.user || !access.isAdmin)
          throw new Error("Admin access is required.");

        const { data, error } = await supabase.rpc(
          "get_front_counter_device_status",
        );
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : null;
        setStatus((row as FrontCounterStatus | undefined) ?? null);
        if (!quiet) setNotice(null);
      } catch (error) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to read the Front Counter status.",
        });
      } finally {
        if (!quiet) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadStatus();
    const intervalId = window.setInterval(
      () => void loadStatus({ quiet: true }),
      10_000,
    );
    return () => window.clearInterval(intervalId);
  }, [loadStatus]);

  async function sendCommand(command: DeviceCommand) {
    if (command === "shutdown") {
      const confirmed = window.confirm(
        "Shut down the Front Counter Pi? It cannot be powered back on through SSH or RELAY; someone must restore power physically.",
      );
      if (!confirmed) return;
    }
    if (
      command === "reboot" &&
      !window.confirm(
        "Restart the Front Counter Pi now? The screens and printer will be unavailable briefly.",
      )
    ) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;
    setActiveCommand(command);
    setNotice(null);
    try {
      const access = await getCurrentUserWithRole(supabase, {
        forceFresh: true,
      });
      if (!access.user || !access.isAdmin)
        throw new Error("Admin access is required.");
      const { error } = await supabase.rpc(
        "request_front_counter_device_command",
        {
          p_command: command,
        },
      );
      if (error) throw error;
      setNotice({
        tone: "success",
        message: `${commandLabels[command]} sent securely to the Front Counter.`,
      });
      await loadStatus({ quiet: true });
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to send the Front Counter command.",
      });
    } finally {
      setActiveCommand(null);
    }
  }

  const commandBusy =
    status?.command_status === "pending" ||
    status?.command_status === "running";
  const canControl =
    Boolean(status?.device_online) && !commandBusy && !activeCommand;

  return (
    <div className="grid gap-6">
      <section className="admin-control-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="aurora-kicker">Device connection</p>
            <h2 className="mt-3 aurora-heading">Front Counter Pi</h2>
            <p className="mt-3 max-w-3xl aurora-copy">
              Live device, browser and CUPS status. Commands travel through
              RELAY&apos;s authenticated outbound connection; no SSH password or
              local printer port is exposed to the web.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={isLoading}
            className="aurora-button-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ConsoleIcon name="refresh" className="h-4 w-4" />
            {isLoading ? "Checking…" : "Refresh status"}
          </button>
        </div>

        {notice ? (
          <div
            className={`mt-5 aurora-alert ${notice.tone === "success" ? "aurora-alert-success" : "aurora-alert-error"}`}
          >
            {notice.message}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            label="Pi connection"
            value={
              isLoading
                ? "Checking"
                : status?.device_online
                  ? "Online"
                  : "Offline"
            }
            helper={
              status?.device_last_seen_at
                ? `Last contact ${formatDateTime(status.device_last_seen_at)}`
                : "No device heartbeat received yet."
            }
            tone={status?.device_online ? "success" : "danger"}
          />
          <StatusCard
            label="RELAY screens"
            value={status?.device_online ? "Available" : "Unknown"}
            helper={
              status?.device_hostname
                ? `${status.device_hostname} · Agent ${status.device_agent_version || "unknown"}`
                : "Waiting for the Front Counter agent."
            }
            tone={status?.device_online ? "success" : "neutral"}
          />
          <StatusCard
            label="CUPS printer"
            value={status?.printer_online ? "Ready" : "Unavailable"}
            helper={
              status?.printer_last_error ||
              status?.printer_name ||
              "Printer status has not been reported."
            }
            tone={status?.printer_online ? "success" : "danger"}
          />
          <StatusCard
            label="Pi uptime"
            value={formatUptime(status?.device_uptime_seconds)}
            helper="Time since the Front Counter Pi last restarted."
            tone="neutral"
          />
        </div>
      </section>

      <section className="admin-control-panel">
        <div>
          <p className="aurora-kicker">Safe maintenance</p>
          <h2 className="mt-3 aurora-heading">Connection controls</h2>
          <p className="mt-3 max-w-3xl aurora-copy">
            Refresh both RELAY Chromium windows without changing their signed-in
            profile, restart the Pi, or shut it down cleanly.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <ControlButton
            title="Refresh RELAY screens"
            detail="Relaunches the TV wallboard and touch terminal using the existing Front Counter session."
            actionLabel="Refresh screens"
            disabled={!canControl}
            busy={activeCommand === "refresh_session"}
            onClick={() => void sendCommand("refresh_session")}
          />
          <ControlButton
            title="Restart Pi"
            detail="Gracefully reboots the Raspberry Pi and automatically restores both RELAY screens."
            actionLabel="Restart Pi"
            disabled={!canControl}
            busy={activeCommand === "reboot"}
            onClick={() => void sendCommand("reboot")}
          />
          <ControlButton
            title="Shut down Pi"
            detail="Safely powers the operating system down. Physical power is required to start it again."
            actionLabel="Shut down"
            disabled={!canControl}
            busy={activeCommand === "shutdown"}
            danger
            onClick={() => void sendCommand("shutdown")}
          />
        </div>

        <div className="mt-5 rounded-[1.25rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
          <strong>Power on:</strong> a Raspberry Pi cannot be turned on through
          SSH after shutdown. RELAY can add a Power On control later if a
          managed PoE switch or smart power relay is connected.
        </div>
      </section>

      <section className="admin-control-panel">
        <p className="aurora-kicker">Latest command</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--foreground-strong)]">
              {status?.command
                ? commandLabels[status.command]
                : "No maintenance command sent"}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
              {status?.command_result ||
                "Front Counter actions and their result will appear here."}
            </p>
          </div>
          <div className="text-sm text-[color:var(--foreground-muted)] lg:text-right">
            <p className="font-semibold uppercase tracking-[0.12em]">
              {status?.command_status || "idle"}
            </p>
            <p>
              {formatDateTime(
                status?.command_completed_at || status?.command_requested_at,
              )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "success" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50"
        : "border-[color:var(--border)] bg-[color:var(--background-panel-strong)]";
  return (
    <article
      className={`rounded-[1.4rem] border p-5 shadow-[var(--shadow-soft)] ${toneClass}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-[color:var(--foreground-strong)]">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-[color:var(--foreground-muted)]">
        {helper}
      </p>
    </article>
  );
}

function ControlButton({
  title,
  detail,
  actionLabel,
  disabled,
  busy,
  danger = false,
  onClick,
}: {
  title: string;
  detail: string;
  actionLabel: string;
  disabled: boolean;
  busy: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <article className="rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-5 shadow-[var(--shadow-soft)]">
      <h3 className="text-lg font-semibold text-[color:var(--foreground-strong)]">
        {title}
      </h3>
      <p className="mt-2 min-h-20 text-sm leading-6 text-[color:var(--foreground-muted)]">
        {detail}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${danger ? "aurora-button-danger" : "aurora-button-primary"} mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {busy ? "Sending…" : actionLabel}
      </button>
    </article>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatUptime(value?: number | null) {
  if (!value || value < 1) return "Unknown";
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((value % 3_600) / 60);
  return `${hours}h ${minutes}m`;
}
