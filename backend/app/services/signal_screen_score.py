"""Shared current-context Edge scorer used by the desk API and saved screens."""
from app.services.hunt_recipe import CONFOUND_TAGS as CONFOUND


def score_candidates(open_rows, tags, prefer_tags, base_wr, pair_prior):
    from app.api.routes.edge_lab import _r_ladder, _expectancy_proxy
    tag_lookup = {t["tag"]: t for t in tags}
    prefer_set = {t["tag"] for t in prefer_tags}
    base_wr_f = float(base_wr or 0)
    scored_open = []
    for row in open_rows:
        (sid, pair, risk_level, entry, created_at, status,
         vol_num, vol_den, stop1, t1, t2, t3, t4,
         btc_corr, btc_decoupled, btc_beta, tlist) = row
        tlist = list(tlist or [])
        hist = []
        for tg in tlist:
            meta = tag_lookup.get(tg)
            if meta:
                hist.append(meta)
        caution = [tg for tg in tlist if tg in CONFOUND]
        r_lad = _r_ladder(entry, stop1, t1, t2, t3, t4)

        if not hist:
            score = None
            reason = "no historical tag overlap (tag-era history)"
            best = None
            avg_wr = avg_full = avg_lift = None
            conf = "low"
            exp_r = None
            factors = {}
        else:
            # ── Edge Score v2 (journal-aligned multi-factor) ──
            # Uses SHRUNK rates + Wilson uncertainty; context from vol/risk/BTC/coin.
            # Keep in lockstep with frontend-react/src/utils/edgeScore.js
            lifts_s, fulls_s, wrs_s, halves, tt_secs = [], [], [], [], []
            for m in hist:
                wr_s = float(m.get("win_rate_shrunk") if m.get("win_rate_shrunk") is not None else m.get("win_rate") or 0)
                full_s = float(m.get("full_tp_rate_shrunk") if m.get("full_tp_rate_shrunk") is not None else m.get("full_tp_rate") or 0)
                wrs_s.append(wr_s)
                fulls_s.append(full_s)
                lifts_s.append(wr_s - base_wr_f)
                if m.get("win_rate_wilson_half") is not None:
                    halves.append(float(m["win_rate_wilson_half"]))
                if m.get("median_tt_tp1_sec") is not None:
                    tt_secs.append(float(m["median_tt_tp1_sec"]))
            avg_wr = sum(wrs_s) / len(wrs_s)
            avg_full = sum(fulls_s) / len(fulls_s)
            avg_lift = sum(lifts_s) / len(lifts_s)
            avg_half = sum(halves) / len(halves) if halves else 12.0
            median_tt = sorted(tt_secs)[len(tt_secs) // 2] if tt_secs else None
            confound_n = sum(1 for m in hist if m["tag"] in CONFOUND)
            prefer_n = sum(1 for m in hist if m["tag"] in prefer_set)
            confound_frac = confound_n / len(hist)
            prefer_frac = prefer_n / len(hist)

            # Core (similar center 50–70, shrunk lift)
            core = (
                52.0
                + 1.5 * avg_lift
                + 0.20 * avg_full
                + 7.0 * prefer_frac
                - 12.0 * confound_frac
                - 0.25 * max(0.0, avg_half - 6.0)  # uncertainty penalty
            )

            # Volume rank: higher rank (lower num/den) → slight boost
            vol_adj = 0.0
            try:
                if vol_num is not None and vol_den and float(vol_den) > 0:
                    pctile = 1.0 - (float(vol_num) / float(vol_den))
                    vol_adj = 3.0 * (pctile - 0.5)  # ±1.5 around mid
            except (TypeError, ValueError):
                pass

            # Risk: prefer low/medium slightly for screening
            risk_adj = 0.0
            rl = (risk_level or "").lower()
            if rl.startswith("low"):
                risk_adj = 1.5
            elif rl.startswith("high"):
                risk_adj = -1.5

            # BTC: decoupled alt often higher idiosyncratic risk → mild penalty unless strong lift
            btc_adj = 0.0
            if btc_decoupled:
                btc_adj = -1.0 if avg_lift < 2 else 0.5
            try:
                if btc_corr is not None and float(btc_corr) > 0.85 and avg_lift < 0:
                    btc_adj -= 0.5  # high beta + weak tags
            except (TypeError, ValueError):
                pass

            # BTC regime tags on this signal
            if any(t.startswith("BTC_BEARISH") for t in tlist):
                btc_adj -= 1.0
            elif any(t.startswith("BTC_BULLISH") for t in tlist):
                btc_adj += 0.5

            # Time-to-TP1 quality (faster historical tags → small boost)
            tt_adj = 0.0
            if median_tt is not None and median_tt > 0:
                # < 2h good, > 24h mild penalty
                hours = median_tt / 3600.0
                if hours <= 2:
                    tt_adj = 1.5
                elif hours <= 8:
                    tt_adj = 0.5
                elif hours >= 36:
                    tt_adj = -1.0

            # Coin prior (pair WR shrunk)
            coin_adj = 0.0
            pp = pair_prior.get(pair)
            if pp and pp.get("wr_shrunk") is not None:
                coin_adj = max(-2.0, min(2.5, 0.08 * (pp["wr_shrunk"] - base_wr_f)))

            exp_r = _expectancy_proxy(avg_full, avg_wr, r_lad)
            exp_adj = 0.0
            if exp_r is not None:
                # center ~0.5–1.5R typical; map to ±3 pts
                exp_adj = max(-3.0, min(3.5, (exp_r - 0.6) * 2.5))

            score = round(core + vol_adj + risk_adj + btc_adj + tt_adj + coin_adj + exp_adj, 1)
            score = max(35.0, min(85.0, score))

            if avg_half <= 6 and len(hist) >= 2:
                conf = "high"
            elif avg_half <= 10 or len(hist) >= 2:
                conf = "medium"
            else:
                conf = "low"

            best = max(
                hist,
                key=lambda m: (
                    m.get("lift_shrunk_pp") is not None,
                    m.get("lift_shrunk_pp") or m.get("lift_pp") or -999,
                    m.get("win_rate_shrunk") or m.get("win_rate") or 0,
                ),
            )
            caution = [m["tag"] for m in hist if m["tag"] in CONFOUND]
            factors = {
                "core": round(core, 2),
                "vol": round(vol_adj, 2),
                "risk": round(risk_adj, 2),
                "btc": round(btc_adj, 2),
                "time_to_tp": round(tt_adj, 2),
                "coin": round(coin_adj, 2),
                "expectancy_r": exp_r,
                "expectancy_adj": round(exp_adj, 2),
                "uncertainty_half_pp": round(avg_half, 2),
            }
            reason = (
                f"v2 lift* {avg_lift:+.1f}pp · full* {avg_full:.0f}% · "
                f"{prefer_n}/{len(hist)} prefer · conf {conf}"
                + (f" · E[{exp_r:.2f}R]" if exp_r is not None else "")
                + (f" · top {best['tag']}" if best else "")
            )

        scored_open.append({
            "signal_id": str(sid),
            "pair": pair,
            "risk_level": risk_level,
            "entry": float(entry) if entry is not None else None,
            "created_at": str(created_at) if created_at else None,
            "tags": tlist,
            "score": score,
            "score_version": "v2",
            "confidence": conf if hist else "low",
            "reason": reason,
            "best_tag": best["tag"] if best else None,
            "best_tag_wr": (best.get("win_rate_shrunk") or best.get("win_rate")) if best else None,
            "caution_tags": caution,
            "matched_n": len(hist),
            "avg_hist_wr": round(avg_wr, 2) if avg_wr is not None else None,
            "avg_full_tp": round(avg_full, 2) if avg_full is not None else None,
            "avg_lift_pp": round(avg_lift, 2) if avg_lift is not None else None,
            "factors": factors if hist else None,
            "expectancy_r": exp_r if hist else None,
            "on_desk": True,
        })

    scored_open.sort(
        key=lambda x: (
            x["score"] is not None,
            x["score"] or 0,
            x.get("avg_full_tp") or 0,
            x.get("matched_n") or 0,
        ),
        reverse=True,
    )

    return scored_open
