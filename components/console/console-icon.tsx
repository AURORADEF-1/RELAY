export type ConsoleIconName =
  | "activity"
  | "chevron"
  | "clipboard"
  | "close"
  | "command"
  | "console"
  | "file"
  | "fleet"
  | "menu"
  | "message"
  | "parts"
  | "prepick"
  | "refresh"
  | "reports"
  | "search"
  | "settings"
  | "ticket"
  | "wallboard"
  | "workshop";

export function ConsoleIcon({
  name,
  className = "",
}: {
  name: ConsoleIconName;
  className?: string;
}) {
  const paths: Record<ConsoleIconName, React.ReactNode> = {
    activity: (
      <>
        <path d="M4 12h3l2-6 4 12 2-6h5" />
        <path d="M4 4v16h16" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    command: (
      <>
        <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />
      </>
    ),
    console: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 9 3 3-3 3M13 15h4" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>
    ),
    fleet: (
      <>
        <path d="M4 17h11.5a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4Z" />
        <path d="M6 17v-5h8l3 3v2M9 12V7h4l3 5" />
        <path d="m13 7 4-4 2 1-3 8M19 4l2 6-3 2" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    message: (
      <>
        <path d="M4 5h16v12H8l-4 4z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    parts: (
      <>
        <path d="M4 8 12 4l8 4-8 4z" />
        <path d="m4 8 8 4 8-4v8l-8 4-8-4zM12 12v8" />
      </>
    ),
    prepick: (
      <>
        <path d="M3 4h18v16H3zM3 10h18M9 4v16M15 4v16" />
        <path d="M5.5 7h1M11.5 7h1M17.5 7h1M5.5 14h1M11.5 14h1M17.5 14h1" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 9A7 7 0 0 1 18 6.5L20 12M4 12l1.9 5.5A7 7 0 0 0 18 15" />
      </>
    ),
    reports: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        <path d="m4 7 6-4 6 7 5-5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.3-1a8 8 0 0 0 1.7 1l.5 3.1h5l.5-3.1a8 8 0 0 0 1.7-1l2.3 1 2-3.4-2.1-1.5c.1-.3.1-.7.1-1Z" />
      </>
    ),
    ticket: (
      <>
        <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z" />
        <path d="M12 7v10" />
      </>
    ),
    wallboard: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    workshop: (
      <>
        <path d="m14 6 4-3 3 3-3 4" />
        <path d="M16 8 6 18l-3 1 1-3L14 6M8 5l3 3M5 8l3 3" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
