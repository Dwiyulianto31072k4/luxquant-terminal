/**
 * "Top Runner" — a Runner the Runners topic marked when it posted it: the call
 * carries the day's #1 runner tag. The strongest subset of Runners in the
 * point-in-time walk-forward (TP3+ ~61% vs ~52% for the other Runners, Jun–Sep
 * 2026). Hover explains on a mouse; pass `onClick` where a tap must, too.
 */
export const TOP_RUNNER_TIP =
  "Top Runner: this call carries the #1 runner tag, the strongest group of Runners in our tests. It reaches TP3 more often, not always — size for the stop.";

export default function TopRunnerBadge({ onClick, expanded, className = "" }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      {...(onClick ? { type: "button", onClick, "aria-expanded": !!expanded } : {})}
      title={TOP_RUNNER_TIP}
      aria-label={TOP_RUNNER_TIP}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-text-primary ring-1 ring-inset ring-accent/35 ${
        onClick ? "cursor-pointer transition-colors hover:bg-accent/20" : ""
      } ${className}`}
    >
      <svg className="h-3 w-3 text-accent" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.8l2.83 5.73 6.33.92-4.58 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.58-4.46 6.33-.92L12 2.8z" />
      </svg>
      Top Runner
    </Tag>
  );
}
