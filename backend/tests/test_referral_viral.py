from app.services.referral_viral import desired_grant_days


def test_unlock_needs_three_users_and_one_paid_as_four_people():
    assert desired_grant_days(3, 0) == 0
    assert desired_grant_days(2, 1) == 0
    # Payer already inside the 3 users → 3 people, not 4.
    assert desired_grant_days(3, 1, 3) == 0
    assert desired_grant_days(3, 1, 4) == 7
    assert desired_grant_days(4, 1, 4) == 7


def test_paid_without_users_does_not_unlock():
    assert desired_grant_days(0, 1) == 0
    assert desired_grant_days(1, 5) == 0


def test_bonus_ladder_only_after_unlock_gate():
    assert desired_grant_days(10, 0) == 0
    assert desired_grant_days(10, 1, 10) == 14
    assert desired_grant_days(11, 1, 11) == 16
    assert desired_grant_days(12, 1, 12) == 18


def test_grant_caps_at_thirty_days():
    assert desired_grant_days(18, 1, 18) == 30
    assert desired_grant_days(50, 3, 50) == 30
