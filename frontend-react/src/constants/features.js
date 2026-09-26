// src/constants/features.js
// Features that hang on a paid third party, switched in one place.

// Token Flow — each token's net flow into or out of exchanges over 24 h — came
// from one Dune query the backend ran every 6 h. The Dune account's 14-day
// trial of paid features ended on 24 Sep 2026 and the free plan can no longer
// run queries, so from then on the /home card, the Terminal tab and the
// "spot accumulation / selling" chips on Scan all sat empty. Switched off on
// 26 Sep instead of buying the Analyst plan: we used ~70 of 2,500 credits a
// month, the data covered Ethereum tokens only (about a quarter of the coins
// we call), and its measured edge was +3.1 pp over 14 days.
// To bring it back: upgrade Dune, set DUNE_TOKENFLOW_ENABLED=1 in backend/.env,
// restart luxquant-poller, then flip this to true.
export const TOKEN_FLOW_ENABLED = false;
