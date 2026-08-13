// Canonical Agent acknowledgement forms. The same text is shown to the user,
// posted to the log, printed on the PDF, and stored for admin. Bump VERSION
// whenever wording changes so old PDFs stay historically accurate.

export const ASSISTANT_FORM_VERSION = "2026-08-13.1";
export const LIVE_FORM_VERSION = "2026-08-13.1";

export const ASSISTANT_FORM = {
  kind: "assistant",
  version: ASSISTANT_FORM_VERSION,
  title: "Agent is an assistant, not a money machine",
  sections: [
    {
      title: "Why this exists",
      body: "Users asked for it. Some cannot watch every LuxQuant call. LuxQuant built Agent as a helper. It is not commercialized as a profit product. There is no Agent package, no performance fee, and no promise that turning it on will make money.",
    },
    {
      title: "What it actually does",
      body: "When on, Agent watches incoming signals and, if they match the rules you saved, it can place an order on your exchange account. Funds never leave that exchange. Withdraw permission is never requested.",
    },
    {
      title: "What it is not",
      body: "Not a fund manager, copy-trade leader, or financial advice. Not set-and-forget. Not 100% controlled by Agent. Not a guarantee of profit. Not a substitute for you supervising it.",
    },
    {
      title: "You still have to drive",
      body: "Pause before news if you do not want to be in the market. Keep dry-run on until you have watched it simulate. Turn LIVE off when you cannot open the app. Open positions keep their exchange TP/SL after you pause — check those too.",
    },
    {
      title: "Losses",
      body: "Futures can liquidate. Spot can drop through a stop. Software, networks, and venues fail. Only use money you can lose.",
    },
  ],
  checks: [
    {
      id: "demand",
      label:
        "I understand Agent exists because users asked for help — it is not a commercial trading product, a signal subscription upsell, or a managed account.",
    },
    {
      id: "assistant",
      label:
        "I understand Agent is only an assistant. It follows rules I set. It does not think, does not guarantee profit, and will lose money in some market conditions.",
    },
    {
      id: "control",
      label:
        "I stay in control: I decide when it is on or off, the size, leverage, markets, dry-run vs live, and I will pause it when I cannot supervise (news, travel, sleep, doubt).",
    },
    {
      id: "loss",
      label:
        "If I lose money — including all margin on a trade — that outcome is mine. I will not treat a losing trade as LuxQuant's fault or as a broken promise.",
    },
  ],
};

export const LIVE_FORM = {
  kind: "live",
  version: LIVE_FORM_VERSION,
  title: "Before Agent places real orders",
  sections: [
    {
      title: "Live trading",
      body: "Agent follows your rules on your exchange account. It is an assistant, not a promise, a managed account, or financial advice.",
    },
  ],
  checks: [
    {
      id: "own",
      label:
        "I choose the size, leverage, markets, and when the assistant is on. LuxQuant does not manage my money.",
    },
    {
      id: "loss",
      label: "I can lose money, including all margin on a trade. Nothing here guarantees profit.",
    },
    {
      id: "watch",
      label:
        "I will pause LIVE when I cannot supervise it. Agent is not a set-and-forget money machine.",
    },
    {
      id: "self",
      label: "Matching signals may place real exchange orders. Those outcomes are mine, win or lose.",
    },
  ],
};

export function buildAckPayload(form, checkedIds) {
  return {
    kind: form.kind,
    version: form.version,
    title: form.title,
    checks: form.checks.map((item) => ({
      id: item.id,
      label: item.label,
      checked: Boolean(checkedIds[item.id]),
    })),
    sections: form.sections,
  };
}
