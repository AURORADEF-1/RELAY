"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { RelayLogo } from "@/components/relay-logo";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { ConsoleIcon, type ConsoleIconName } from "@/components/console/console-icon";
import { RelayAiPanel } from "@/components/console/relay-ai-panel";
import type { SmartSearchResult } from "@/lib/admin-smart-search";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";

type ConsoleShellProps = {
  children: React.ReactNode;
  contentClassName?: string;
  shellClassName?: string;
  eyebrow?: string;
  title: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  actions?: React.ReactNode;
  onOpenRelayAi?: () => void;
  isRelayAiOpen?: boolean;
};

type NavigationItem = {
  href: string;
  label: string;
  icon: ConsoleIconName;
  adminOnly?: boolean;
  fleetMemberOnly?: boolean;
  badge?: "admin" | "requester" | "tasks";
  external?: boolean;
};

const navigation: NavigationItem[] = [
  { href: "/console", label: "Operations", icon: "console", adminOnly: true },
  { href: "/submit", label: "New request", icon: "ticket" },
  { href: "/requests", label: "My requests", icon: "clipboard", badge: "requester" },
  { href: "/fleet", label: "Fleet", icon: "fleet", fleetMemberOnly: true },
  { href: "/parts-knowledge", label: "Parts Knowledge", icon: "parts", adminOnly: true },
  { href: "/admin", label: "Parts control", icon: "parts", adminOnly: true, badge: "admin" },
  { href: "/incidents", label: "Workshop", icon: "workshop", adminOnly: true },
  { href: "/tasks", label: "Tasks", icon: "activity", badge: "tasks" },
  { href: "/control", label: "Administration", icon: "settings", adminOnly: true },
  { href: "/wallboard", label: "Wallboard", icon: "wallboard", adminOnly: true, external: true },
];

export function ConsoleShell({
  children,
  contentClassName = "",
  shellClassName = "",
  eyebrow = "RELAY operations",
  title,
  searchValue,
  searchPlaceholder = "Search jobs, machines or requesters",
  onSearchChange,
  actions,
  onOpenRelayAi,
  isRelayAiOpen = false,
}: ConsoleShellProps) {
  const pathname = usePathname();
  const { adminBadgeCount, isAdmin, requesterUnreadCount, taskUnreadCount } = useNotifications();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isInternalRelayAiOpen, setIsInternalRelayAiOpen] = useState(false);
  const [signedInUserName, setSignedInUserName] = useState("Signed in");
  const [hasCustomerFleet, setHasCustomerFleet] = useState(false);
  const [commandMachineResults, setCommandMachineResults] = useState<SmartSearchResult[]>([]);
  const [isCommandSearchFocused, setIsCommandSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    void getCurrentUserWithRole(supabase)
      .then(async ({ user, profile }) => {
        if (!isMounted) {
          return;
        }

        const displayName = profile?.display_name?.trim();
        setSignedInUserName(displayName || user?.email?.trim() || "Signed in");

        if (!user) {
          setHasCustomerFleet(false);
          return;
        }

        const { data } = await supabase
          .from("customer_fleet_members")
          .select("fleet_id")
          .eq("user_id", user.id)
          .limit(1);

        if (isMounted) {
          setHasCustomerFleet(Boolean(data?.length));
        }
      })
      .catch(() => {
        // Authentication handling remains with AuthGuard; the shell keeps a safe fallback label.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const saved = window.localStorage.getItem("relay-console-sidebar");
      setIsCollapsed(saved === "collapsed");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");

        if (!isTyping && onSearchChange) {
          event.preventDefault();
          searchRef.current?.focus();
        }
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onSearchChange]);

  useEffect(() => {
    const query = searchValue?.trim() ?? "";

    if (!isAdmin || !onSearchChange || query.length < 2) {
      const resetId = window.setTimeout(() => setCommandMachineResults([]), 0);
      return () => window.clearTimeout(resetId);
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const accessToken = await getSupabaseAccessToken();
        if (!accessToken) {
          setCommandMachineResults([]);
          return;
        }

        const response = await fetch("/api/admin/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ query, scope: "live" }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          setCommandMachineResults([]);
          return;
        }

        const payload = (await response.json()) as { results?: SmartSearchResult[] };
        setCommandMachineResults(
          (payload.results ?? []).filter((result) => result.entity === "machine").slice(0, 5),
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCommandMachineResults([]);
        }
      }
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [isAdmin, onSearchChange, searchValue]);

  function toggleCollapsed() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    window.localStorage.setItem("relay-console-sidebar", next ? "collapsed" : "expanded");
  }

  function getBadgeCount(item: NavigationItem) {
    if (item.badge === "admin") {
      return adminBadgeCount;
    }

    if (item.badge === "requester") {
      return requesterUnreadCount;
    }

    if (item.badge === "tasks") {
      return taskUnreadCount;
    }

    return 0;
  }

  const visibleNavigation = navigation.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.fleetMemberOnly || isAdmin || hasCustomerFleet),
  );
  const effectiveRelayAiOpen = onOpenRelayAi ? isRelayAiOpen : isInternalRelayAiOpen;

  return (
    <div className={`console-shell ${isCollapsed ? "console-shell-collapsed" : ""} ${shellClassName}`.trim()}>
      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="console-sidebar-scrim"
          onClick={() => setIsMobileOpen(false)}
        />
      ) : null}

      <aside className={`console-sidebar ${isMobileOpen ? "console-sidebar-mobile-open" : ""}`}>
        <div className="console-sidebar-brand">
          <Link href={isAdmin ? "/console" : "/"} aria-label="RELAY home">
            <RelayLogo compact={isCollapsed} />
          </Link>
          <button
            type="button"
            className="console-icon-button console-sidebar-close"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close navigation"
          >
            <ConsoleIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="console-sidebar-context" aria-hidden={isCollapsed}>
          <span className="console-live-dot" />
          <span title={signedInUserName}>{signedInUserName}</span>
        </div>

        <nav className="console-navigation" aria-label="Primary navigation">
          <button
            type="button"
            onClick={() => {
              if (onOpenRelayAi) {
                onOpenRelayAi();
              } else {
                setIsInternalRelayAiOpen(true);
              }
              setIsMobileOpen(false);
            }}
            className={`console-nav-item ${effectiveRelayAiOpen ? "console-nav-item-active" : ""}`}
            title={isCollapsed ? "RELAY AI" : undefined}
            aria-pressed={effectiveRelayAiOpen}
          >
            <ConsoleIcon name="message" className="console-nav-icon" />
            <span className="console-nav-label">RELAY AI</span>
          </button>
          {visibleNavigation.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(`${item.href}/`)) ||
              (item.href === "/console" && pathname.startsWith("/tickets/"));
            const badgeCount = getBadgeCount(item);

            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                onClick={() => setIsMobileOpen(false)}
                className={`console-nav-item ${active ? "console-nav-item-active" : ""}`}
                title={isCollapsed ? item.label : undefined}
              >
                <ConsoleIcon name={item.icon} className="console-nav-icon" />
                <span className="console-nav-label">{item.label}</span>
                {badgeCount > 0 ? <NotificationBadge count={badgeCount} /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="console-sidebar-footer">
          <button
            type="button"
            className="console-nav-item hidden lg:flex"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : undefined}
          >
            <ConsoleIcon
              name="chevron"
              className={`console-nav-icon ${isCollapsed ? "" : "rotate-180"}`}
            />
            <span className="console-nav-label">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="console-main">
        <header className="console-command-bar">
          <div className="console-command-title">
            <button
              type="button"
              className="console-icon-button lg:hidden"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open navigation"
            >
              <ConsoleIcon name="menu" className="h-5 w-5" />
            </button>
            <div>
              <p>{eyebrow}</p>
              <h1>{title}</h1>
            </div>
          </div>

          {onSearchChange ? (
            <div className="console-command-search-wrap">
              <label className="console-command-search">
                <ConsoleIcon name="search" className="h-4 w-4" />
                <span className="sr-only">Search</span>
                <input
                  ref={searchRef}
                  value={searchValue ?? ""}
                  onChange={(event) => onSearchChange(event.target.value)}
                  onFocus={() => setIsCommandSearchFocused(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsCommandSearchFocused(false), 120);
                  }}
                  placeholder={searchPlaceholder}
                />
                <kbd>/</kbd>
              </label>
              {isCommandSearchFocused && commandMachineResults.length > 0 ? (
                <div className="console-command-results" aria-label="Matching machines">
                  <p>Machines</p>
                  {commandMachineResults.map((result) => (
                    <Link key={result.id} href={result.href}>
                      <ConsoleIcon name="fleet" className="h-4 w-4" />
                      <span>
                        <strong>{result.title}</strong>
                        <small>{result.subtitle}</small>
                      </span>
                      <em>{result.meta}</em>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="console-command-actions">
            {actions}
            <ThemeToggleButton />
            <LogoutButton />
          </div>
        </header>

        <main className={`console-content ${contentClassName}`.trim()}>{children}</main>
      </div>
      {!onOpenRelayAi ? (
        <RelayAiPanel
          key={isAdmin ? "relay-ai-full" : "relay-ai-requester"}
          isOpen={isInternalRelayAiOpen}
          onClose={() => setIsInternalRelayAiOpen(false)}
          accessMode={isAdmin ? "full" : "requester"}
        />
      ) : null}
    </div>
  );
}
