// src/components/charts/chartToolIcons.jsx
//
// The tool rail used to be four unicode glyphs (✛ ⇔ ― ╱). They render at a
// different weight in every font the app falls back to, cannot be sized, and
// read as text rather than controls. These are drawn instead: one grid, one
// stroke weight, and they inherit currentColor so the active state is just a
// colour change.

const S = ({ children, ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[15px] w-[15px]"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconCursor = () => (
  <S>
    <path d="M12 3v18M3 12h18" />
  </S>
);

export const IconMeasure = () => (
  <S>
    <path d="M4 8h16v8H4z" />
    <path d="M8 8v3M12 8v4M16 8v3" />
  </S>
);

export const IconHLine = () => (
  <S>
    <path d="M3 12h18" />
    <circle cx="8" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </S>
);

export const IconVLine = () => (
  <S>
    <path d="M12 3v18" />
    <circle cx="12" cy="8" r="1.6" fill="currentColor" stroke="none" />
  </S>
);

export const IconTrend = () => (
  <S>
    <path d="M4 19L20 5" />
    <circle cx="4" cy="19" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="20" cy="5" r="1.8" fill="currentColor" stroke="none" />
  </S>
);

export const IconRay = () => (
  <S>
    <path d="M4 18L21 6" />
    <circle cx="4" cy="18" r="1.8" fill="currentColor" stroke="none" />
    <path d="M16 5.5L21 6l-.6 5" />
  </S>
);

export const IconRect = () => (
  <S>
    <rect x="4" y="6" width="16" height="12" rx="1" />
  </S>
);

export const IconFib = () => (
  <S>
    <path d="M3 5h18M3 10h18M3 14h18M3 19h18" />
  </S>
);

export const IconMagnet = () => (
  <S>
    <path d="M6 4v8a6 6 0 0012 0V4" />
    <path d="M6 9h4M14 9h4" />
  </S>
);

export const IconUndo = () => (
  <S>
    <path d="M4 10h10a5 5 0 010 10h-3" />
    <path d="M4 10l4-4M4 10l4 4" />
  </S>
);

export const IconTrash = () => (
  <S>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </S>
);
