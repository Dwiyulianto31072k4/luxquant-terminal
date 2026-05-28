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
