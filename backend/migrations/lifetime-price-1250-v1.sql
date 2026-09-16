-- Raise the Lifetime plan from 1000 to 1250 USDT.
--
-- Safe for anyone mid-checkout: an invoice freezes its own amount at creation
-- (payments.amount_usdt / final_amount) and verification compares the chain
-- transfer against THAT, not against the plan's current price. The two pending
-- lifetime invoices at 1000 on the day of this change (#484, #486) still
-- verify at 1000 — they were quoted that figure, so they settle at it.
--
-- Unlike the Annual move, NOTHING in the copy has to follow. Lifetime carries
-- no savings claim: its description is price-free ("Bayar sekali"), the pricing
-- page's "/ 12" equivalent and "Save 17%" are both gated on plan.name ===
-- "yearly", the referral labels take their figure from the API, and the page's
-- JSON-LD states only lowPrice 0. The audit for that is the point of this note:
-- the Annual change needed four copy fixes, and assuming the same here would
-- have been wrong in the other direction.
--
-- Two application defaults DID move, and they are in code, not here: the
-- referral estimator's fallback (routes/referral.py) and the response schema's
-- defaults (schemas/referral.py, lifetime_price 1000 -> 1250, lifetime_usdt
-- 100 -> 125). Both only surface if this table cannot be read, but a fallback
-- that quotes a stale price understates a referrer's commission.
--
-- The referral discount is a percentage (10%), so it scales on its own.

UPDATE subscription_plans
SET    price_usdt = 1250.00,
       updated_at = NOW()
WHERE  name = 'lifetime'
  AND  price_usdt = 1000.00;   -- no-op if it has already been changed

SELECT id, name, label, price_usdt, duration_days, is_active
FROM   subscription_plans
ORDER  BY sort_order, id;
