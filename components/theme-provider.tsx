"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type RelayTheme = "light" | "dark";

type ThemeContextValue = {
  theme: RelayTheme;
  setTheme: (theme: RelayTheme) => void;
};

// Version the preference key so this release resets every existing session to
// the new product default once. Choices made after the release remain sticky.
const THEME_STORAGE_KEY = "relay-theme-v2";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<RelayTheme>("dark");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      setThemeState(storedTheme === "light" ? "light" : "dark");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function setTheme(nextTheme: RelayTheme) {
    setThemeState(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useRelayTheme() {
  return useContext(ThemeContext);
}
