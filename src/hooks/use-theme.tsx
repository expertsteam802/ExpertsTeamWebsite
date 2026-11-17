import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const THEMES = [{ id: "blue", label: "Blue" }] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type NavAlign = "left" | "center" | "right";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  navAlign: NavAlign;
  setNavAlign: (align: NavAlign) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme() {
  const root = document.documentElement;
  // The fixed Blue option uses the original .theme-neon design tokens.
  // Clear classes left by earlier monochrome and experimental theme builds.
  root.classList.remove(
    "theme-light",
    "theme-dark",
    "theme-blue",
    "theme-neon",
    "theme-crimson",
    "theme-daylight",
  );
  root.classList.add("theme-neon");
  root.classList.add("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("blue");
  const [navAlign, setNavAlignState] = useState<NavAlign>("left");

  useEffect(() => {
    const storedAlign = localStorage.getItem("cp-nav-align") as NavAlign | null;
    if (storedAlign) setNavAlignState(storedAlign);
    setThemeState("blue");
    applyTheme();
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    if (next !== "blue") return;
    applyTheme();
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
