import { useEffect, useState } from "react";

import { getBTCData } from "../../services/marketApi";

const PRICE_POLL_MS = 15000;

/**
 * Live BTC spot, polled from the backend market overview.
 *
 * Every Compass report carries the BTC price as it stood when the report was
 * generated. That figure is a fact about the report and belongs anywhere the
 * copy is historical ("the call was made at ..."). It does NOT belong anywhere
 * the copy is present tense — "price now", "% from spot", "room until this read
 * breaks" — because reports are event-driven and a quiet market can leave one
 * standing for a day. On 2026-08-30 a 20-hour-old report had the page quoting
 * +1.69% to target when the real distance was +1.20%.
 *
 * Several components on the Compass page need this at once (the hero card, the
 * thesis board, the mini strip), so the poll is shared: one timer for the whole
 * page regardless of how many components subscribe, and it stops when the last
 * one unmounts.
 *
 * Returns null until the first response lands; callers read `live ?? reportPrice`
 * so the page still renders when the poll fails or has not answered yet.
 */
const subscribers = new Set();
let current = null;
let timer = null;

const publish = (value) => {
  current = value;
  subscribers.forEach((fn) => fn(value));
};

const tick = async () => {
  try {
    const data = await getBTCData();
    const next = Number(data?.price);
    if (Number.isFinite(next) && next > 0) publish(next);
  } catch {
    /* keep the last good price rather than blanking the rail */
  }
  if (subscribers.size > 0) timer = setTimeout(tick, PRICE_POLL_MS);
  else timer = null;
};

export function useLiveBtcPrice() {
  const [price, setPrice] = useState(current);

  useEffect(() => {
    subscribers.add(setPrice);
    if (timer === null) tick();
    return () => {
      subscribers.delete(setPrice);
      if (subscribers.size === 0 && timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, []);

  return price;
}

export default useLiveBtcPrice;
