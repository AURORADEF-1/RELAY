"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { useRelayTheme } from "@/components/theme-provider";
import {
  fetchCurrentProfileSettings,
  updateProfileSettings,
  uploadProfileAvatar,
} from "@/lib/profile-settings";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

export default function SettingsPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin, taskUnreadCount } = useNotifications();
  const { theme, setTheme } = useRelayTheme();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        if (isMounted) {
          setNotice({
            type: "error",
            message: "Supabase environment variables are not configured.",
          });
          setIsLoading(false);
        }
        return;
      }

      const { user } = await getCurrentUserWithRole(supabase);

      if (!user) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      const profile = await fetchCurrentProfileSettings(supabase, user.id);

      if (!isMounted) {
        return;
      }

      setCurrentUserId(user.id);
      setDisplayName(profile.full_name ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
      setIsLoading(false);
    }

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSaveProfile() {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUserId) {
      setNotice({
        type: "error",
        message: "Unable to save settings right now.",
      });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      await updateProfileSettings(supabase, {
        userId: currentUserId,
        fullName: displayName,
      });
      setNotice({
        type: "success",
        message: "Settings saved.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save settings.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const supabase = getSupabaseClient();
    const file = event.target.files?.[0];

    if (!supabase || !currentUserId || !file) {
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const avatarPath = await uploadProfileAvatar(supabase, {
        userId: currentUserId,
        file,
      });

      await updateProfileSettings(supabase, {
        userId: currentUserId,
        fullName: displayName,
        avatarPath,
      });

      const profile = await fetchCurrentProfileSettings(supabase, currentUserId);
      setAvatarUrl(profile.avatar_url ?? null);
      setNotice({
        type: "success",
        message: "Profile photo updated.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to update the profile photo.",
      });
    } finally {
      setIsSaving(false);
      event.target.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">Home</Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">Legal</Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/tasks" className="rounded-full px-4 py-2 hover:bg-white">
              Tasks
              <NotificationBadge count={taskUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link href="/incidents" className="rounded-full px-4 py-2 hover:bg-white">Workshop Control</Link>
                <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white">Admin Control</Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard>
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Profile & App
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Settings
              </h1>
              <p className="text-base leading-8 text-slate-600">
                Update your display name, profile photo, app theme, and raise a support ticket.
              </p>
            </div>

            {notice ? (
              <div
                className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
                  notice.type === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {notice.message}
              </div>
            ) : null}

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.95fr]">
              <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Profile
                </p>
                <div className="mt-5 flex items-center gap-4">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-18 w-18 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-18 w-18 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-600">
                      {displayName.trim().charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
                    Upload Profile Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </label>
                </div>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Display name
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </label>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={isSaving || isLoading}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </section>

              <section className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Theme
                  </p>
                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                        theme === "light"
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      Light Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                        theme === "dark"
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      Dark Mode
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Support
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    Raise a support ticket by email if you need help with RELAY.
                  </p>
                  <a
                    href={`mailto:george.ambrose@mervynlambert.co.uk?subject=${encodeURIComponent("RELAY Support Ticket")}&body=${encodeURIComponent("Please describe the issue you are having in RELAY:\n\nUser:\nPage:\nIssue:\n")}`}
                    className="mt-5 inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Raise Support Ticket
                  </a>
                </div>
              </section>
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}
