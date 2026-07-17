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

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { isAdminStaff } from '../utils/roles';

// THEMES = valid CSS themes; SELECTABLE = what a gated user may switch to.
// Bright is admin-preview only (GATE_TO_ADMINS) until product sign-off.
const THEMES = ['luxquant', 'dark', 'bright'];
const SELECTABLE_THEMES = ['luxquant', 'dark', 'bright'];
const DEFAULT_THEME = 'luxquant';
const STORAGE_KEY = 'lq-theme';

// While true, theme switching is limited to admin staff (admin/co_admin/founder).
// Set to false to open the feature to all users.
const GATE_TO_ADMINS = true;

const THEME_COLOR = {
  luxquant: '#0a0506',
  dark: '#050506',
  bright: '#f5f6f8',
};

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

function readStored() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return SELECTABLE_THEMES.includes(t) ? t : null;
  } catch {
    return null;
  }
}

export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const canSwitchTheme = GATE_TO_ADMINS ? isAdminStaff(user) : true;

  const [theme, setThemeState] = useState(() => readStored() || DEFAULT_THEME);

  // Effective theme respects the gate: non-eligible users always get the default.
  const effectiveTheme = canSwitchTheme ? theme : DEFAULT_THEME;

  // Apply to <html>; persist only for eligible users so members never carry a
  // stored non-default theme. Also sync theme-color meta for mobile chrome.
  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLOR[effectiveTheme] || THEME_COLOR.luxquant);
    } catch {
      /* ignore */
    }
    if (canSwitchTheme) {
      try {
        localStorage.setItem(STORAGE_KEY, effectiveTheme);
      } catch {
        /* ignore quota/private-mode errors */
      }
    }
  }, [effectiveTheme, canSwitchTheme]);

  const setTheme = useCallback(
    (next) => {
      if (!canSwitchTheme) return; // hard gate — members cannot switch
      if (!SELECTABLE_THEMES.includes(next)) return;
      setThemeState(next);
    },
    [canSwitchTheme]
  );

  const value = {
    theme: effectiveTheme,
    setTheme,
    themes: SELECTABLE_THEMES,
    allThemes: THEMES,
    canSwitchTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
