// src/components/admin/users/DrcBadge.jsx
// Marks a member who came in through the Daily Rekom Crypto Discord with its
// Premium+ role. The mark is the same file the landing footer uses, so the
// badge is recognisably DRC's rather than a colour someone has to decode.
//
// Violet is --viz-4, the project's validated categorical violet, which also
// happens to match the logo. Every other named hue in the admin palette is
// neutralised to muted grey, and gold here would read as "Lifetime".
export const DrcBadge = ({ compact = false }) => (
  <span
    className="inline-flex shrink-0 items-center gap-1 rounded-full font-mono font-bold uppercase tracking-wider"
    style={{
      padding: compact ? "1px 7px 1px 3px" : "2px 9px 2px 4px",
      fontSize: compact ? 9 : 10,
      // --viz-* are hex, so no rgb(var() / a) alpha trick: tint with color-mix.
      color: "var(--viz-4)",
      background: "color-mix(in srgb, var(--viz-4) 10%, transparent)",
      border: "1px solid color-mix(in srgb, var(--viz-4) 30%, transparent)",
    }}
    title="Daily Rekom Crypto · Discord Premium+"
  >
    <img
      src="/DRC%20LOGO.webp"
      alt=""
      aria-hidden="true"
      className="shrink-0"
      style={{ width: compact ? 12 : 14, height: compact ? 12 : 14 }}
    />
    DRC Subscriber
  </span>
);

export default DrcBadge;
