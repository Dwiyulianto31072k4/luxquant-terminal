// Canonical Agent acknowledgement forms. The same text is shown to the user,
// posted to the log, printed on the PDF, and stored for admin. Bump VERSION
// whenever wording changes so old PDFs stay historically accurate.

export const ASSISTANT_FORM_VERSION = "2026-08-13.3";
export const LIVE_FORM_VERSION = "2026-08-13.1";

export const ASSISTANT_FORM = {
  kind: "assistant",
  version: ASSISTANT_FORM_VERSION,
  title: "Agent is an assistant, not a money machine",
  sections: [
    {
      title: "Why this feature exists",
      body: "Agent started from a practical problem, not a product launch. Members kept writing in — at work, in another timezone, asleep through a session, unable to finish Binance KYC, trading Bitget instead — asking for a way to apply their own size and stop when they cannot sit on the exchange. That is the reason it is here. If you do not need that help, you do not have to use it.",
    },
    {
      title: "We do not commercialize it",
      body: "There is no Agent package, no performance fee, no “autotrade add-on”, no promise that turning it on will make you money. LuxQuant’s product is the terminal and the research. Agent is a courtesy helper for members who already use those and asked for execution help. Using Agent does not make a losing trade our fault.",
    },
    {
      title: "What it actually does",
      body: "When you turn it on, Agent watches incoming signals and, if they match the rules you saved, it can place an order on your Binance, Bitget, or BingX account. Funds never leave that exchange. Withdraw permission is never requested. It will also skip trades — risk cap, daily loss limit, cooldown, invalid key, symbol not listed, you paused it. A skip is not a bug. A fill is not a gift.",
    },
    {
      title: "What it is not",
      body: "Not a fund manager. Not a copy-trade leader. Not financial advice. Not set-and-forget. Not 100% controlled by Agent — you choose on/off, size, leverage, spot vs futures, dry-run vs live. Not a guarantee of profit. Plenty of correct process still loses: slippage, wicks, news, leverage, a stop that is simply hit. If you cannot check it, it should be off or in dry-run.",
    },
    {
      title: "You still have to drive",
      body: "Pause it before high-impact news if you do not want to be in the market. Lower size when you are unsure. Keep dry-run on until you have watched it simulate. Turn LIVE off when you travel or cannot open the app. Open positions keep their exchange take-profit and stop-loss after you pause — check those too. If a trade is red, the honest question is whether you left it live, at that size, on that market.",
    },
    {
      title: "Losses, including large ones",
      body: "Futures can liquidate. Spot can drop through a stop. A signal can be late. The exchange can reject a protective order. Software, networks, and venues fail. Only use money you can lose. If that sentence feels uncomfortable, do not connect keys.",
    },
  ],
  checks: [
    {
      id: "demand",
      label:
        "I understand Agent was built because many users requested it. It is not a commercial trading product, a paid autotrade package, or a managed account.",
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
