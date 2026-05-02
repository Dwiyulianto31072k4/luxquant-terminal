"""
LuxQuant Terminal - Signal Journey View Builder
================================================
Layer 5: Pure function yang transform raw signal_journey row + signals row
ke display-ready dict (siap di-serve ke frontend).

NO DB. NO NETWORK. Pure data transformation.

Ini bertanggung jawab atas:
  - Generate event context strings (rule-based, deterministik)
  - Generate outcome summary sentence (template-based)
  - Format human-readable times (T+15m, +13m from TP2, 2m 8s)
  - Map color tokens biar frontend gak perlu hardcode warna
  - NO qualitative labels (Excellent/Smooth/dll) — sesuai keputusan, raw stats only
  - "Peak Excursion" framing (NOT "Missed Potential" — neutral)
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any


# ============================================================
# COLOR TOKENS (frontend reference — mapped per event type)
# ============================================================

COLOR_TOKEN_MAP = {
    'entry':       'gold',
    'tp1':         'green',
    'tp2':         'lime',
    'tp3':         'amber',
    'tp4':         'orange',
    'sl':          'red',
    'swing_high':  'cyan',
    'swing_low':   'purple',
}

EVENT_DISPLAY_NAME = {
    'entry':       'Signal Called',
    'tp1':         'TP1 Hit',
    'tp2':         'TP2 Hit',
    'tp3':         'TP3 Hit',
    'tp4':         'TP4 Hit',
    'sl':          'Stop Loss Hit',
    'swing_high':  'Market Peak',
    'swing_low':   'Pullback',
}


# ============================================================
# TIME FORMATTING
# ============================================================

def format_duration(seconds: Optional[int], short: bool = False) -> str:
    """
    Format detik → string human-readable.
    short=False: '2m 8s' / '1h 12m' / '7d 4h'
    short=True:  '2m'    / '1h 12m' / '7d'   (drop seconds for >1m)
    """
    if seconds is None or seconds < 0:
        return ''

    if seconds < 60:
        return f'{seconds}s'

    minutes, sec = divmod(seconds, 60)
    if minutes < 60:
        if short or sec == 0:
            return f'{minutes}m'
        return f'{minutes}m {sec}s'

    hours, minutes = divmod(minutes, 60)
    if hours < 24:
        if minutes == 0:
            return f'{hours}h'
        return f'{hours}h {minutes}m'

    days, hours = divmod(hours, 24)
    if hours == 0:
        return f'{days}d'
    return f'{days}d {hours}h'


def format_time_main(seconds_from_entry: int) -> str:
    """T-prefix format: 'T+0', 'T+15m', 'T+1h 12m', 'T+7d'."""
    if seconds_from_entry == 0:
        return 'T+0'
    return f'T+{format_duration(seconds_from_entry, short=False)}'


def format_time_delta(seconds_from_prev: int, prev_event_label: str) -> str:
    """
    Subtitle delta: '+13m from TP2', 'same candle', 'start'.
    Returns empty string if prev event not provided.
    """
    if not prev_event_label:
        return 'start'
    if seconds_from_prev <= 0:
        return f'same candle as {prev_event_label}'
    if seconds_from_prev < 60:
        return f'+{seconds_from_prev}s from {prev_event_label}'
    return f'+{format_duration(seconds_from_prev, short=False)} from {prev_event_label}'


# ============================================================
# EVENT CONTEXT (rule-based per row)
# ============================================================

def build_event_context(
    *,
    event: Dict[str, Any],
    prev_event: Optional[Dict[str, Any]],
    next_event: Optional[Dict[str, Any]],
    direction: str,
    final_outcome_type: Optional[str],
) -> str:
    """
    Generate context string per event row. Deterministic, fact-based.
    Direction passed for future short-context support; current rules are direction-agnostic.
    """
    et = event.get('type', '')

    # Suppress unused-arg lint (direction reserved buat future use)
    _ = direction

    # ENTRY
    if et == 'entry':
        return 'Long entry zone activated' if event.get('_dir') == 'long' else 'Entry zone activated'

    # TP1
    if et == 'tp1':
        return 'First profit target reached'

    # TP2/3/4 — check kalau gap-up dari prev TP (same candle / dalam 1 menit)
    if et in ('tp2', 'tp3', 'tp4'):
        if prev_event and prev_event.get('type', '').startswith('tp'):
            prev_t = prev_event.get('_at_dt')
            cur_t = event.get('_at_dt')
            if prev_t and cur_t:
                delta_sec = (cur_t - prev_t).total_seconds()
                if delta_sec < 60:  # within same minute
                    prev_label = prev_event['type'].upper()
                    return f'Gap-up from {prev_label}, same candle'
        # else: just return generic
        if et == 'tp2':
            return 'Second target reached'
        if et == 'tp3':
            return 'Third target confirmed'
        return 'Final target reached'

    # SWING HIGH (peak)
    if et == 'swing_high':
        # Find surrounding TPs
        tp_before = _last_tp_before(event, prev_event)
        tp_after = _next_tp_after(event, next_event)
        if tp_before and tp_after:
            return f'Highest price between {tp_before.upper()} and {tp_after.upper()}'
        if tp_before:
            return f'Highest price after {tp_before.upper()}'
        return 'Highest price reached'

    # SWING LOW (pullback)
    if et == 'swing_low':
        # Compare retracement vs nearest peak
        # Simplified: kalau pct masih positive → "still in profit"
        pct = event.get('pct', 0)
        if pct > 0:
            return 'Retraced but still in profit'
        if pct > -2:
            return 'Minor pullback below entry'
        return 'Significant retracement'

    # SL
    if et == 'sl':
        return 'Stop loss triggered'

    return ''


def _last_tp_before(_event: Dict[str, Any], prev_event: Optional[Dict[str, Any]]) -> Optional[str]:
    """Quick lookup: kalau prev_event adalah TP, return type-nya."""
    if prev_event and prev_event.get('type', '').startswith('tp'):
        return prev_event['type']
    return None


def _next_tp_after(_event: Dict[str, Any], next_event: Optional[Dict[str, Any]]) -> Optional[str]:
    """Quick lookup: kalau next_event adalah TP, return type-nya."""
    if next_event and next_event.get('type', '').startswith('tp'):
        return next_event['type']
    return None


# ============================================================
# OUTCOME SUMMARY SENTENCE (template-based)
# ============================================================

def build_outcome_summary(
    *,
    coverage_status: str,
    realized_pct: Optional[float],
    last_telegram_event_type: Optional[str],
    overall_mfe_pct: Optional[float],
    overall_mfe_at: Optional[datetime],
    last_event_at: Optional[datetime],
    created_at: datetime,
    direction: str,
) -> str:
    """
    Generate outcome summary sentence (1-2 sentences).
    Pure template-based — no AI, no judgment.
    """
    _ = direction  # reserved

    # Outcome verb based on coverage_status
    if coverage_status == 'sl_truncated':
        outcome_verb = 'closed at'
        result_word = 'loss'
    elif coverage_status == 'frozen':
        outcome_verb = 'delivered'
        result_word = 'profit'
    elif coverage_status == 'live':
        outcome_verb = 'is currently up'
        result_word = ''  # no extra word needed
    else:
        # unavailable — minimal sentence
        return 'Detailed market data unavailable for this signal.'

    realized_str = _fmt_pct(realized_pct)
    last_tp_str = (last_telegram_event_type or '').upper() if last_telegram_event_type else ''
    via = f' via {last_tp_str}' if last_tp_str and last_tp_str.startswith('TP') else ''

    # Sentence 1
    if realized_pct is None:
        sentence_1 = ''
    elif coverage_status == 'live':
        sentence_1 = f'This trade {outcome_verb} {realized_str}{via}.'
    elif coverage_status == 'sl_truncated':
        sentence_1 = f'This trade {outcome_verb} {realized_str} after stop loss triggered.'
    else:
        sentence_1 = f'This trade {outcome_verb} {realized_str} {result_word}{via}.'.replace('  ', ' ')

    # Sentence 2 — peak context
    sentence_2 = ''
    if overall_mfe_pct is not None and overall_mfe_pct > 0:
        peak_str = _fmt_pct(overall_mfe_pct)

        # Determine if peak was during or post trade window
        # Reference time = last_event_at (last TP/SL hit) atau now jika live & no event
        reference_t = last_event_at  # might be None for open signals
        if (
            reference_t is None
            or overall_mfe_at is None
        ):
            # No reference — just note the peak
            sentence_2 = f' Peak excursion reached {peak_str}.'
        else:
            # Check kalau peak terjadi DURING trade (sebelum atau sama dengan last event)
            # atau POST trade (setelah last event)
            if overall_mfe_at <= reference_t:
                # Peak happened during trade window
                if realized_pct is not None and abs(overall_mfe_pct - realized_pct) < 0.1:
                    # Peak ≈ realized, no need to mention
                    sentence_2 = ''
                else:
                    sentence_2 = f' Peak excursion reached {peak_str} during the trade.'
            else:
                # Peak happened POST trade
                hours_after = (overall_mfe_at - reference_t).total_seconds() / 3600
                if hours_after < 1:
                    delta_text = f'{int(hours_after * 60)} minutes after final TP'
                elif hours_after < 24:
                    delta_text = f'{int(hours_after)} hours after final TP'
                else:
                    delta_text = f'{int(hours_after / 24)} days after final TP'
                sentence_2 = f' Market continued to {peak_str} — {delta_text}.'

    return (sentence_1 + sentence_2).strip()


def _fmt_pct(val: Optional[float]) -> str:
    """Format pct with sign: +5.33%, -2.78%."""
    if val is None:
        return ''
    sign = '+' if val >= 0 else ''
    return f'{sign}{val:.2f}%'


# ============================================================
# WORST DRAWDOWN CONTEXT
# ============================================================

def build_worst_drawdown_context(
    overall_mae_pct: Optional[float],
    overall_mae_at: Optional[datetime],
    initial_mae_pct: Optional[float],
    initial_mae_before: Optional[str] = None,
) -> str:
    """Short context: 'Throughout', 'Pre-TP1', 'Post-TP1', 'Until SL'."""
    if overall_mae_pct is None:
        return ''

    # Special case: SL truncated, gak ada TP — context-nya beda
    if initial_mae_before == 'sl':
        return 'Until SL'

    if initial_mae_pct is None:
        return 'Throughout'
    # Kalau worst MAE sama dengan initial MAE → terjadi sebelum TP1
    if abs(overall_mae_pct - initial_mae_pct) < 0.05:
        return 'Pre-TP1'
    # Kalau worst MAE lebih dalam dari initial → ada deeper drawdown POST TP1
    if overall_mae_pct < initial_mae_pct:
        return 'Post-TP1'
    return 'Throughout'


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def build_journey_view(
    *,
    journey_row: Dict[str, Any],
    signal_row: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Transform raw DB rows ke display-ready dict (matches SignalJourneyResponse schema).

    Args:
        journey_row: dict from signal_journey table (all columns)
        signal_row: dict from signals table (signal_id, pair, status, created_at_dt, etc)

    Returns:
        Dict siap di-serialize ke JSON sebagai SignalJourneyResponse.
    """
    direction = journey_row['direction']
    coverage_status = journey_row['coverage_status']
    coverage_from: datetime = journey_row['coverage_from']
    coverage_until: datetime = journey_row['coverage_until']
    created_at: datetime = signal_row['created_at_dt']

    # ============================================================
    # HEADER
    # ============================================================
    duration_sec = int((coverage_until - coverage_from).total_seconds())
    is_live = (coverage_status == 'live')

    # ============================================================
    # SECTION 1: ENTRY STATS (raw, no qualitative)
    # ============================================================
    time_to_tp1 = journey_row.get('time_to_tp1_seconds')
    entry_stats = {
        'initial_drawdown_pct': journey_row.get('initial_mae_pct'),
        'initial_drawdown_at': journey_row.get('initial_mae_at'),
        'initial_mae_before': journey_row.get('initial_mae_before'),
        'time_to_tp1_seconds': time_to_tp1,
        'time_to_tp1_human': format_duration(time_to_tp1, short=False) if time_to_tp1 else None,
    }

    # ============================================================
    # SECTION 2: TIMELINE EVENTS
    # ============================================================
    raw_events = journey_row.get('events') or []
    timeline = _build_timeline(
        raw_events=raw_events,
        coverage_from=coverage_from,
        direction=direction,
    )

    # Find last telegram event (untuk outcome reference)
    last_telegram_event_type = None
    last_event_at = None
    for ev in reversed(raw_events):
        if ev.get('telegram') is True and ev.get('type') in ('tp1', 'tp2', 'tp3', 'tp4', 'sl'):
            last_telegram_event_type = ev['type']
            last_event_at = _parse_iso(ev.get('at'))
            break

    # ============================================================
    # SECTION 3: OUTCOME
    # ============================================================
    realized = journey_row.get('realized_outcome_pct')
    overall_mfe = journey_row.get('overall_mfe_pct')
    overall_mfe_at = journey_row.get('overall_mfe_at')
    overall_mae = journey_row.get('overall_mae_pct')
    overall_mae_at = journey_row.get('overall_mae_at')
    initial_mae = journey_row.get('initial_mae_pct')
    pct_time_above = journey_row.get('pct_time_above_entry')

    summary_sentence = build_outcome_summary(
        coverage_status=coverage_status,
        realized_pct=realized,
        last_telegram_event_type=last_telegram_event_type,
        overall_mfe_pct=overall_mfe,
        overall_mfe_at=overall_mfe_at,
        last_event_at=last_event_at,
        created_at=created_at,
        direction=direction,
    )

    # Peak excursion delta text
    peak_excursion_delta_text = ''
    if overall_mfe_at:
        delta_from_entry = (overall_mfe_at - coverage_from).total_seconds()
        peak_excursion_delta_text = f'at {format_time_main(int(delta_from_entry))}'

    outcome = {
        'summary_sentence': summary_sentence,
        'realized_pct': realized,
        'realized_via': last_telegram_event_type.upper() if last_telegram_event_type else None,
        'peak_excursion_pct': overall_mfe,
        'peak_excursion_at': overall_mfe_at,
        'peak_excursion_delta_text': peak_excursion_delta_text,
        'pct_time_above_entry': pct_time_above,
        'worst_drawdown_pct': overall_mae,
        'worst_drawdown_at': overall_mae_at,
        'worst_drawdown_context': build_worst_drawdown_context(
            overall_mae, overall_mae_at, initial_mae,
            initial_mae_before=journey_row.get('initial_mae_before'),
        ),
        'tp_then_sl': journey_row.get('tp_then_sl', False),
        'tps_hit_before_sl': journey_row.get('tps_hit_before_sl'),
    }

    # ============================================================
    # ASSEMBLE RESPONSE
    # ============================================================
    return {
        'signal_id': journey_row['signal_id'],
        'pair': signal_row.get('pair'),
        'direction': direction,
        'coverage_status': coverage_status,
        'coverage_from': coverage_from,
        'coverage_until': coverage_until,
        'duration_seconds': duration_sec,
        'duration_human': format_duration(duration_sec, short=False),
        'data_source': journey_row.get('data_source', 'unavailable'),
        'is_live': is_live,
        'computed_at': journey_row.get('computed_at'),

        'entry_stats': entry_stats,
        'events': timeline,
        'outcome': outcome,

        # Legend reference (static — frontend bisa hardcode juga, tapi ini DRY)
        'legend': {
            'confirmed': 'Official TP/SL announcements',
            'detected': 'Significant price movements (≥1.5% swings) from market data',
        },
    }


# ============================================================
# TIMELINE BUILDER (private)
# ============================================================

def _build_timeline(
    *,
    raw_events: List[Dict[str, Any]],
    coverage_from: datetime,
    direction: str,
) -> List[Dict[str, Any]]:
    """
    Map raw events array (JSONB) → display-ready list with context, color tokens, time formats.
    Adds computed fields per event.
    """
    # Pre-parse: convert ISO strings ke datetime, attach _dir buat context builder
    parsed: List[Dict[str, Any]] = []
    for ev in raw_events:
        at_dt = _parse_iso(ev.get('at'))
        parsed.append({
            **ev,
            '_at_dt': at_dt,
            '_dir': direction,
        })

    output: List[Dict[str, Any]] = []
    for i, ev in enumerate(parsed):
        et = ev.get('type', '')
        prev_ev = parsed[i - 1] if i > 0 else None
        next_ev = parsed[i + 1] if i + 1 < len(parsed) else None

        at_dt: Optional[datetime] = ev.get('_at_dt')

        # Time formatting
        if at_dt:
            sec_from_entry = int((at_dt - coverage_from).total_seconds())
            time_main = format_time_main(sec_from_entry)
        else:
            sec_from_entry = 0
            time_main = ''

        # Time delta from previous event
        if prev_ev and prev_ev.get('_at_dt') and at_dt:
            sec_from_prev = int((at_dt - prev_ev['_at_dt']).total_seconds())
            prev_label = EVENT_DISPLAY_NAME.get(prev_ev.get('type', ''), prev_ev.get('type', ''))
            # Use abbreviation buat TP-style labels
            prev_type = prev_ev.get('type', '')
            if prev_type.startswith('tp') or prev_type == 'sl':
                prev_label = prev_type.upper()
            elif prev_type == 'entry':
                prev_label = 'entry'
            elif prev_type == 'swing_high':
                prev_label = 'peak'
            elif prev_type == 'swing_low':
                prev_label = 'pullback'
            time_delta = format_time_delta(sec_from_prev, prev_label)
        else:
            time_delta = 'start'

        context = build_event_context(
            event=ev,
            prev_event=prev_ev,
            next_event=next_ev,
            direction=direction,
            final_outcome_type=None,  # not used currently
        )

        confirmed = bool(ev.get('telegram', False)) or et == 'entry'

        output.append({
            'type': et,
            'at': at_dt,
            'price': ev.get('price'),
            'pct': ev.get('pct'),
            'confirmed': confirmed,
            'label': EVENT_DISPLAY_NAME.get(et, et),
            'context': context,
            'time_main': time_main,
            'time_delta': time_delta,
            'color_token': COLOR_TOKEN_MAP.get(et, 'default'),
            'is_highlighted': et in ('swing_high', 'swing_low'),
        })

    return output


def _parse_iso(s: Any) -> Optional[datetime]:
    """Parse ISO string ke datetime, tolerant. Already-datetime passthrough."""
    if s is None:
        return None
    if isinstance(s, datetime):
        if s.tzinfo is None:
            return s.replace(tzinfo=timezone.utc)
        return s
    if not isinstance(s, str):
        return None
    try:
        dt = datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
