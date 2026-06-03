// ════════════════════════════════════════════════════════════════════
// Local icon supplement for the Finance batch.
// Ensures every icon used by batch 4 exists even if the project's main
// Icons.jsx is missing one. We re-export icons that may exist there;
// the ones that might not are defined locally.
//
// All icons use Lucide-style stroke-2, 24×24 viewBox, currentColor.
// ════════════════════════════════════════════════════════════════════

const Svg = ({ size = 16, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

/* ── Fallback definitions ────────────────────────────────────────── */

export const XCircleIcon = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </Svg>
);

export const ChevronRightIcon = (props) => (
  <Svg {...props}>
    <polyline points="9 18 15 12 9 6" />
  </Svg>
);

export const ChevronLeftIcon = (props) => (
  <Svg {...props}>
    <polyline points="15 18 9 12 15 6" />
  </Svg>
);

export const TrashIcon = (props) => (
  <Svg {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Svg>
);

export const RotateCcwIcon = (props) => (
  <Svg {...props}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </Svg>
);

export const ArchiveIcon = (props) => (
  <Svg {...props}>
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </Svg>
);
