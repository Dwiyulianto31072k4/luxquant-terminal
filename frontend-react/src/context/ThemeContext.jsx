// src/context/ThemeContext.jsx
//
// Theme system. Drives the `data-theme` attribute on <html>, which flips
// the semantic colour tokens defined in styles/index.css.
//
// GATED ROLLOUT: while the feature is in testing, only admin staff can switch
// themes. Regular members (free / subscriber / premium) are hard-locked to the
// default Luxquant look and never see the toggle — their localStorage is never
// read or written. To launch to everyone later, flip GATE_TO_ADMINS to false
// (single switch) — nothing else needs to change.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isAdminStaff } from "../utils/roles";

const THEMES = ["luxquant", "dark", "bright"];
// Luxquant + Dark are PUBLIC — anyone (even logged-out) can switch between them.
const PUBLIC_THEMES = ["luxquant", "dark"];
// Marketing/auth surfaces (landing, login, register) only support the two dark
// desks — Bright is in-app only. A stored Bright pref is kept but rendered as
// Dark there so the marketing look stays consistent.
const isMarketingRoute = (pathname) => /^\/(?:$|login|register)/.test(pathname || "/");
const DEFAULT_THEME = "luxquant";
const STORAGE_KEY = "lq-theme";

// Bright stays limited to admin staff (in-app) until product sign-off. Set false
// to offer Bright to everyone in-app.
const BRIGHT_ADMIN_ONLY = true;

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

function readStored() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(t) ? t : null;
  } catch {
    return null;
  }
}

export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = isAdminStaff(user);
  const marketing = isMarketingRoute(location.pathname);

  const [theme, setThemeState] = useState(() => readStored() || DEFAULT_THEME);

  // Bright is admin-only and in-app-only. Luxquant + Dark are public everywhere
  // they're offered (marketing routes stay two-desk only).
  const brightAllowed = (BRIGHT_ADMIN_ONLY ? isAdmin : true) && !marketing;
  const selectableThemes = brightAllowed ? THEMES : PUBLIC_THEMES;
  // Anyone can switch the public themes; the picker always renders.
  const canSwitchTheme = true;

  // A stored Bright pref is preserved but rendered as Dark wherever Bright isn't
  // allowed (marketing routes, or non-admins).
  const displayTheme = theme === "bright" && !brightAllowed ? "dark" : theme;

  // Apply displayTheme to <html>; persist the user's REAL pref so an admin's
  // in-app Bright choice survives visiting the landing. Sync theme-color meta.
  useEffect(() => {
    document.documentElement.dataset.theme = displayTheme;
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", THEME_COLOR[displayTheme] || THEME_COLOR.luxquant);
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [displayTheme, theme]);

  const setTheme = useCallback(
    (next) => {
      if (!selectableThemes.includes(next)) return; // can't pick what isn't offered here
      setThemeState(next);
    },
    [selectableThemes]
  );

  const value = {
    theme: displayTheme,
    setTheme,
    themes: selectableThemes,
    allThemes: THEMES,
    canSwitchTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
