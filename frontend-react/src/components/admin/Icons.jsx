// src/components/admin/Icons.jsx
//
// LuxQuant Admin — Centralized SVG icon library.
//
// All icons use a consistent 24×24 viewBox and stroke-2 (Lucide-style).
// Brand icons use official paths + brand colors when `colored` prop is true,
// monochrome (currentColor) when false.
//
// Convention:
//   • Default size = 14 (small UI accents). Pass `size={N}` to override.
//   • All icons accept className, style, and forwarded props.
//   • Outline icons: stroke="currentColor" so they pick up parent color.
//

import React from 'react';

// ════════════════════════════════════════════════════════════════════
// Base SVG wrapper — keeps every icon consistent
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

// ════════════════════════════════════════════════════════════════════
// Brand icons (official paths)
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
    <path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v.5l9 5.5 9-5.5V7H3zm0 2.85V17h18V9.85l-9 5.5-9-5.5z" fill="currentColor" />
  </Svg>
);

export const SendIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BroadcastIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.49 4.93a10 10 0 0 1 0 14.14M3.51 19.07a10 10 0 0 1 0-14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const MessageCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BellIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Navigation
// ════════════════════════════════════════════════════════════════════

export const ExternalLinkIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M14 5h5v5M19 5l-9 9M19 14v5H5V5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronDownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronRightIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronLeftIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ArrowRightIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ArrowUpIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ArrowDownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Actions
// ════════════════════════════════════════════════════════════════════

export const PlusIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

export const MinusIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

export const CloseIcon = ({ size = 16, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const CheckIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CopyIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const DownloadIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const UploadIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const EditIcon = ({ size = 12, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrashIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const RefreshIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MoreVerticalIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" />
  </Svg>
);

export const MoreHorizontalIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Search & filter
// ════════════════════════════════════════════════════════════════════

export const SearchIcon = ({ size = 16, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const FilterIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const SortAscIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 6h13M3 12h9M3 18h5M17 8V4m0 0L13 8m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SortDescIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M3 6h5M3 12h9M3 18h13M17 16v4m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Status & feedback
// ════════════════════════════════════════════════════════════════════

export const EyeIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
  </Svg>
);

export const EyeOffIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BanIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const CheckCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const XCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const AlertTriangleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const AlertCircleIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const InfoIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const LoaderIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// People
// ════════════════════════════════════════════════════════════════════

export const UserIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
  </Svg>
);

export const UsersIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
  </Svg>
);

export const UserPlusIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const ShieldIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ShieldCheckIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Time
// ════════════════════════════════════════════════════════════════════

export const ClockIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const CalendarIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const HistoryIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M1 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Data / Charts
// ════════════════════════════════════════════════════════════════════

export const TrendingUpIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrendingDownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BarChartIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 20V10M18 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const PieChartIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ActivityIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Decorative
// ════════════════════════════════════════════════════════════════════

export const StarIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </Svg>
);

export const StarFilledIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" />
  </Svg>
);

export const SparklesIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 3l1.91 5.27L19 10l-5.09 1.73L12 17l-1.91-5.27L5 10l5.09-1.73L12 3z" fill="currentColor" />
    <path d="M19 3l.69 1.91L21 5.5l-1.31.59L19 8l-.69-1.91L17 5.5l1.31-.59L19 3zM5 15l.69 1.91L7 17.5l-1.31.59L5 20l-.69-1.91L3 17.5l1.31-.59L5 15z" fill="currentColor" opacity="0.6" />
  </Svg>
);

export const ZapIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </Svg>
);

export const FlameIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </Svg>
);

export const GiftIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CrownIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M2 6l4 6 4-8 2 6 2-6 4 8 4-6v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Money / Finance
// ════════════════════════════════════════════════════════════════════

export const DollarIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const CreditCardIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
  </Svg>
);

export const WalletIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ReceiptIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2-3 2zM8 7h8M8 11h8M8 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ════════════════════════════════════════════════════════════════════
// Tasks / Tags
// ════════════════════════════════════════════════════════════════════

export const TagIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 7h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const ListIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const GridIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
  </Svg>
);

export const KanbanIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect x="3" y="3" width="6" height="14" rx="1" stroke="currentColor" strokeWidth="2" />
    <rect x="11" y="3" width="6" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
    <rect x="19" y="3" width="2" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
  </Svg>
);

export const FlagIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TargetIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
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
// LuxQuant Shell Icons — premium fintech refinement (1.5px strokes)
// Added in shell redesign batch.
// Note: BarChartIcon already exists in Icons.jsx, so the new
// finance-tab icon is named BarsChartIcon.
// ════════════════════════════════════════════════════════════════════

/**
 * LambdaGlyph — capital lambda Λ as brand monogram.
 * The quant symbol. Used in the AdminWorkspacePage hero.
 */
export const LambdaGlyph = ({ size = 18, ...props }) => (
  <Svg size={size} {...props}>
    <path
      d="M5 21 L11.2 5.5 Q12 3.8 12.8 5.5 L19 21"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Inner serif accents — subtle */}
    <path
      d="M9.5 17.5 L14.5 17.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.45"
    />
  </Svg>
);

/**
 * UsersRingIcon — silhouette inside subtle ring.
 * Replaces generic UsersIcon for the shell tab.
 */
export const UsersRingIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="1.4"
      opacity="0.35"
      fill="none"
    />
    <circle
      cx="12"
      cy="10"
      r="3"
      stroke="currentColor"
      strokeWidth="1.6"
      fill="none"
    />
    <path
      d="M6.5 18.5 Q12 14 17.5 18.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
  </Svg>
);

/**
 * ArrowTargetIcon — arrow heading toward a target dot.
 * For Follow-ups tab. Conveys "chase / aim / pursue".
 */
export const ArrowTargetIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    {/* Outer target ring */}
    <circle
      cx="17"
      cy="7"
      r="4"
      stroke="currentColor"
      strokeWidth="1.5"
      opacity="0.4"
      fill="none"
    />
    {/* Inner target dot */}
    <circle cx="17" cy="7" r="1.5" fill="currentColor" />
    {/* Arrow shaft + head */}
    <path
      d="M4 20 L13.5 10.5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M4 20 L4 15 M4 20 L9 20"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

/**
 * BroadcastConeIcon — origin point emitting a signal cone.
 * For Marketing tab. Conveys "broadcast / reach / amplify".
 */
export const BroadcastConeIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    {/* Origin dot */}
    <circle cx="6" cy="12" r="2" fill="currentColor" />
    {/* Signal arcs — three layers, fading */}
    <path
      d="M10 8.5 Q14 12 10 15.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M13.5 6 Q19 12 13.5 18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.55"
      fill="none"
    />
    <path
      d="M17 3.5 Q24 12 17 20.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.25"
      fill="none"
    />
  </Svg>
);

/**
 * BarsChartIcon — three rising bars on a baseline.
 * For Finance tab. Conveys "revenue / growth / quant".
 * (Named BarsChartIcon to avoid collision with existing BarChartIcon.)
 */
export const BarsChartIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    {/* Baseline */}
    <path
      d="M3 21 L21 21"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.4"
    />
    {/* Bar 1 — short */}
    <path
      d="M6 21 L6 14"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Bar 2 — medium */}
    <path
      d="M12 21 L12 9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Bar 3 — tall */}
    <path
      d="M18 21 L18 4"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </Svg>
);

/**
 * CheckSquareIcon — checkmark inside a rounded square.
 * For TODOs tab. Conveys "task / done / list-item".
 */
export const CheckSquareIcon = ({ size = 14, ...props }) => (
  <Svg size={size} {...props}>
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <path
      d="M7.5 12.5 L10.5 15.5 L16.5 8.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);
