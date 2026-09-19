import { Ic } from "./signalIcons";
import { MAX_TP_24H_LABEL, MAX_TP_24H_TIP } from "../utils/maxTpWarning";

/**
 * "Prev call hit max TP" — an earlier call on this coin reached TP4 in the 24h
 * before this one (see utils/maxTpWarning). Hover gives the note on a mouse;
 * pass `onClick` where a tap must reveal it too (touch has no hover).
 */
export default function MaxTpBadge({ onClick, expanded, className = "" }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      {...(onClick
        ? { type: "button", onClick, "aria-expanded": !!expanded }
        : {})}
      title={MAX_TP_24H_TIP}
      aria-label={`${MAX_TP_24H_LABEL}. ${MAX_TP_24H_TIP}`}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-text-primary ring-1 ring-inset ring-warning/30 ${
        onClick ? "cursor-pointer transition-colors hover:bg-warning/20" : ""
      } ${className}`}
    >
      <span className="text-warning">{Ic.warn("h-3 w-3")}</span>
      {MAX_TP_24H_LABEL}
    </Tag>
  );
}
