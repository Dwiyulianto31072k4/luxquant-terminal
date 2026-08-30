import json

from app.services.learning_seed import CATALOG


def test_learning_seed_has_unique_hierarchy_and_valid_blocks():
    course_slugs = [course["slug"] for course in CATALOG]
    assert len(course_slugs) == len(set(course_slugs))
    assert "luxquant-essentials" in course_slugs
    assert "signal-decision-lab" in course_slugs

    lesson_titles = []
    valid_types = {"hero", "callout", "compare", "steps", "timeline", "check", "decision", "product"}
    for course in CATALOG:
        assert course["modules"]
        assert course["skills"]
        assert course["outcomes"]
        for module in course["modules"]:
            assert module["lessons"]
            for lesson in module["lessons"]:
                lesson_titles.append(lesson["title"])
                blocks = json.loads(lesson["blocks"])
                assert blocks, lesson["title"]
                assert all(block["type"] in valid_types for block in blocks)

    assert len(lesson_titles) == len(set(lesson_titles))


def test_learning_seed_covers_retest_invalidation_and_structure():
    text = json.dumps(CATALOG).lower()
    for phrase in ("retest", "invalidation", "fvg", "ob", "sweep", "hunt full tp"):
        assert phrase in text
