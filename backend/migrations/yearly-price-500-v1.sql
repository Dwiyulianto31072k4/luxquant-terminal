-- Raise the Annual plan from 400 to 500 USDT.
--
-- Safe for anyone mid-checkout: an invoice freezes its own amount at creation
-- (payments.amount_usdt / final_amount) and verification compares the chain
-- transfer against THAT, not against the plan's current price. The 4 pending
-- yearly invoices at 400 on the day of this change still verify at 400.
--
-- Three things move with it, and they are in the application, not here:
--   · the referral estimator now reads plan prices from this table instead of
--     hardcoding 50 / 400 / 1000
--   · the referral page labels take the price from the API instead of two
--     locale files
--   · "Save 33%" becomes "Save 17%" — 500 against 12 x 50 = 600
--
-- The referral discount is a percentage (10%), so it scales on its own.

UPDATE subscription_plans
SET    price_usdt = 500.00,
       updated_at = NOW()
WHERE  name = 'yearly'
  AND  price_usdt = 400.00;   -- no-op if it has already been changed

-- The saving is also claimed in the plan's own description, which the API
-- serves straight to the checkout. Missing this left the page quoting a 33%
-- saving beside a price where it is 17%.
UPDATE subscription_plans
SET    description = 'Akses penuh selama 365 hari — Hemat 17%',
       updated_at = NOW()
WHERE  name = 'yearly';

SELECT id, name, label, price_usdt, duration_days, is_active
FROM   subscription_plans
ORDER  BY sort_order, id;
