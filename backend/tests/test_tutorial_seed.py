"""The Tutorials curriculum is product copy. These tests pin the files, not the DB."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.learn import TRACK_SLUGS  # noqa: E402
from app.services.tutorial_seed import (  # noqa: E402
    iter_official_lessons,
    lessons_dir,
    load_lesson_files,
    parse_frontmatter,
    validate_lesson,
)


def test_frontmatter_round_trip():
    meta, body = parse_frontmatter(
        "---\nslug: win-rate\ntrack: numbers\norder: 10\ntitle: Win rate\n"
        "excerpt: Plainly.\nlevel: basic\nminutes: 5\n---\n\nHello **world**.\n"
    )
    assert meta["slug"] == "win-rate"
    assert meta["track"] == "numbers"
    assert meta["order"] == "10"
    assert body.strip() == "Hello **world**."


def test_curriculum_files_are_valid():
    folder = lessons_dir()
    assert os.path.isdir(folder), folder
    lessons = list(iter_official_lessons(folder))
    assert len(lessons) >= 20, f"curriculum too thin: {len(lessons)}"

    by_track = {slug: [] for slug in TRACK_SLUGS}
    for lesson in lessons:
        assert not validate_lesson(lesson)
        assert "|" not in lesson["_body"] or "http" in lesson["_body"], (
            f"possible markdown table in {lesson['slug']}"
        )
        words = len(lesson["_body"].split())
        assert 180 <= words <= 900, f"{lesson['slug']} is {words} words"
        by_track[lesson["track"]].append(lesson)

    for slug in TRACK_SLUGS:
        assert by_track[slug], f"track {slug} has no lessons"
        orders = [int(x["order"]) for x in by_track[slug]]
        assert orders == sorted(orders)
        assert len(orders) == len(set(orders)), f"duplicate order in {slug}"


def test_required_lessons_exist():
    slugs = {m["slug"] for m in load_lesson_files()}
    for needed in (
        "what-you-get",
        "win-rate",
        "peak-vs-realised",
        "what-we-do-not-claim",
        "btc-compass",
        "what-the-agent-does",
        "compare-from-here",
    ):
        assert needed in slugs


def test_win_rate_lesson_states_the_definition():
    lesson = next(m for m in load_lesson_files() if m["slug"] == "win-rate")
    body = lesson["_body"].lower()
    assert "at least tp1" in body
    assert "profitable trades" in body  # only as a sentence we forbid
    assert "forbidden" in body
