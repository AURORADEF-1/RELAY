"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { AssetInboxBadge } from '@/components/assets/inbox-badge';
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { RelayLogo } from "@/components/relay-logo";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import {
  ConsoleIcon,
  type ConsoleIconName,
} from "@/components/console/console-icon";
import { RelayAiPanel } from "@/components/console/relay-ai-panel";
import type { SmartSearchResult } from "@/lib/admin-smart-search";
import { isLocalRolePreviewEnabled } from "@/lib/demo-mode";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";
import { accessGroupLabels, type AccessGroupId } from "@/lib/access-groups";

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
  category: NavigationCategoryId;
  adminOnly?: boolean;
  workflowOnly?: boolean;
  oversightOnly?: boolean;
  fleetMemberOnly?: boolean;
  assetOnly?: boolean;
  liveLinkOnly?: boolean;
  trackunitOnly?: boolean;
  takeuchiOnly?: boolean;
  frontCounterOnly?: boolean;
  badge?: "admin" | "requester" | "tasks";
  external?: boolean;
  groups?: AccessGroupId[];
};

type DemoAccessView = "admin" | "fitter" | "workshop" | "transport" | "office" | "parts" | "front-counter" | "assetcare";

const previewProfileLabels: Record<DemoAccessView, string> = {
  admin: "Admin",
  fitter: "Fitter",
  workshop: "Workshop",
  transport: "Transport",
  office: "Office",
  parts: "Parts",
  "front-counter": "Front Counter",
  assetcare: "AssetCare+ User",
};

type NavigationCategoryId =
  | "operations"
  | "requests"
  | "fleet"
  | "workshop"
  | "front-counter"
  | "administration";

type NavigationCategory = {
  id: NavigationCategoryId;
  label: string;
  icon: ConsoleIconName;
};

const navigationCategories: NavigationCategory[] = [
  { id: "operations", label: "Operations", icon: "console" },
  { id: "requests", label: "Requests & Parts", icon: "parts" },
  { id: "fleet", label: "Fleet & Assets", icon: "fleet" },
  { id: "workshop", label: "Workshop", icon: "workshop" },
  { id: "front-counter", label: "Front Counter", icon: "wallboard" },
  { id: "administration", label: "Administration", icon: "settings" },
];

const navigation: NavigationItem[] = [
  {
    href: "/terminal",
    label: "Terminal",
    icon: "console",
    category: "front-counter",
    frontCounterOnly: true,
  },
  {
    href: "/wallboard",
    label: "Wallboard",
    icon: "wallboard",
    category: "front-counter",
    frontCounterOnly: true,
    external: true,
  },
  { href: "/console", label: "Live Queue", icon: "console", category: "operations", adminOnly: true, groups: ["admin", "office", "transport", "parts"] },
  { href: "/my-jobs", label: "Assigned Jobs", icon: "clipboard", category: "operations", adminOnly: true, groups: ["admin", "parts"] },
  {
    href: "/completed",
    label: "Completed Jobs",
    icon: "clipboard",
    category: "operations",
    adminOnly: true,
    groups: ["admin", "parts"],
  },
  { href: "/pre-pick", label: "Pre-Pick", icon: "prepick", category: "requests", adminOnly: true, groups: ["admin", "parts"] },
  { href: "/scan", label: "Scan & Issue", icon: "parts", category: "requests", adminOnly: true, groups: ["admin", "parts"] },
  { href: "/reports", label: "Reports", icon: "reports", category: "operations", adminOnly: true, groups: ["admin", "parts"] },
  { href: "/plant-wallboard", label: "Plant Wallboard", icon: "wallboard", category: "operations", adminOnly: true, external: true },
  { href: "/oversight", label: "Oversight", icon: "activity", category: "administration", oversightOnly: true },
  { href: "/submit", label: "New Request", icon: "ticket", category: "requests" },
  { href: "/stores", label: "Stores Self-Service", icon: "parts", category: "requests" },
  {
    href: "/requests",
    label: "Requests",
    icon: "clipboard",
    category: "requests",
    badge: "requester",
  },
  { href: "/filters", label: "Filter Lookup", icon: "filter", category: "requests" },
  { href: "/settings", label: "Settings", icon: "settings", category: "administration" },
  { href: "/staff", label: "Staff", icon: "fleet", category: "administration", adminOnly: true },
  { href: "/assets", label: "Dashboard", icon: "fleet", category: "fleet", assetOnly: true },
  { href: "/fleet", label: "Fleet Map", icon: "fleet", category: "fleet", fleetMemberOnly: true },
  { href: "/fleet/trips", label: "Trip History", icon: "activity", category: "fleet", adminOnly: true },
  { href: "/fleet/scheduler", label: "Reports", icon: "fleet", category: "fleet", adminOnly: true },
  { href: "/assets/inbox", label: "Alerts", icon: "fleet", category: "fleet", adminOnly: true },
  { href: "/manitou", label: "Manitou", icon: "fleet", category: "fleet", trackunitOnly: true },
  { href: "/takeuchi", label: "Takeuchi", icon: "fleet", category: "fleet", takeuchiOnly: true },
  { href: "/livelink", label: "JCB", icon: "fleet", category: "fleet", liveLinkOnly: true },
  {
    href: "/parts-knowledge",
    label: "Parts Knowledge",
    icon: "parts",
    category: "requests",
    adminOnly: true,
    groups: ["admin", "parts"],
  },
  {
    href: "/admin",
    label: "Parts Control",
    icon: "parts",
    category: "requests",
    adminOnly: true,
    groups: ["admin", "parts"],
    badge: "admin",
  },
  { href: "/incidents", label: "Dashboard", icon: "workshop", category: "workshop", adminOnly: true },
  { href: "/incidents/damage/new", label: "Report Damage", icon: "ticket", category: "workshop", adminOnly: true },
  { href: "/incidents/tyres/new", label: "Tyre Breakdown", icon: "ticket", category: "workshop", adminOnly: true },
  { href: "/incidents/tasks", label: "Workshop Tasks", icon: "activity", category: "workshop", adminOnly: true },
  { href: "/incidents/tasks/completed", label: "Completed Tasks", icon: "clipboard", category: "workshop", adminOnly: true },
  { href: "/incidents/closed", label: "Closed Incidents", icon: "clipboard", category: "workshop", adminOnly: true },
  {
    href: "/front-counter",
    label: "Counter",
    icon: "wallboard",
    category: "front-counter",
    adminOnly: true,
  },
  { href: "/tasks", label: "Tasks", icon: "activity", category: "operations", badge: "tasks" },
  {
    href: "/control",
    label: "Users & Access",
    icon: "settings",
    category: "administration",
    adminOnly: true,
  },
  {
    href: "/wallboard",
    label: "Wallboard",
    icon: "wallboard",
    category: "front-counter",
    adminOnly: true,
    external: true,
  },
];

const navigationGroups: Partial<Record<string, AccessGroupId[]>> = {
  "/submit": ["fitter", "parts"],
  "/console": ["office", "transport", "parts"],
  "/my-jobs": ["parts"],
  "/completed": ["parts"],
  "/requests": ["fitter", "workshop", "transport", "office", "parts"],
  "/tasks": ["fitter", "workshop"],
  "/pre-pick": ["parts"],
  "/scan": ["parts"],
  "/stores": ["parts"],
  "/filters": ["parts"],
  "/parts-knowledge": ["parts"],
  "/admin": ["parts"],
  "/incidents": ["workshop"],
  "/incidents/damage/new": ["workshop"],
  "/incidents/tyres/new": ["workshop"],
  "/incidents/tasks": ["workshop"],
  "/incidents/tasks/completed": ["workshop"],
  "/incidents/closed": ["workshop"],
  "/assets": ["office", "assetcare"],
  "/fleet": ["fitter", "workshop", "transport", "office", "assetcare"],
  "/fleet/trips": ["transport"],
  "/reports": ["workshop", "transport", "office", "parts"],
};

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
  const router = useRouter();
  const { adminBadgeCount, isAdmin: authenticatedIsAdmin, requesterUnreadCount, taskUnreadCount } =
    useNotifications();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState<NavigationCategoryId | null>("operations");
  const [isInternalRelayAiOpen, setIsInternalRelayAiOpen] = useState(false);
  const [signedInUserName, setSignedInUserName] = useState("Signed in");
  const [hasCustomerFleet, setHasCustomerFleet] = useState(false);
  const [hasTakeuchiAccess,setHasTakeuchiAccess] = useState(false);
  const [hasTrackunitAccess, setHasTrackunitAccess] = useState(false);
  const [hasWorkflowAccess,setHasWorkflowAccess]=useState(false);
  const [hasLiveLinkAccess, setHasLiveLinkAccess] = useState(false);
  const [hasOversightAccess, setHasOversightAccess] = useState(false);
  const [isFrontCounter, setIsFrontCounter] = useState(false);
  const [assignedAccessGroup, setAssignedAccessGroup] = useState<AccessGroupId | null>(null);
  const [demoAccessView, setDemoAccessView] = useState<DemoAccessView>("admin");
  const [commandMachineResults, setCommandMachineResults] = useState<
    SmartSearchResult[]
  >([]);
  const [isCommandSearchFocused, setIsCommandSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const canPreviewRole = isLocalRolePreviewEnabled || authenticatedIsAdmin;
  const hasAssignedAccessGroup = assignedAccessGroup !== null;
  const effectiveAccessGroup: AccessGroupId = canPreviewRole
    ? demoAccessView === "front-counter"
      ? "front_counter"
      : demoAccessView
    : assignedAccessGroup ?? (authenticatedIsAdmin ? "admin" : isFrontCounter ? "front_counter" : "fitter");
  const isAdmin = hasAssignedAccessGroup || canPreviewRole
    ? effectiveAccessGroup === "admin"
    : authenticatedIsAdmin;
  const effectiveIsFrontCounter = effectiveAccessGroup === "front_counter" || isFrontCounter;
  const isAssetCarePreview = effectiveAccessGroup === "assetcare";

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    void getCurrentUserWithRole(supabase)
      .then(async ({ user, profile, isFrontCounter: accessIsFrontCounter, accessGroup }) => {
        if (!isMounted) {
          return;
        }

        const displayName = profile?.display_name?.trim();
        setSignedInUserName(displayName || user?.email?.trim() || "Signed in");
        setIsFrontCounter(accessIsFrontCounter);
        setAssignedAccessGroup(accessGroup);

        if (!user) {
          setHasWorkflowAccess(false);
          setHasLiveLinkAccess(false);
          setHasTrackunitAccess(false); setHasTakeuchiAccess(false);
          setHasCustomerFleet(false);
          setHasOversightAccess(false);
          return;
        }

        // The server checks explicit fitter access; customer-fleet membership is not enough.
        void getSupabaseAccessToken().then(async (token) => {
          if (!token) return;
          void fetch('/api/fleet/workflow/access', {headers:{Authorization:`Bearer ${token}`}}).then(r=>{if(isMounted)setHasWorkflowAccess(r.ok)}).catch(()=>{if(isMounted)setHasWorkflowAccess(false)});
          const [jcb, trackunit, takeuchi] = await Promise.allSettled(["jcb", "trackunit", "takeuchi"].map(provider => fetch(`/api/integrations/${provider}/access`, { headers: { Authorization: `Bearer ${token}` } })));
          if (isMounted) { setHasLiveLinkAccess(jcb.status === "fulfilled" && jcb.value.ok); setHasTrackunitAccess(trackunit.status === "fulfilled" && trackunit.value.ok); setHasTakeuchiAccess(takeuchi.status === "fulfilled" && takeuchi.value.ok); }
        }).catch(() => { if (isMounted) { setHasLiveLinkAccess(false); setHasTrackunitAccess(false); setHasTakeuchiAccess(false); } });

        const [{ data }, { data: oversightAccess }] = await Promise.all([
          supabase.from("customer_fleet_members").select("fleet_id").eq("user_id", user.id).limit(1),
          supabase.from("oversight_access").select("enabled").eq("user_id", user.id).eq("enabled", true).maybeSingle(),
        ]);

        if (isMounted) {
          setHasCustomerFleet(Boolean(data?.length));
          setHasOversightAccess(Boolean(oversightAccess));
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

      const savedView = window.localStorage.getItem("relay-demo-access-view");
      if (savedView && savedView in previewProfileLabels) {
        setDemoAccessView(savedView as DemoAccessView);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const target = event.target as HTMLElement | null;
        const isTyping = target?.matches(
          "input, textarea, select, [contenteditable='true']",
        );

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

        const payload = (await response.json()) as {
          results?: SmartSearchResult[];
        };
        setCommandMachineResults(
          (payload.results ?? [])
            .filter((result) => result.entity === "machine")
            .slice(0, 5),
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
    window.localStorage.setItem(
      "relay-console-sidebar",
      next ? "collapsed" : "expanded",
    );
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
    (item) => {
      if (isAssetCarePreview) {
        return item.href === "/fleet";
      }

      if (effectiveIsFrontCounter) {
        return item.frontCounterOnly;
      }

      if ((hasAssignedAccessGroup || canPreviewRole) && effectiveAccessGroup !== "admin") {
        const allowedGroups = navigationGroups[item.href];
        return Boolean(allowedGroups?.includes(effectiveAccessGroup));
      }

      if (item.groups && !item.groups.includes(effectiveAccessGroup)) {
        return false;
      }

      return (
        !item.frontCounterOnly &&
        !(isAdmin && (item.liveLinkOnly || item.trackunitOnly || item.takeuchiOnly)) &&
        (!item.adminOnly || isAdmin || item.groups?.includes(effectiveAccessGroup)) &&
        (!item.workflowOnly || isAdmin || hasWorkflowAccess) &&
        (!item.assetOnly || isAdmin || hasLiveLinkAccess || hasTrackunitAccess || hasTakeuchiAccess) &&
        (!item.oversightOnly || hasOversightAccess) &&
        (!item.fleetMemberOnly || isAdmin || hasCustomerFleet) &&
        (!item.liveLinkOnly || hasLiveLinkAccess) &&
        (!item.trackunitOnly || hasTrackunitAccess) && (!item.takeuchiOnly || hasTakeuchiAccess)
      );
    },
  );
  const isNavigationItemActive = (item: NavigationItem) =>
    pathname === item.href ||
    (item.href === "/fleet" && ["/fleet/map", "/fleet/register", "/fleet/operations"].some((path)=>pathname.startsWith(path))) ||
    (item.href === "/incidents" && pathname.startsWith("/incidents/") && !navigation.some((candidate)=>candidate.href!=="/incidents"&&pathname.startsWith(candidate.href))) ||
    (!["/", "/fleet", "/incidents"].includes(item.href) && pathname.startsWith(`${item.href}/`)) ||
    (item.href === "/console" && pathname.startsWith("/tickets/"));
  const visibleCategories = navigationCategories
    .map((category) => ({
      ...category,
      label: isAssetCarePreview && category.id === "fleet" ? "Fleet" : category.label,
      items: visibleNavigation.filter((item) => item.category === category.id),
    }))
    .filter((category) => category.items.length > 0);

  useEffect(() => {
    const activeCategory = navigation.find((item) => isNavigationItemActive(item))?.category;
    if (activeCategory) setOpenCategory(activeCategory);
  // Opening follows navigation; user-controlled accordion changes do not retrigger it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const effectiveRelayAiOpen = onOpenRelayAi
    ? isRelayAiOpen
    : isInternalRelayAiOpen;

  return (
    <div
      className={`console-shell ${isCollapsed ? "console-shell-collapsed" : ""} ${shellClassName}`.trim()}
    >
      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="console-sidebar-scrim"
          onClick={() => setIsMobileOpen(false)}
        />
      ) : null}

      <aside
        id="console-navigation-panel"
        className={`console-sidebar ${isMobileOpen ? "console-sidebar-mobile-open" : ""}`}
      >
        <div className="console-sidebar-brand">
          <Link href={isAdmin ? "/console" : "/"} aria-label="RELAY home">
            <RelayLogo compact={isCollapsed && !isMobileOpen} />
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

        <div
          className="console-sidebar-context"
          aria-hidden={isCollapsed && !isMobileOpen}
        >
          <span className="console-live-dot" />
          <span className="console-sidebar-user" title={signedInUserName}>
            <strong>{signedInUserName}</strong>
            <small>
              {isAssetCarePreview
                ? "AssetCare+ User"
                : effectiveIsFrontCounter
                ? "Front Counter"
                : isAdmin
                  ? "Administrator"
                  : accessGroupLabels[effectiveAccessGroup]}
            </small>
          </span>
        </div>

        <nav className="console-navigation" aria-label="Primary navigation">
          {!isAssetCarePreview ? <button
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
            title={isCollapsed && !isMobileOpen ? "AssetCare AI" : undefined}
            aria-pressed={effectiveRelayAiOpen}
          >
            <ConsoleIcon name="message" className="console-nav-icon" />
            <span className="console-nav-label">AssetCare AI</span>
          </button> : null}
          {visibleCategories.map((category) => {
            const categoryActive = category.items.some(isNavigationItemActive);
            const categoryOpen = openCategory === category.id && !isCollapsed;
            const categoryBadgeCount = category.items.reduce((total,item)=>total+getBadgeCount(item),0);
            return <div className={`console-nav-group ${categoryOpen ? "console-nav-group-open" : ""}`} key={category.id}>
              <button
                type="button"
                className={`console-nav-item console-nav-category ${categoryActive ? "console-nav-category-active" : ""}`}
                aria-expanded={categoryOpen}
                aria-controls={`console-nav-${category.id}`}
                title={isCollapsed && !isMobileOpen ? category.label : undefined}
                onClick={()=>{
                  if(isCollapsed){setIsCollapsed(false);window.localStorage.setItem("relay-console-sidebar","expanded");setOpenCategory(category.id);}
                  else setOpenCategory(current=>current===category.id?null:category.id);
                }}
              >
                <ConsoleIcon name={category.icon} className="console-nav-icon"/>
                <span className="console-nav-label">{category.label}</span>
                {categoryBadgeCount>0?<NotificationBadge count={categoryBadgeCount}/>:null}
                <ConsoleIcon name="chevron" className="console-nav-chevron"/>
              </button>
              {categoryOpen?<div id={`console-nav-${category.id}`} className="console-nav-tabs">
                {category.items.map((item)=>{
                  const active=isNavigationItemActive(item),badgeCount=getBadgeCount(item);
                  return <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    target={item.external?"_blank":undefined}
                    rel={item.external?"noreferrer":undefined}
                    onClick={()=>setIsMobileOpen(false)}
                    className={`console-nav-tab ${active?"console-nav-tab-active":""}`}
                  >
                    <ConsoleIcon name={item.icon} className="console-nav-tab-icon"/>
                    <span>{item.label}</span>{item.href==="/assets/inbox"&&<AssetInboxBadge/>}
                    {badgeCount>0?<NotificationBadge count={badgeCount}/>:null}
                  </Link>;
                })}
              </div>:null}
            </div>;
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
          <div className="console-mobile-sidebar-actions">
            <ThemeToggleButton />
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="console-main">
        <header className="console-command-bar">
          <div className="console-command-title">
            <button
              type="button"
              className="console-icon-button console-mobile-menu-button lg:hidden"
              onClick={() => setIsMobileOpen((open) => !open)}
              aria-label={isMobileOpen ? "Close navigation" : "Open navigation"}
              aria-controls="console-navigation-panel"
              aria-expanded={isMobileOpen}
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
                    window.setTimeout(
                      () => setIsCommandSearchFocused(false),
                      120,
                    );
                  }}
                  placeholder={searchPlaceholder}
                />
                <kbd>/</kbd>
              </label>
              {isCommandSearchFocused && commandMachineResults.length > 0 ? (
                <div
                  className="console-command-results"
                  aria-label="Matching machines"
                >
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
            {canPreviewRole ? (
              <label className="console-demo-view-select">
                <span>View as</span>
                <select
                  value={demoAccessView}
                  onChange={(event) => {
                    const nextView = event.target.value as DemoAccessView;
                    setDemoAccessView(nextView);
                    window.localStorage.setItem("relay-demo-access-view", nextView);
                    router.push(
                      nextView === "admin"
                        ? "/console"
                        : nextView === "front-counter"
                          ? "/terminal"
                          : nextView === "assetcare"
                            ? "/fleet/map"
                          : "/requests",
                    );
                  }}
                  aria-label="Preview access role"
                >
                  <option value="fitter">Fitter</option>
                  <option value="workshop">Workshop</option>
                  <option value="transport">Transport</option>
                  <option value="office">Office</option>
                  <option value="parts">Parts</option>
                  <option value="admin">Admin</option>
                  <option value="front-counter">Front Counter</option>
                  <option value="assetcare">AssetCare+ User</option>
                </select>
              </label>
            ) : null}
            {actions}
            <ThemeToggleButton />
            <LogoutButton />
          </div>
        </header>

        <main className={`console-content ${contentClassName}`.trim()}>
          {children}
        </main>
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
