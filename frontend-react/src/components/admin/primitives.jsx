// src/components/admin/primitives.jsx
//
// LuxQuant Admin — Primitives
// ──────────────────────────────────────────────────────────────────────
// Reusable building blocks consumed by every admin tab. All components
// honor the tokens defined in `./designSystem.js`.
//
// Exports:
// Surface, Card, SectionHeader, TopHairline
// StatTile, IntentTile, ReachTile
// Badge, Tag, Pill, RoleBadge, StatusDot
// Button, IconButton, GhostButton
// Avatar, EmptyState, LoadingState, Skeleton
// Toast
//

import React from "react";
import {
  palette,
  surface,
  semantic,
  typography,
  radius,
  elevation,
  gradient,
  motion,
  tint,
  tilePreset,
  NEUTRAL,
} from "./designSystem";
import { AlertCircleIcon, CheckCircleIcon, AlertTriangleIcon, CloseIcon } from "./Icons";

// ════════════════════════════════════════════════════════════════════
// Surface — base container with bg + border + optional top hairline
// ════════════════════════════════════════════════════════════════════

/**
 * Universal container primitive.
 *
 * Props:
 * variant: 'base' | 'raised' | 'sunken' | 'glass' | 'premium' (default 'base')
 * • 'premium' → LandingPageV2 card: solid near-black panel, gold
 * top-hairline, and (with `hover`) a lift-on-hover treatment.
 * tone?: hex color — if provided, surface is tinted by this color
 * hover?: boolean — lift + gold border + shadow on hover (default true on 'premium')
 * hairline?: boolean — render top gradient line (default true on 'raised'/'glass'/'premium')
 * radiusToken?: 'md' | 'lg' | 'xl' — corner radius (default 'lg', or 'xl' on premium)
 * padding?: tailwind padding class (default 'p-4')
 * className, style, children, ...rest
 */
export const Surface = React.forwardRef(
  (
    {
      variant = "base",
      tone,
      hover,
      hairline,
      radiusToken,
      padding = "p-4",
      className = "",
      style = {},
      children,
      onMouseEnter,
      onMouseLeave,
      ...rest
    },
    ref
  ) => {
    const isPremium = variant === "premium";
    const preset = tone
      ? { bg: tint(tone, 0.025), border: tint(tone, 0.18), topGlow: tint(tone, 0.3) }
      : {
          bg: surface[variant].bg,
          border: surface[variant].border,
          topGlow: surface[variant].topGlow,
        };

    const showHairline =
      hairline !== undefined
        ? hairline
        : variant === "raised" || variant === "glass" || isPremium || !!tone;

    const doHover = hover !== undefined ? hover : isPremium;
    const cornerRadius = radius[radiusToken || (isPremium ? "xl" : "lg")];

    return (
      <div
        ref={ref}
        className={`relative overflow-hidden ${padding} ${className}`}
        style={{
          background: preset.bg,
          border: `1px solid ${preset.border}`,
          borderRadius: cornerRadius,
          transition: doHover ? motion.slow : undefined,
          boxShadow: variant === "base" ? "inset 0 1px 0 0 rgb(var(--ink) / 0.04)" : undefined,
          ...style,
        }}
        onMouseEnter={
          doHover
            ? (e) => {
                e.currentTarget.style.borderColor = surface.premium.borderHover;
                e.currentTarget.style.boxShadow = surface.premium.shadowHover;
                onMouseEnter?.(e);
              }
            : onMouseEnter
        }
        onMouseLeave={
          doHover
            ? (e) => {
                e.currentTarget.style.borderColor = preset.border;
                e.currentTarget.style.boxShadow =
                  variant === "base" ? "inset 0 1px 0 0 rgb(var(--ink) / 0.04)" : "none";
                onMouseLeave?.(e);
              }
            : onMouseLeave
        }
        {...rest}
      >
        {showHairline && (
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background: `linear-gradient(to right, transparent, ${preset.topGlow || "rgb(var(--ink) / 0.08)"}, transparent)`,
            }}
          />
        )}
        {children}
      </div>
    );
  }
);

Surface.displayName = "Surface";

// Alias — semantically the same as Surface but communicates intent
export const Card = Surface;

// ════════════════════════════════════════════════════════════════════
// TopHairline — standalone, for elements that need it without Surface
// ════════════════════════════════════════════════════════════════════

export const TopHairline = ({ color = "rgb(var(--ink) / 0.08)" }) => (
  <div
    className="absolute inset-x-0 top-0 h-px pointer-events-none"
    style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }}
  />
);

// ════════════════════════════════════════════════════════════════════
// GradientText — gold clip-text keyword (LandingPageV2 heading accent)
// ════════════════════════════════════════════════════════════════════

export const GradientText = ({ children, className = "", style = {} }) => (
  <span
    className={className}
    style={{
      background: gradient.goldText,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

// ════════════════════════════════════════════════════════════════════
// Eyebrow — mono uppercase kicker with a gold gradient rule
// (LandingPageV2 section signature). Renders a small line + label.
// ════════════════════════════════════════════════════════════════════

export const Eyebrow = ({ children, align = "left", className = "" }) => {
  const centered = align === "center";
  return (
    <span
      className={`inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted ${className}`}
    >
      <span className="h-px w-6 bg-gradient-to-r from-transparent to-ink/25" />
      {children}
      {centered && <span className="h-px w-6 bg-gradient-to-l from-transparent to-ink/25" />}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════════
// SectionHeader — title + optional subtitle + optional right slot
// ════════════════════════════════════════════════════════════════════

/**
 * Props (additions):
 * goldEyebrow?: boolean — render the eyebrow as the LandingPageV2 gold
 * mono kicker (with gradient rule) instead of the plain gray label.
 */
export const SectionHeader = ({
  eyebrow,
  goldEyebrow = false,
  title,
  subtitle,
  Icon,
  iconColor = NEUTRAL,
  right,
  size = "md", // 'sm' | 'md' | 'lg'
  className = "",
}) => {
  const titleSize =
    size === "lg"
      ? "font-display text-2xl font-semibold"
      : size === "md"
        ? "text-base font-semibold"
        : "text-sm font-semibold";

  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow &&
          (goldEyebrow ? (
            <div className="mb-2">
              <Eyebrow>{eyebrow}</Eyebrow>
            </div>
          ) : (
            <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              {eyebrow}
            </p>
          ))}
        <h2 className={`${titleSize} tracking-tight text-text-primary flex items-center gap-2`}>
          {Icon && <Icon size={size === "lg" ? 22 : 14} style={{ color: iconColor }} />}
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// StatTile — primary KPI card (Total Users, Subscribers, etc.)
// ════════════════════════════════════════════════════════════════════

/**
 * Props:
 * label, value, sub (optional secondary line)
 * accent: 'blue' | 'green' | 'gold' | 'purple' | 'orange' | 'red' | 'teal' | 'amber'
 * Icon, active, onClick (optional click-to-filter)
 * loading
 */
export const StatTile = ({
  label,
  value,
  sub,
  accent = "muted",
  Icon,
  active = false,
  onClick,
  loading = false,
  className = "",
}) => {
  const accentColor = semantic.accent[accent] || NEUTRAL;
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      disabled={!onClick}
      className={`group relative w-full overflow-hidden rounded-xl border bg-surface-raised p-3.5 text-left transition-colors ${
        onClick ? "cursor-pointer hover:border-ink/[0.12]" : ""
      } ${active ? "border-ink/20" : "border-ink/[0.07]"} ${className}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
          {label}
        </span>
        {Icon && <IconBadge Icon={Icon} color={accentColor} size={26} iconSize={13} soft />}
      </div>
      <p className="font-mono text-2xl font-semibold tabular-nums leading-none tracking-tight text-text-primary">
        {loading ? (
          <span className="lqsk inline-block h-6 w-12 rounded bg-ink/[0.08]" />
        ) : (
          (value ?? "—")
        )}
      </p>
      {sub && <p className="mt-1.5 text-[10px] text-text-muted/80">{sub}</p>}
    </Wrapper>
  );
};

// ════════════════════════════════════════════════════════════════════
// IconBadge — solid theme tile (Terminal scan language)
// SVG inherits currentColor; badge fills solid brand/theme color.
// ════════════════════════════════════════════════════════════════════

/**
 * @param {object} props
 * @param {React.ComponentType} props.Icon
 * @param {string} props.color — solid fill hex
 * @param {number} [props.size=36]
 * @param {number} [props.iconSize]
 * @param {'light'|'dark'|'auto'} [props.ink='auto'] — icon ink on filled bg
 */
export const IconBadge = ({
  Icon,
  color = NEUTRAL,
  size = 36,
  iconSize,
  ink = "auto",
  soft = false,
  className = "",
  style = {},
}) => {
  if (!Icon) return null;
  const glyph = iconSize || Math.round(size * 0.48);
  const r = Math.max(8, Math.round(size * 0.28));
  const isHex = typeof color === "string" && color.startsWith("#");

  // SOFT chip (default KPI/list look) — light tinted background + the colour
  // itself as the glyph. Reads on every desk; never dark-glyph-on-dark-fill.
  if (soft) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: r,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
          color,
          ...style,
        }}
        aria-hidden
      >
        <Icon size={glyph} style={{ color }} />
      </span>
    );
  }

  // SOLID fill (brand tiles) — pick a legible ink over the fill.
  const lightFill =
    /^(#f0b90b|#fcd535|#f7a600|#e0bc6a)$/i.test(color) ||
    (typeof color === "string" &&
      (color.includes("--accent") ||
        color.toLowerCase().includes("f0b9") ||
        color.toLowerCase().includes("d4a8") ||
        color.toLowerCase().includes("fcd5") ||
        color.toLowerCase().includes("f7a6")));
  const iconColor =
    ink === "dark"
      ? "rgb(var(--surface-raised))"
      : ink === "light"
        ? "rgb(var(--fg))"
        : lightFill
          ? "rgb(var(--surface-raised))"
          : "rgb(var(--surface-raised))";

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: color,
        color: iconColor,
        boxShadow: isHex
          ? `0 2px 10px ${color}55`
          : `0 2px 10px color-mix(in srgb, ${color} 33%, transparent)`,
        ...style,
      }}
      aria-hidden
    >
      <Icon size={glyph} style={{ color: iconColor }} />
    </span>
  );
};

// ════════════════════════════════════════════════════════════════════
// IntentTile — smaller tile, used in contextual rows (Reach, etc.)
// ════════════════════════════════════════════════════════════════════

export const IntentTile = ({
  Icon,
  label,
  value,
  color,
  active = false,
  onClick,
  className = "",
}) => {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      disabled={!onClick}
      className={`relative overflow-hidden text-left w-full ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        background: surface.premium.bg,
        border: `1px solid ${active ? tint(color, 0.5) : surface.premium.border}`,
        borderRadius: radius.md,
        padding: "10px 12px",
        transition: motion.base,
      }}
      onMouseEnter={
        onClick
          ? (e) => {
              if (!active) e.currentTarget.style.borderColor = tint(color, 0.3);
            }
          : undefined
      }
      onMouseLeave={
        onClick
          ? (e) => {
              if (!active) e.currentTarget.style.borderColor = surface.premium.border;
            }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <IconBadge Icon={Icon} color={color} size={22} iconSize={11} soft />}
        <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color }}>
          {label}
        </span>
      </div>
      <p
        className="text-xl font-bold tracking-tight tabular-nums leading-none"
        style={{ color: "rgb(var(--fg))" }}
      >
        {value ?? "—"}
      </p>
    </Wrapper>
  );
};

// ════════════════════════════════════════════════════════════════════
// Badge — small inline label (role, status, etc.)
// ════════════════════════════════════════════════════════════════════

/**
 * Props:
 * variant: 'role' | 'status' | 'custom'
 * value: when role/status, key into semantic table
 * tone: when custom, hex color
 * children: label text
 * size: 'xs' | 'sm' | 'md' (default 'sm')
 * Icon: optional leading icon
 */
export const Badge = ({
  variant = "custom",
  value,
  tone,
  children,
  size = "sm",
  Icon,
  className = "",
  style = {},
  ...rest
}) => {
  let palette_ = {
    color: "rgb(var(--fg))",
    bg: "rgb(var(--ink) / 0.06)",
    border: "rgb(var(--ink) / 0.1)",
  };

  if (variant === "role" && value && semantic.role[value]) palette_ = semantic.role[value];
  else if (variant === "status" && value && semantic.status[value])
    palette_ = semantic.status[value];
  else if (tone) palette_ = { color: tone, bg: tint(tone, 0.12), border: tint(tone, 0.3) };

  const sizeClasses = {
    xs: "text-[9px] px-1.5 py-0.5",
    sm: "text-[10px] px-2 py-0.5",
    md: "text-[11px] px-2.5 py-1",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-semibold tracking-wider uppercase whitespace-nowrap ${className}`}
      style={{
        background: palette_.bg,
        color: palette_.color,
        border: `1px solid ${palette_.border}`,
        borderRadius: radius.sm,
        ...style,
      }}
      {...rest}
    >
      {Icon && <Icon size={size === "xs" ? 9 : size === "sm" ? 10 : 12} />}
      {children}
    </span>
  );
};

// Convenience aliases
export const RoleBadge = ({ role, ...rest }) => (
  <Badge variant="role" value={role} {...rest}>
    {role}
  </Badge>
);

export const StatusBadge = ({ status, label, ...rest }) => (
  <Badge variant="status" value={status} {...rest}>
    {label || status}
  </Badge>
);

// Pill — fully rounded filter chip (neutral active = white desk language)
export const Pill = ({ children, active, tone, onClick, className = "" }) => {
  const t = tone || NEUTRAL;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${className} ${
        active
          ? "border border-ink/20 bg-ink/[0.1] text-text-primary"
          : "border border-ink/[0.08] bg-ink/[0.02] text-text-muted hover:border-ink/14 hover:text-text-primary"
      }`}
      style={
        tone && active
          ? { color: t, borderColor: tint(t, 0.4), background: tint(t, 0.12) }
          : undefined
      }
    >
      {children}
    </button>
  );
};

// ════════════════════════════════════════════════════════════════════
// StatusDot — pulse-able color dot
// ════════════════════════════════════════════════════════════════════

export const StatusDot = ({ color = palette.green[400], pulse = false, size = 8 }) => (
  <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
    {pulse && (
      <span
        className="absolute inline-flex rounded-full opacity-60 animate-ping"
        style={{
          width: size,
          height: size,
          background: color,
        }}
      />
    )}
    <span
      className="relative inline-flex rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 0 2px ${tint(color, 0.2)}`,
      }}
    />
  </span>
);

// ════════════════════════════════════════════════════════════════════
// Button — primary call-to-action
// ════════════════════════════════════════════════════════════════════

/**
 * Props:
 * variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
 * size: 'sm' | 'md' | 'lg' (default 'md')
 * Icon, iconPosition: 'left' | 'right' (default 'left')
 * loading, disabled
 * children, ...rest
 */
export const Button = React.forwardRef(
  (
    {
      variant = "primary",
      size = "md",
      Icon,
      iconPosition = "left",
      loading = false,
      disabled = false,
      children,
      className = "",
      style = {},
      ...rest
    },
    ref
  ) => {
    const sizeMap = {
      sm: { px: "px-3", py: "py-1.5", text: "text-[10px]", icon: 12 },
      md: { px: "px-4", py: "py-2", text: "text-[11px]", icon: 13 },
      lg: { px: "px-5", py: "py-2.5", text: "text-xs", icon: 14 },
    };
    const s = sizeMap[size];

    // Timeless desk CTAs — primary is solid light fill (theme-safe)
    const variants = {
      primary: {
        background: "rgb(var(--fg) / 0.92)",
        color: "rgb(var(--surface))",
        border: "1px solid rgb(var(--ink) / 0.2)",
      },
      secondary: {
        background: "rgb(var(--ink) / 0.04)",
        color: "rgb(var(--ink) / 0.82)",
        border: "1px solid rgb(var(--ink) / 0.12)",
      },
      ghost: {
        background: "transparent",
        color: typography.body.muted,
        border: "1px solid rgb(var(--ink) / 0.10)",
      },
      danger: {
        background: "rgb(var(--neg) / 0.12)",
        color: "rgb(var(--neg-text))",
        border: "1px solid rgb(var(--neg) / 0.35)",
      },
      success: {
        background: "rgb(var(--pos) / 0.12)",
        color: "rgb(var(--pos-text))",
        border: "1px solid rgb(var(--pos) / 0.3)",
      },
      warn: {
        background: "rgb(var(--accent) / 0.12)",
        color: "rgb(var(--accent-text))",
        border: "1px solid rgb(var(--accent) / 0.3)",
      },
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold uppercase tracking-wider transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90 active:scale-[0.99] ${s.px} ${s.py} ${s.text} ${className}`}
        style={{
          ...variants[variant],
          ...style,
        }}
        {...rest}
      >
        {loading ? (
          <Spinner size={s.icon} />
        ) : (
          <>
            {Icon && iconPosition === "left" && <Icon size={s.icon} />}
            {children}
            {Icon && iconPosition === "right" && <Icon size={s.icon} />}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

// ════════════════════════════════════════════════════════════════════
// IconButton — square button, icon only
// ════════════════════════════════════════════════════════════════════

export const IconButton = ({
  Icon,
  tone = NEUTRAL,
  size = "md",
  title,
  onClick,
  disabled = false,
  className = "",
  ...rest
}) => {
  const sizeMap = {
    xs: { box: "w-6 h-6", icon: 11 },
    sm: { box: "w-7 h-7", icon: 12 },
    md: { box: "w-8 h-8", icon: 14 },
    lg: { box: "w-9 h-9", icon: 16 },
  };
  const s = sizeMap[size];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center rounded-md transition-all disabled:opacity-40 ${s.box} ${className}`}
      style={{
        background: tint(tone, 0.08),
        color: tone,
        border: `1px solid ${tint(tone, 0.2)}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = tint(tone, 0.15);
          e.currentTarget.style.borderColor = tint(tone, 0.35);
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = tint(tone, 0.08);
          e.currentTarget.style.borderColor = tint(tone, 0.2);
        }
      }}
      {...rest}
    >
      <Icon size={s.icon} />
    </button>
  );
};

// ════════════════════════════════════════════════════════════════════
// Avatar — initials circle or image
// ════════════════════════════════════════════════════════════════════

/**
 * Props:
 * src?: image url
 * name: used for initial fallback
 * tone?: hex for fallback bg/color (default gold)
 * size: 'xs' | 'sm' | 'md' | 'lg' (default 'sm')
 * status?: { color, pulse } — optional dot in corner
 */
export const Avatar = ({
  src,
  name = "",
  tone = palette.gold[300],
  size = "sm",
  status,
  className = "",
}) => {
  const sizeMap = {
    xs: { px: "w-5 h-5", text: "text-[9px]", dot: 6 },
    sm: { px: "w-7 h-7", text: "text-[10px]", dot: 7 },
    md: { px: "w-9 h-9", text: "text-xs", dot: 9 },
    lg: { px: "w-12 h-12", text: "text-sm", dot: 10 },
  };
  const s = sizeMap[size];
  const initial = (name || "?").charAt(0).toUpperCase();

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div
        className={`${s.px} ${s.text} rounded-full flex items-center justify-center font-bold overflow-hidden`}
        style={{
          background: src ? "transparent" : tint(tone, 0.15),
          color: tone,
          border: `1px solid ${tint(tone, 0.2)}`,
        }}
      >
        {src ? (
          <img src={src} alt={name} className={`${s.px} rounded-full object-cover`} />
        ) : (
          initial
        )}
      </div>
      {status && (
        <span className="absolute -bottom-0.5 -right-0.5">
          <StatusDot color={status.color} pulse={status.pulse} size={s.dot} />
        </span>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// EmptyState — illustrated empty state (replaces generic "No X yet")
// ════════════════════════════════════════════════════════════════════

/**
 * Props:
 * Icon, title, description
 * action?: { label, onClick, Icon }
 * tone?: hex (default gold)
 * className
 */
export const EmptyState = ({
  Icon,
  title,
  description,
  action,
  tone = NEUTRAL,
  className = "",
}) => (
  <div className={`flex flex-col items-center justify-center px-4 py-12 text-center ${className}`}>
    {Icon && (
      <div className="relative mb-5">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-ink/[0.1] bg-ink/[0.04]">
          <Icon size={28} style={{ color: tone, opacity: 0.75 }} />
        </div>
      </div>
    )}
    <h3 className="mb-1 text-base font-semibold tracking-tight text-text-primary">{title}</h3>
    {description && <p className="max-w-sm text-xs text-text-muted">{description}</p>}
    {action && (
      <button
        type="button"
        onClick={action.onClick}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-ink/[0.1] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-primary transition hover:bg-ink/[0.14]"
      >
        {action.Icon && <action.Icon size={13} />}
        {action.label}
      </button>
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Loading states
// ════════════════════════════════════════════════════════════════════

export const Spinner = ({ size = 14, tone = NEUTRAL, className = "" }) => (
  <span
    className={`inline-block animate-spin rounded-full ${className}`}
    style={{
      width: size,
      height: size,
      border: `2px solid ${tint(tone, 0.2)}`,
      borderTopColor: tone,
    }}
  />
);

export const LoadingState = ({ label = "Loading...", tone = NEUTRAL, className = "" }) => (
  <div className={`inline-flex items-center gap-2 text-xs text-text-muted ${className}`}>
    <Spinner size={13} tone={tone} />
    {label}
  </div>
);

export const Skeleton = ({ className = "", tone = "rgb(var(--ink) / 0.05)", style = {} }) => (
  <div className={`lqsk rounded ${className}`} style={{ background: tone, ...style }} />
);

// ════════════════════════════════════════════════════════════════════
// Toast — top-right notification
// ════════════════════════════════════════════════════════════════════

export const Toast = ({ message, type = "success", onClose }) => {
  const config = {
    success: { tone: palette.green[400], Icon: CheckCircleIcon },
    error: { tone: palette.red[400], Icon: AlertCircleIcon },
    warning: { tone: palette.amber[400], Icon: AlertTriangleIcon },
    info: { tone: palette.blue[400], Icon: AlertCircleIcon },
  };
  const { tone, Icon } = config[type] || config.success;

  return (
    <div
      className="fixed top-4 right-4 z-[100000] flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs font-medium shadow-2xl max-w-sm"
      style={{
        background: palette.maroon[800],
        color: tone,
        border: `1px solid ${tint(tone, 0.3)}`,
        boxShadow: elevation.modal,
      }}
    >
      <Icon size={15} className="shrink-0 mt-px" />
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 opacity-60 hover:opacity-100"
          style={{ color: tone }}
        >
          <CloseIcon size={12} />
        </button>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// SearchInput — standardized search field
// ════════════════════════════════════════════════════════════════════

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search...",
  Icon,
  rightSlot,
  className = "",
  ...rest
}) => (
  <div className={`relative ${className}`}>
    {Icon && (
      <Icon
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: typography.body.faint }}
      />
    )}
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full ${Icon ? "pl-9" : "pl-3"} ${rightSlot ? "pr-20" : "pr-3"} py-2 text-xs text-text-primary focus:outline-none transition-colors`}
      style={{
        background: surface.base.bg,
        border: `1px solid ${surface.base.border}`,
        borderRadius: radius.md,
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = tint(palette.gold[300], 0.35))}
      onBlur={(e) => (e.currentTarget.style.borderColor = surface.base.border)}
      {...rest}
    />
    {rightSlot && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Select — standardized dropdown
// ════════════════════════════════════════════════════════════════════

export const Select = ({ label, value, onChange, options, className = "", ...rest }) => (
  <div className={className}>
    {label && (
      <label
        className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
        style={{ color: "rgb(var(--ink) / 0.4)" }}
      >
        {label}
      </label>
    )}
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-3 py-2 text-xs text-text-primary focus:outline-none cursor-pointer transition-colors appearance-none"
      style={{
        background: surface.sunken.bg,
        border: `1px solid ${value ? surface.sunken.borderActive : surface.sunken.border}`,
        borderRadius: radius.md,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a7a6e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        paddingRight: "32px",
      }}
      {...rest}
    >
      {options.map((opt) => (
        <option
          key={opt.value || "__all"}
          value={opt.value || ""}
          style={{ background: palette.maroon[800] }}
        >
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Divider — horizontal rule
// ════════════════════════════════════════════════════════════════════

export const Divider = ({ className = "", label }) => {
  if (label) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex-1 h-px" style={{ background: surface.base.border }} />
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: typography.body.muted }}
        >
          {label}
        </span>
        <div className="flex-1 h-px" style={{ background: surface.base.border }} />
      </div>
    );
  }
  return <div className={`h-px ${className}`} style={{ background: surface.base.border }} />;
};

// ════════════════════════════════════════════════════════════════════
// Bar3D — glossy cylinder-shaded progress meter (LandingPageV2 signature)
// ════════════════════════════════════════════════════════════════════

/**
 * Inset track + top-sheen gold fill with a soft glow. Use for KPI bars,
 * budget spend, pattern EV, etc.
 *
 * Props:
 * pct: 0–100
 * tone?: hex — recolors the fill (default brand gold). Non-gold tones fall
 * back to a flat tinted fill (the glossy gradient is gold-specific).
 * heightClass?: tailwind height (default 'h-2.5')
 * className
 */
export const Bar3D = ({ pct = 0, tone, heightClass = "h-2.5", className = "" }) => {
  const width = `${Math.min(Math.max(pct, 0), 100)}%`;
  const isGold = !tone || tone === palette.gold[300];
  return (
    <div
      className={`relative flex-1 overflow-hidden ${heightClass} ${className}`}
      style={{
        background: "rgb(var(--scrim) / 0.35)",
        borderRadius: radius.pill,
        boxShadow: "inset 0 1px 2px rgb(var(--scrim) / 0.35)",
      }}
    >
      <div
        className="h-full"
        style={{
          width,
          borderRadius: radius.pill,
          background: isGold
            ? gradient.goldBar
            : `linear-gradient(180deg, ${tint(tone, 0.95)}, ${tint(tone, 0.6)})`,
          boxShadow: isGold
            ? "inset 0 1px 0 rgb(var(--ink) / 0.55), inset 0 -2px 3px rgba(90,60,15,0.4), 0 0 8px rgb(var(--accent) / 0.4)"
            : `inset 0 1px 0 rgb(var(--ink) / 0.4), 0 0 8px ${tint(tone, 0.4)}`,
        }}
      />
    </div>
  );
};
