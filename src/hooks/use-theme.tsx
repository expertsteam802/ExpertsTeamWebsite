import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type NavAlign = "left" | "center" | "right";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  navAlign: NavAlign;
  setNavAlign: (align: NavAlign) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.classList.remove(...THEMES.map((t) => `theme-${t.id}`));
  root.classList.add(`theme-${theme}`);
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("dark");
  const [navAlign, setNavAlignState] = useState<NavAlign>("left");

  useEffect(() => {
    const storedTheme = localStorage.getItem("cp-theme") as ThemeId | null;
    const storedAlign = localStorage.getItem("cp-nav-align") as NavAlign | null;
    if (storedTheme && THEMES.some((t) => t.id === storedTheme)) setThemeState(storedTheme);
    if (storedAlign) setNavAlignState(storedAlign);
    applyTheme(storedTheme && THEMES.some((t) => t.id === storedTheme) ? storedTheme : "dark");
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    localStorage.setItem("cp-theme", next);
    applyTheme(next);
  }, []);

  const setNavAlign = useCallback((next: NavAlign) => {
    setNavAlignState(next);
    localStorage.setItem("cp-nav-align", next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, navAlign, setNavAlign }),
    [theme, setTheme, navAlign, setNavAlign],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
