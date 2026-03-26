"use client";

import { useRelayTheme } from "@/components/theme-provider";

export function ThemeToggleButton() {
  const { theme, setTheme } = useRelayTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="aurora-theme-toggle"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? "Light Mode" : "Dark Mode"}
    </button>
  );
}
