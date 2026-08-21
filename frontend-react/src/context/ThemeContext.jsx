// src/context/ThemeContext.jsx
// Bright + Dark only. Bright is the product default for every user.
// Stored "luxquant" (retired) migrates to Bright.

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const THEMES = ["bright", "dark"];
const DEFAULT_THEME = "bright";
const STORAGE_KEY = "lq-theme";

const THEME_COLOR = {
  bright: "#f5f6f8",
  dark: "#050506",
};

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};

function normalizeTheme(raw) {
  if (raw === "luxquant") return "bright";
  return THEMES.includes(raw) ? raw : null;
}

function readStored() {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => readStored() || DEFAULT_THEME);

  const selectableThemes = THEMES;
  const canSwitchTheme = true;
  const displayTheme = THEMES.includes(theme) ? theme : DEFAULT_THEME;

  useEffect(() => {
    document.documentElement.dataset.theme = displayTheme;
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", THEME_COLOR[displayTheme] || THEME_COLOR.bright);
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem(STORAGE_KEY, displayTheme);
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [displayTheme]);

  const setTheme = useCallback((next) => {
    const n = normalizeTheme(next);
    if (!n) return;
    setThemeState(n);
  }, []);

  const value = {
    theme: displayTheme,
    setTheme,
    themes: selectableThemes,
    allThemes: THEMES,
    canSwitchTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
