from app.services.telegram_attribution import acq_from_telegram_start_param


def test_paid_telegram_ads_payload():
    acq = acq_from_telegram_start_param("lq1p_aug-growth_proof-a")
    assert acq is not None
    assert acq.source == "telegram"
    assert acq.medium == "paid_social"
    assert acq.campaign == "aug-growth"
    assert acq.content == "proof-a"


def test_popup_rescue_payload():
    acq = acq_from_telegram_start_param("lq1f_login_redirect")
    assert acq is not None
    assert acq.medium == "auth_fallback"
    assert acq.campaign == "login"
    assert acq.content == "redirect"


def test_legacy_closed_win_payload_stays_compatible():
    acq = acq_from_telegram_start_param("closed_win_btc_wr_coin")
    assert acq is not None
    assert acq.medium == "miniapp"
    assert acq.campaign == "closed_win"
    assert acq.content == "btc_wr_coin"


def test_blank_payload_is_ignored():
    assert acq_from_telegram_start_param("") is None
