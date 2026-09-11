// src/components/subscription/ReceiptEmailPrompt.jsx
//
// "Where should the receipt go?", asked at the only moment it is not an
// interruption.
//
// Telegram's login widget never returns an email — the platform does not
// expose one — so 516 accounts carry a synthetic tg_<id>@telegram.luxquant.tw
// that goes nowhere, and nothing in the product ever offered them a way to
// supply a real one. They could not have received a receipt however much they
// wanted to.
//
// Asked HERE rather than at signup for two reasons: at checkout a person
// expects to be asked where the receipt goes, and the people who bother to
// answer are exactly the ones worth being able to reach later.
//
// It renders nothing for anyone who already has a usable address, which is
// every Google sign-up. A field that asks for something you have already given
// is the kind of thing people learn to ignore.

import { useEffect, useState } from "react";
import api from "../../services/authApi";

export default function ReceiptEmailPrompt() {
  const [state, setState] = useState(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/v1/billing/email")
      .then((r) => alive && setState(r.data))
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.put("/api/v1/billing/email", { email: value.trim() });
      setSaved(true);
    } catch (err) {
      // The server's message is written for a reader ("that address is already
      // used by another LuxQuant account"), so show it rather than a generic
      // failure that leaves them guessing what to change.
      setError(err?.response?.data?.detail || "Could not save that address");
    } finally {
      setBusy(false);
    }
  };

  if (!state?.should_ask) return null;

  if (saved) {
    return (
      <div className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
        <p className="text-[13px] text-text-primary">
          Saved. Your receipt and anything about your access will go there.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-ink/10 bg-surface-raised p-4">
      <p className="text-[13px] font-semibold text-text-primary">
        Where should we send the receipt?
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
        You signed in with Telegram, which never gives us an email address — so
        right now there is nowhere to send your receipt. Optional, and only ever
        used for your payments and access.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address for your receipt"
          className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent/40"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition hover:brightness-105 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <p className="mt-2 text-[12px] text-loss">{error}</p> : null}
    </form>
  );
}
