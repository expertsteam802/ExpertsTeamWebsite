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
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.classList.remove(...THEMES.map((t) => `theme-${t.id}`));
  root.classList.add(`theme-${theme}`);
  root.classList.toggle("dark", theme !== "daylight");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const settings = useSiteSettings();
  const [navAlign] = useState<NavAlign>("left");
  const theme = settings.site_theme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, navAlign }), [theme, navAlign]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
