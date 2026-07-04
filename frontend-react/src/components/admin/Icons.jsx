// src/components/admin/Icons.jsx
//
// LuxQuant Admin — Centralized SVG icon library (duotone / solid).
//
// Design language: every glyph has a solid "body" (a filled shape at low
// opacity) with a crisp full-opacity detail on top — the Phosphor/duotone
// look. This reads far more substantial than thin single-stroke icons and
// stays cohesive across the whole admin workspace. Directional glyphs
// (arrows, chevrons) stay stroked but heavier + rounded.
//
// Convention:
//   • Default size = 14. Pass `size={N}` to override.
//   • Colour comes from `currentColor`, so icons inherit the parent colour.
//   • All icons accept className, style, and forwarded props.
//   • Brand icons expose a `colored` prop for official brand colours.
//

import React from 'react';

// ════════════════════════════════════════════════════════════════════
// Base SVG wrapper
// ════════════════════════════════════════════════════════════════════

const Svg = ({ size = 14, className = '', children, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {children}
  </svg>
);

// Shared duotone opacity for the filled "body" layer.
const BODY = 0.18;

// ════════════════════════════════════════════════════════════════════
// Brand icons (official marks — already solid)
// ════════════════════════════════════════════════════════════════════

export const TelegramIcon = ({ size = 16, colored = false, className = '', ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    {colored && <circle cx="12" cy="12" r="12" fill="#229ED9" />}
    <path
      d="M17.5 7.5L15.5 17c-.15.66-.55.82-1.12.51l-3.1-2.28-1.5 1.44c-.16.16-.3.3-.62.3l.22-3.13 5.7-5.15c.25-.22-.05-.34-.39-.12l-7.05 4.44-3.04-.95c-.66-.21-.67-.66.14-.97l11.88-4.58c.55-.2 1.03.13.85.99z"
      fill={colored ? '#FFFFFF' : 'currentColor'}
    />
  </svg>
);

export const DiscordIcon = ({ size = 16, colored = false, className = '', ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
      fill={colored ? '#5865F2' : 'currentColor'}
    />
  </svg>
);

export const GoogleIcon = ({ size = 16, colored = true, className = '', ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} xmlns="http://www.w3.org/2000/svg" {...props}>
    {colored ? (
      <>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </>
    ) : (
      <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" />
    )}
  </svg>
);

// ════════════════════════════════════════════════════════════════════
// Communication
// ════════════════════════════════════════════════════════════════════

export const EmailIcon = ({ size = 16, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity={BODY} />
    <path d="M3.5 7.5l7.4 4.9a2 2 0 0 0 2.2 0l7.4-4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
  </Svg>
);

export const SendIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M21.4 3.6a1 1 0 0 0-1.05-.23L3.9 9.2c-.94.34-.9 1.7.06 1.98l6.14 1.77 1.77 6.14c.28.96 1.64 1 1.98.06l5.83-16.45a1 1 0 0 0-.28-1.1z" fill="currentColor" opacity={BODY} />
    <path d="M21.4 3.6L10.6 12.7M21.4 3.6L15.6 20a.7.7 0 0 1-1.32.05l-2.02-6.02-6.02-2.02A.7.7 0 0 1 6.3 8.4L21.4 3.6z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BroadcastIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M20.49 4.93a10 10 0 0 1 0 14.14M3.51 19.07a10 10 0 0 1 0-14.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
  </Svg>
);

export const MessageCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 3a9 9 0 0 0-8 13.1L3 21l4.9-1a9 9 0 1 0 4.1-17z" fill="currentColor" opacity={BODY} />
    <path d="M12 3a9 9 0 0 0-8 13.1L3 21l4.9-1A9 9 0 1 0 12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8.5 11h7M8.5 14h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const BellIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" fill="currentColor" opacity={BODY} />
    <path d="M18 9A6 6 0 0 0 6 9c0 5-2 6.5-2 6.5h16S18 14 18 9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M10.3 19a2 2 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Navigation (directional — heavier rounded strokes)
// ════════════════════════════════════════════════════════════════════

export const ExternalLinkIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M13 4h7v7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 4l-9 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronDownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
export const ChevronRightIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
export const ChevronLeftIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
export const ArrowRightIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
export const ArrowUpIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
export const ArrowDownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);

// ════════════════════════════════════════════════════════════════════
// Actions
// ════════════════════════════════════════════════════════════════════

export const PlusIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></Svg>
);
export const MinusIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></Svg>
);
export const CloseIcon = ({ size = 16, ...props }) => (
  <Svg size={size} {...props}><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></Svg>
);
export const CheckIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);

export const CopyIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="8" y="8" width="13" height="13" rx="2.5" fill="currentColor" opacity={BODY} />
    <rect x="8" y="8" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
    <path d="M5 15.5H4.5A1.5 1.5 0 0 1 3 14V4.5A1.5 1.5 0 0 1 4.5 3H14a1.5 1.5 0 0 1 1.5 1.5V5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

export const DownloadIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 3v12M7.5 10.5L12 15l4.5-4.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const UploadIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const EditIcon = ({ size = 12, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M4 15.5L14.5 5l4.5 4.5L8.5 20 3 21.5z" fill="currentColor" opacity={BODY} />
    <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M17.5 2.6a2 2 0 0 1 2.9 2.9L11 15l-4 1 1-4 9.5-9.4z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrashIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M6 7h12l-1 13a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 20L6 7z" fill="currentColor" opacity={BODY} />
    <path d="M4 6h16M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6m2 0l-1 14a2 2 0 0 1-2 1.9H8A2 2 0 0 1 6 20L5 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </Svg>
);

export const RefreshIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M21 4v6h-6M3 20v-6h6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19.4 9A8 8 0 0 0 5.6 6.2L3 10m18 4l-2.6 3.8A8 8 0 0 1 4.6 15" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MoreVerticalIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="5" r="1.8" fill="currentColor" />
    <circle cx="12" cy="19" r="1.8" fill="currentColor" />
  </Svg>
);
export const MoreHorizontalIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Search & filter
// ════════════════════════════════════════════════════════════════════

export const SearchIcon = ({ size = 16, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="11" cy="11" r="7" fill="currentColor" opacity={BODY} />
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
  </Svg>
);

export const FilterIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 5.5h18l-7 8v5l-4 2v-7L3 5.5z" fill="currentColor" opacity={BODY} />
    <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SortAscIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M4 6h11M4 12h8M4 18h5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M18 8V4m0 0l-3 3m3-3l3 3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const SortDescIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M4 6h5M4 12h8M4 18h11" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M18 16v4m0 0l-3-3m3 3l3-3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Status & feedback
// ════════════════════════════════════════════════════════════════════

export const EyeIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7S19 19 12 19 1.5 12 1.5 12z" fill="currentColor" opacity={BODY} />
    <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7S19 19 12 19 1.5 12 1.5 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </Svg>
);

export const EyeOffIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 2l20 20" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </Svg>
);

export const BanIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
    <path d="M5.6 5.6l12.8 12.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const CheckCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const XCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
    <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const AlertTriangleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" fill="currentColor" opacity={BODY} />
    <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 9v4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1.1" fill="currentColor" />
  </Svg>
);

export const AlertCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
    <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
  </Svg>
);

export const InfoIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
    <path d="M12 16.5V11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="7.6" r="1.1" fill="currentColor" />
  </Svg>
);

export const LoaderIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// People (solid silhouettes)
// ════════════════════════════════════════════════════════════════════

export const UserIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="8" r="4" fill="currentColor" />
    <path d="M4 20c0-3.6 3.6-6.2 8-6.2s8 2.6 8 6.2v1H4v-1z" fill="currentColor" />
  </Svg>
);

export const UsersIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="17" cy="8.5" r="3" fill="currentColor" opacity="0.55" />
    <path d="M14 14c.9-.4 1.9-.6 3-.6 3.2 0 5.5 2 5.5 4.6v1.2H15" fill="currentColor" opacity="0.55" />
    <circle cx="9" cy="8" r="3.8" fill="currentColor" />
    <path d="M2 19.6c0-3.3 3.1-5.6 7-5.6s7 2.3 7 5.6v1.2H2v-1.2z" fill="currentColor" />
  </Svg>
);

export const UserPlusIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="9" cy="8" r="3.8" fill="currentColor" />
    <path d="M2 19.6c0-3.3 3.1-5.6 7-5.6s7 2.3 7 5.6v1.2H2v-1.2z" fill="currentColor" />
    <path d="M19 8v6M22 11h-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const ShieldIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2.5l8 3v6.5c0 5.5-8 9.5-8 9.5s-8-4-8-9.5V5.5l8-3z" fill="currentColor" opacity={BODY} />
    <path d="M12 2.5l8 3v6.5c0 5.5-8 9.5-8 9.5s-8-4-8-9.5V5.5l8-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </Svg>
);

export const ShieldCheckIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2.5l8 3v6.5c0 5.5-8 9.5-8 9.5s-8-4-8-9.5V5.5l8-3z" fill="currentColor" opacity={BODY} />
    <path d="M12 2.5l8 3v6.5c0 5.5-8 9.5-8 9.5s-8-4-8-9.5V5.5l8-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8.7 11.8l2.2 2.2 4.4-4.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Time
// ════════════════════════════════════════════════════════════════════

export const ClockIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
    <path d="M12 7v5.3l3.4 2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CalendarIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="3" fill="currentColor" opacity={BODY} />
    <rect x="3" y="4.5" width="18" height="16.5" rx="3" stroke="currentColor" strokeWidth="1.9" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

export const HistoryIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3.5 15A9 9 0 1 0 5.6 5.6L2 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 4v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7.5V12l3 3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Data / Charts
// ════════════════════════════════════════════════════════════════════

export const TrendingUpIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 18l6-6 4 4 8-8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 8h5v5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrendingDownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 6l6 6 4-4 8 8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 16h5v-5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BarChartIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="4" y="12" width="4" height="8" rx="1.4" fill="currentColor" opacity="0.55" />
    <rect x="10" y="8" width="4" height="12" rx="1.4" fill="currentColor" />
    <rect x="16" y="4" width="4" height="16" rx="1.4" fill="currentColor" opacity="0.8" />
  </Svg>
);

export const PieChartIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 3a9 9 0 1 0 9 9h-9V3z" fill="currentColor" opacity={BODY} />
    <path d="M21 12A9 9 0 1 0 12 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 3a9 9 0 0 1 9 9h-9V3z" fill="currentColor" />
  </Svg>
);

export const ActivityIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 12h3.5l2.5 7 4-16 2.5 9H21" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Decorative (solid)
// ════════════════════════════════════════════════════════════════════

export const StarIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.4l-5.8 3.05 1.1-6.45L2.6 9.35l6.5-.95L12 2.5z" fill="currentColor" opacity={BODY} />
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.4l-5.8 3.05 1.1-6.45L2.6 9.35l6.5-.95L12 2.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </Svg>
);

export const StarFilledIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.4l-5.8 3.05 1.1-6.45L2.6 9.35l6.5-.95L12 2.5z" fill="currentColor" />
  </Svg>
);

export const SparklesIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" fill="currentColor" />
    <path d="M19 3l.7 1.9L21.5 5.6l-1.8.7L19 8l-.7-1.7L16.5 5.6l1.8-.7L19 3zM5 15l.7 1.9L7.5 17.6l-1.8.7L5 20l-.7-1.7L2.5 17.6l1.8-.7L5 15z" fill="currentColor" opacity="0.6" />
  </Svg>
);

export const ZapIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M13 2L3 14h8l-1 8 11-13h-8l0-7z" fill="currentColor" opacity={BODY} />
    <path d="M13 2L3 14h8l-1 8 11-13h-8l0-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </Svg>
);

export const FlameIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2.5c.5 2.5 2 4.5 3.7 6.2C17.4 10.4 19 12.4 19 15a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6z" fill="currentColor" opacity={BODY} />
    <path d="M12 2.5c.5 2.5 2 4.5 3.7 6.2C17.4 10.4 19 12.4 19 15a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </Svg>
);

export const GiftIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="11" width="18" height="10" rx="2" fill="currentColor" opacity={BODY} />
    <path d="M20 12v9H4v-9M2 7.5h20V12H2zM12 21V7.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7.5H7.7a2.2 2.2 0 1 1 0-4.5C10.7 3 12 7.5 12 7.5zM12 7.5h4.3a2.2 2.2 0 1 0 0-4.5C13.3 3 12 7.5 12 7.5z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CrownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M2.5 7l4 5 3.5-6.5L13.5 12l4-5v11a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2V7z" fill="currentColor" opacity={BODY} />
    <path d="M2.5 7l4 4.5L12 4l5.5 7.5L21.5 7v10.5a1.8 1.8 0 0 1-1.8 1.8H4.3a1.8 1.8 0 0 1-1.8-1.8V7z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="2.5" cy="7" r="1.3" fill="currentColor" />
    <circle cx="21.5" cy="7" r="1.3" fill="currentColor" />
    <circle cx="12" cy="4" r="1.3" fill="currentColor" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Money / Finance
// ════════════════════════════════════════════════════════════════════

export const DollarIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M15 8.5H10.7a2.2 2.2 0 0 0 0 4.4h2.6a2.2 2.2 0 0 1 0 4.4H9M12 6.5v11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CreditCardIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="2" y="5" width="20" height="14" rx="3" fill="currentColor" opacity={BODY} />
    <rect x="2" y="5" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" />
    <path d="M2 9.5h20" stroke="currentColor" strokeWidth="2.2" />
    <path d="M6 15h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

export const WalletIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="6" width="18" height="14" rx="3" fill="currentColor" opacity={BODY} />
    <path d="M3 8a2 2 0 0 1 2-2h13v3M3 8v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M21 12v3h-4a1.5 1.5 0 0 1 0-3h4z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ReceiptIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M5 3l2 1.5L9 3l2 1.5L13 3l2 1.5L17 3v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V3z" fill="currentColor" opacity={BODY} />
    <path d="M5 3l2 1.5L9 3l2 1.5L13 3l2 1.5L17 3v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 8h6M8 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Tasks / Tags
// ════════════════════════════════════════════════════════════════════

export const TagIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 3h8.5L21 12.5a1.8 1.8 0 0 1 0 2.5l-6 6a1.8 1.8 0 0 1-2.5 0L3 11.5V3z" fill="currentColor" opacity={BODY} />
    <path d="M3 3h8.5L21 12.5a1.8 1.8 0 0 1 0 2.5l-6 6a1.8 1.8 0 0 1-2.5 0L3 11.5V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" />
  </Svg>
);

export const ListIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <circle cx="3.5" cy="6" r="1.5" fill="currentColor" />
    <circle cx="3.5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="3.5" cy="18" r="1.5" fill="currentColor" />
  </Svg>
);

export const GridIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" fill="currentColor" opacity={BODY} />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" fill="currentColor" opacity={BODY} />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" fill="currentColor" opacity={BODY} />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" fill="currentColor" opacity={BODY} />
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
  </Svg>
);

export const KanbanIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="3" width="6" height="16" rx="1.8" fill="currentColor" opacity={BODY} />
    <rect x="11" y="3" width="6" height="11" rx="1.8" fill="currentColor" opacity={BODY} />
    <rect x="3" y="3" width="6" height="16" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
    <rect x="11" y="3" width="6" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
    <rect x="19" y="3" width="2" height="6" rx="1" fill="currentColor" opacity="0.5" />
  </Svg>
);

export const FlagIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M5 4s1-1 4-1 5 2 8 2 4-1 4-1v9s-1 1-4 1-5-2-8-2-4 1-4 1V4z" fill="currentColor" opacity={BODY} />
    <path d="M5 21V3s1-1 4-1 5 2 8 2 4-1 4-1v9s-1 1-4 1-5-2-8-2-4 1-4 1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TargetIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Mappers
// ════════════════════════════════════════════════════════════════════

export const ProviderIcon = ({ provider, size = 14, className = '' }) => {
  switch (provider) {
    case 'google':   return <GoogleIcon size={size} className={className} colored />;
    case 'telegram': return <TelegramIcon size={size} className={className} colored />;
    case 'discord':  return <DiscordIcon size={size} className={className} style={{ color: '#5865F2' }} />;
    case 'local':    return <EmailIcon size={size} className={className} style={{ color: '#8a7a6e' }} />;
    default:         return null;
  }
};

export const ChannelIcon = ({ channel, size = 14, colored = false, className = '' }) => {
  switch (channel) {
    case 'telegram': return <TelegramIcon size={size} colored={colored} className={className} />;
    case 'discord':  return <DiscordIcon size={size} colored={colored} className={className} />;
    case 'email':    return <EmailIcon size={size} className={className} />;
    default:         return null;
  }
};

// ════════════════════════════════════════════════════════════════════
// LuxQuant Shell Icons — tab glyphs (duotone solid)
// ════════════════════════════════════════════════════════════════════

/** LambdaGlyph — capital lambda Λ brand monogram. */
export const LambdaGlyph = ({ size = 18, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M5 21L11.2 5.5Q12 3.8 12.8 5.5L19 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.5 17.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
  </Svg>
);

/** UsersRingIcon — solid person inside a filled disc (Members tab). */
export const UsersRingIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity={BODY} />
    <circle cx="12" cy="10" r="3.2" fill="currentColor" />
    <path d="M6 18.2c0-2.9 2.7-4.7 6-4.7s6 1.8 6 4.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

/** ArrowTargetIcon — arrow aimed at a target (Follow-ups tab). */
export const ArrowTargetIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="17" cy="7" r="4.5" fill="currentColor" opacity={BODY} />
    <circle cx="17" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="17" cy="7" r="1.7" fill="currentColor" />
    <path d="M3.5 20.5L12.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M3.5 20.5V15M3.5 20.5H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** BroadcastConeIcon — origin emitting a signal cone (Marketing tab). */
export const BroadcastConeIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="6" cy="12" r="2.6" fill="currentColor" />
    <path d="M10.5 8Q15 12 10.5 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 5.5Q20 12 14 18.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" opacity="0.55" />
    <path d="M17.5 3Q24.5 12 17.5 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.28" />
  </Svg>
);

/** BarsChartIcon — rising filled bars (Finance tab). */
export const BarsChartIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="4" y="13" width="4" height="8" rx="1.4" fill="currentColor" opacity="0.55" />
    <rect x="10" y="8" width="4" height="13" rx="1.4" fill="currentColor" />
    <rect x="16" y="4" width="4" height="17" rx="1.4" fill="currentColor" opacity="0.82" />
  </Svg>
);

/** CheckSquareIcon — check inside a filled rounded square (TODOs tab). */
export const CheckSquareIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity={BODY} />
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M7.5 12.3l3 3 6-6.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** ServerIcon — stacked server racks with status LED (System/VPS health tab). */
export const ServerIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="4" width="18" height="7" rx="2" fill="currentColor" opacity={BODY} />
    <rect x="3" y="4" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="3" y="13" width="18" height="7" rx="2" fill="currentColor" opacity={BODY} />
    <rect x="3" y="13" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="7" cy="7.5" r="1.15" fill="currentColor" />
    <circle cx="7" cy="16.5" r="1.15" fill="currentColor" />
  </Svg>
);
