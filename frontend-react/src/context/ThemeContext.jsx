// src/context/ThemeContext.jsx
//
// Two separate appearance worlds, each with its own stored preference:
//
//   marketing (/, /login, /register) : Luxquant gold desk (default) or Dark
//   in-app (everything else)         : Bright (default) or Dark
//
// They are kept in DIFFERENT storage keys on purpose. Sharing one key meant a
// visitor picking Dark on the landing page silently dragged the logged-in app
// out of Bright, and the fix for that was to remove the landing choice
// altogether — which is what took Dark off the marketing pages.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";

const APP_THEMES = ["bright", "dark"];
const DEFAULT_APP_THEME = "bright";
const MARKETING_THEMES = ["luxquant", "dark"];
const DEFAULT_MARKETING_THEME = "luxquant";

const APP_STORAGE_KEY = "lq-theme";
const MARKETING_STORAGE_KEY = "lq-theme-marketing";

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

function normalize(raw, allowed) {
  return allowed.includes(raw) ? raw : null;
}

function readStored(key, allowed) {
  try {
    return normalize(localStorage.getItem(key), allowed);
  } catch {
    return null;
  }
}

export const ThemeProvider = ({ children }) => {
  const location = useLocation();
  const marketing = isMarketingRoute(location.pathname);

  const [appTheme, setAppTheme] = useState(
    () => readStored(APP_STORAGE_KEY, APP_THEMES) || DEFAULT_APP_THEME
  );
  const [marketingTheme, setMarketingTheme] = useState(
    () => readStored(MARKETING_STORAGE_KEY, MARKETING_THEMES) || DEFAULT_MARKETING_THEME
  );

  const displayTheme = marketing ? marketingTheme : appTheme;
  const selectableThemes = marketing ? MARKETING_THEMES : APP_THEMES;

  useEffect(() => {
    document.documentElement.dataset.theme = displayTheme;
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", THEME_COLOR[displayTheme] || THEME_COLOR.luxquant);
    } catch {
      /* ignore */
    }
    // Persist into the bucket the current route belongs to, never the other one.
    try {
      localStorage.setItem(
        marketing ? MARKETING_STORAGE_KEY : APP_STORAGE_KEY,
        displayTheme
      );
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [displayTheme, marketing]);

  const setTheme = useCallback(
    (next) => {
      if (marketing) {
        const n = normalize(next, MARKETING_THEMES);
        if (n) setMarketingTheme(n);
        return;
      }
      const n = normalize(next, APP_THEMES);
      if (n) setAppTheme(n);
    },
    [marketing]
  );

  const value = {
    theme: displayTheme,
    setTheme,
    themes: selectableThemes,
    allThemes: selectableThemes,
    canSwitchTheme: true,
    isMarketingSurface: marketing,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
