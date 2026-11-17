import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSiteSettings } from "@/hooks/use-site-settings";

export const THEMES = [
  { id: "neon", label: "Blue & mixed" },
  { id: "crimson", label: "Crimson" },
  { id: "daylight", label: "Daylight" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type NavAlign = "left" | "center" | "right";

type ThemeContextValue = {
  theme: ThemeId;
  navAlign: NavAlign;
  setNavAlign: (align: NavAlign) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark", ...THEMES.map((t) => `theme-${t.id}`));
  root.classList.add(`theme-${theme}`);
  root.classList.toggle("dark", theme !== "daylight");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const settings = useSiteSettings();
  const [navAlign, setNavAlignState] = useState<NavAlign>("left");
  const theme = settings.site_theme;

  useEffect(() => {
    const saved = localStorage.getItem("cp-nav-align");
    if (saved === "left" || saved === "center" || saved === "right") {
      setNavAlignState(saved);
    }
  }, []);

  const setNavAlign = (next: NavAlign) => {
    setNavAlignState(next);
    localStorage.setItem("cp-nav-align", next);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, navAlign, setNavAlign }), [theme, navAlign, setNavAlign]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
