// src/context/ThemeContext.jsx
// In-app: Bright + Dark (Bright default).
// Landing, login, register: always the Luxquant gold desk — not a user pref.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";

const APP_THEMES = ["bright", "dark"];
const DEFAULT_APP_THEME = "bright";
const MARKETING_THEME = "luxquant";
const STORAGE_KEY = "lq-theme";

const THEME_COLOR = {
  luxquant: "#0a0506",
  dark: "#050506",
  bright: "#f5f6f8",
};

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};

function isMarketingRoute(pathname) {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  return p === "/" || p === "/login" || p === "/register";
}

function normalizeAppTheme(raw) {
  if (raw === "luxquant") return DEFAULT_APP_THEME;
  return APP_THEMES.includes(raw) ? raw : null;
}

function readStored() {
  try {
    return normalizeAppTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export const ThemeProvider = ({ children }) => {
  const location = useLocation();
  const marketing = isMarketingRoute(location.pathname);
  const [theme, setThemeState] = useState(() => readStored() || DEFAULT_APP_THEME);

  const displayTheme = marketing ? MARKETING_THEME : APP_THEMES.includes(theme) ? theme : DEFAULT_APP_THEME;
  const selectableThemes = marketing ? [MARKETING_THEME] : APP_THEMES;
  const canSwitchTheme = !marketing;

  useEffect(() => {
    document.documentElement.dataset.theme = displayTheme;
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", THEME_COLOR[displayTheme] || THEME_COLOR.luxquant);
    } catch {
      /* ignore */
    }
    // Persist the in-app choice only. Never write luxquant into storage —
    // that would fight Bright as the logged-in default.
    if (!marketing) {
      try {
        localStorage.setItem(STORAGE_KEY, displayTheme);
      } catch {
        /* ignore */
      }
    }
  }, [displayTheme, marketing]);

  const setTheme = useCallback(
    (next) => {
      if (marketing) return;
      const n = normalizeAppTheme(next);
      if (!n) return;
      setThemeState(n);
    },
    [marketing]
  );

  const value = {
    theme: displayTheme,
    setTheme,
    themes: selectableThemes,
    allThemes: APP_THEMES,
    canSwitchTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
