export const accessGroupIds = [
  "admin",
  "front_counter",
  "parts",
  "workshop",
  "office",
  "transport",
  "fitter",
  "assetcare",
] as const;

export type AccessGroupId = (typeof accessGroupIds)[number];

export const accessGroupLabels: Record<AccessGroupId, string> = {
  admin: "Admin",
  front_counter: "Front Counter",
  parts: "Parts",
  workshop: "Workshop",
  office: "Office",
  transport: "Transport",
  fitter: "Fitter",
  assetcare: "AssetCare+ User",
};

export function normalizeAccessGroup(
  value: unknown,
  fallback: AccessGroupId = "fitter",
): AccessGroupId {
  return typeof value === "string" && accessGroupIds.includes(value as AccessGroupId)
    ? (value as AccessGroupId)
    : fallback;
}

export const accessGroupDescriptions: Record<AccessGroupId, string> = {
  admin: "All RELAY areas and access administration.",
  front_counter: "Counter terminal and wallboard only.",
  parts: "Live Queue, assigned jobs, completed jobs, reports, New Request, Requests, pre-pick, scan and issue, Stores Self-Service, Filter Lookup, Parts Knowledge, Parts Control and RELAY AI.",
  workshop: "Live Queue, requests, workshop work, the complete Fleet & Assets workspace, reports and RELAY AI.",
  office: "Live Queue, requests, the complete Fleet & Assets workspace, reports and RELAY AI.",
  transport: "Live Queue, requests, the complete Fleet & Assets workspace, reports and RELAY AI.",
  fitter: "New requests, own requests, assigned tasks, Fleet Map and RELAY AI.",
  assetcare: "Fleet dashboard, Fleet Map and Fleet Register.",
};

const exactGroupRoutes: Partial<Record<AccessGroupId, string[]>> = {
  front_counter: ["/terminal", "/wallboard"],
  fitter: ["/fleet"],
  workshop: ["/console", "/assets", "/assets/inbox", "/fleet", "/fleet/map", "/fleet/register", "/fleet/trips", "/fleet/scheduler"],
  transport: ["/console", "/requests", "/assets", "/assets/inbox", "/fleet", "/fleet/map", "/fleet/register", "/fleet/trips", "/fleet/scheduler", "/reports"],
  office: ["/console", "/requests", "/assets", "/assets/inbox", "/fleet", "/fleet/map", "/fleet/register", "/fleet/trips", "/fleet/scheduler", "/reports"],
  assetcare: ["/assets", "/fleet", "/fleet/map", "/fleet/register"],
};

const prefixGroupRoutes: Partial<Record<AccessGroupId, string[]>> = {
  fitter: ["/submit", "/requests", "/tasks", "/tickets/", "/fleet/map"],
  workshop: ["/requests", "/tickets/", "/incidents", "/fleet/map", "/reports"],
  parts: [
    "/console",
    "/my-jobs",
    "/completed",
    "/reports",
    "/submit",
    "/requests",
    "/tickets/",
    "/pre-pick",
    "/scan",
    "/stores",
    "/filters",
    "/parts-knowledge",
  ],
};

export function canAccessPath(group: AccessGroupId, pathname: string) {
  if (group === "admin") return true;
  if (pathname === "/" || pathname === "/login") return true;
  if (exactGroupRoutes[group]?.includes(pathname)) return true;
  return Boolean(prefixGroupRoutes[group]?.some((prefix) =>
    pathname === prefix || (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname.startsWith(`${prefix}/`)),
  ));
}

export function canUsePage(
  isAdmin: boolean,
  accessGroup: AccessGroupId | null,
  pathname: string,
) {
  return isAdmin || Boolean(accessGroup && canAccessPath(accessGroup, pathname));
}

export function accessGroupHome(group: AccessGroupId) {
  if (group === "admin") return "/console";
  if (group === "front_counter") return "/terminal";
  if (group === "assetcare" || group === "transport") return "/fleet/map";
  if (group === "office") return "/assets";
  if (group === "workshop") return "/incidents";
  if (group === "parts") return "/admin";
  return "/requests";
}
