"""Initial LuxQuant Learning catalog.

The seed is intentionally create-only. Once an editor touches a course, the
database is authoritative and startup must never overwrite their work.
"""
import json
import re

from sqlalchemy.orm import Session

from app.models.learning import LearningCourse, LearningLesson, LearningModule
from app.models.user import User  # noqa: F401 - registers FK target in Base metadata
from app.services.learning_maximize_calls_course import MAXIMIZE_CALLS_COURSE


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _blocks(*items):
    return json.dumps(list(items), ensure_ascii=False)


CATALOG = [
    {
        "slug": "luxquant-essentials",
        "title": "LuxQuant Essentials",
        "short_title": "Essentials",
        "summary": "Read a call correctly before you decide what to do with it.",
        "description": "A product-first path through calls, targets, stops, status, and the public track record. No generic trading detour.",
        "category": "LuxQuant",
        "level": "beginner",
        "access_tier": "free",
        "featured": True,
        "skills": ["Read a call", "Interpret status", "Use the track record"],
        "outcomes": ["Separate a setup from a guarantee", "Explain TP, SL and current status", "Know what LuxQuant does and does not claim"],
        "modules": [
            {
                "title": "Start with the contract",
                "summary": "What a LuxQuant call is—and what it is not.",
                "preview": True,
                "lessons": [
                    {
                        "title": "What you get — and what you don't",
                        "type": "slides",
                        "minutes": 4,
                        "summary": "The product contract in four minutes.",
                        "blocks": _blocks(
                            {"type": "hero", "eyebrow": "The contract", "title": "A call is a structured scenario, not a promise", "body": "LuxQuant gives you a timestamped setup, levels, status and a public outcome trail. Your execution, timing and risk still belong to you."},
                            {"type": "compare", "title": "Keep these separate", "left": {"label": "LuxQuant provides", "items": ["Pair and direction", "Entry zone", "Targets and stop", "Live status and history"]}, "right": {"label": "LuxQuant does not provide", "items": ["Guaranteed profit", "Automatic position sizing", "A reason to chase price", "Financial advice"]}},
                            {"type": "check", "question": "If price has already run far beyond entry, is the original call automatically a good new entry?", "options": ["Yes", "No—reassess the current structure"], "answer": 1, "explanation": "The call records the original setup. A later entry is a new decision at a different price and risk profile."}
                        ),
                    },
                    {
                        "title": "Your first call in 60 seconds",
                        "type": "action",
                        "minutes": 5,
                        "summary": "Pair, side, entry, targets, stop, then status.",
                        "blocks": _blocks(
                            {"type": "steps", "title": "The six-point scan", "items": ["Confirm pair and long/short side", "Read the called time", "Locate entry or entry zone", "Map TP1 through TP4", "Locate SL and invalidation", "Read current status before opening the chart"]},
                            {"type": "callout", "tone": "warning", "title": "Sequence matters", "body": "Chart analysis before checking called time and status often makes an old setup look current."},
                            {"type": "product", "title": "Open Signals", "body": "Choose one call and perform the six-point scan without placing a trade.", "path": "/signals", "cta": "Practice in Signals"}
                        ),
                    },
                ],
            },
            {
                "title": "Targets, stops and status",
                "summary": "Read the ladder without confusing peak movement with realised return.",
                "lessons": [
                    {
                        "title": "What TP1, TP2, TP3 and TP4 mean",
                        "type": "slides",
                        "minutes": 5,
                        "summary": "A ladder of reached levels, not four new entry signals.",
                        "blocks": _blocks(
                            {"type": "timeline", "title": "One call, one outcome trail", "items": [{"label": "Entry", "body": "The setup begins"}, {"label": "TP1", "body": "First target reached"}, {"label": "TP2", "body": "Continuation reached"}, {"label": "TP3/TP4", "body": "Deeper extension—not a fresh call"}]},
                            {"type": "callout", "tone": "info", "title": "Highest reached ≠ realised return", "body": "The public record tells you what level price reached. Your realised result depends on your entry, exits, fees and risk management."}
                        ),
                    },
                    {
                        "title": "Win rate without the marketing fog",
                        "type": "reading",
                        "minutes": 5,
                        "summary": "The exact LuxQuant definition and its limits.",
                        "blocks": _blocks(
                            {"type": "hero", "eyebrow": "Definition", "title": "Win = reached at least TP1", "body": "It does not mean every member made money, or that every later entry was profitable."},
                            {"type": "compare", "title": "Metric vs decision", "left": {"label": "Metric answers", "items": ["Did the published setup reach TP1?", "How often did comparable tags close at each level?"]}, "right": {"label": "Metric cannot answer", "items": ["Is this a good entry right now?", "How much should I risk?", "Will price revisit TP3?"]}}
                        ),
                    },
                ],
            },
        ],
    },
    {
        "slug": "signal-decision-lab",
        "title": "Signal Decision Lab",
        "short_title": "Decision Lab",
        "summary": "Decide whether a live, retesting, or previously successful setup still deserves attention.",
        "description": "Frozen cases built from the exact questions users ask: TP2 below SL, retests after TP1, and confluence such as FVG, OB and sweeps.",
        "category": "Case Lab",
        "level": "intermediate",
        "access_tier": "premium",
        "featured": True,
        "skills": ["Retest judgement", "Invalidation", "Confluence", "Context research"],
        "outcomes": ["Distinguish a healthy retest from invalidation", "Use historical tags as evidence, not prediction", "Build a repeatable validation checklist"],
        "modules": [
            {
                "title": "Retest or invalidation?",
                "summary": "The setup can still continue—but the chart must earn that conclusion.",
                "preview": True,
                "lessons": [
                    {
                        "title": "Why a retest can still go higher",
                        "type": "case",
                        "minutes": 8,
                        "summary": "A pullback is information, not an automatic failure.",
                        "blocks": _blocks(
                            {"type": "hero", "eyebrow": "Case principle", "title": "Previously touched TP does not freeze the market", "body": "After TP1 or TP2, price may rebalance, retest demand or liquidity, and continue. It may also fail. The touched target tells you history; current structure tells you validity."},
                            {"type": "compare", "title": "Read the retest", "left": {"label": "Healthier evidence", "items": ["Retest holds above invalidation", "Reaction forms near the planned zone", "Volume or momentum stabilises", "BTC and market context do not directly oppose"]}, "right": {"label": "Weaker evidence", "items": ["Clean close through invalidation", "Repeated rejection below reclaimed level", "Momentum expands against the call", "News/liquidity regime has changed"]}},
                            {"type": "decision", "title": "Your decision", "prompt": "TP2 was reached, price returned near entry, and SL has not been invalidated. What is the honest conclusion?", "options": [{"label": "It must reach TP3", "result": "No target is guaranteed."}, {"label": "The setup may remain valid; confirm current evidence", "result": "Correct. Retest preserves possibility, not certainty."}, {"label": "It is automatically dead", "result": "A pullback alone is not invalidation."}], "answer": 1}
                        ),
                    },
                    {
                        "title": "When price is already below SL",
                        "type": "case",
                        "minutes": 7,
                        "summary": "Separate historical success from present validity.",
                        "blocks": _blocks(
                            {"type": "callout", "tone": "danger", "title": "A breached SL closes the original setup", "body": "Even if TP1 or TP2 was reached earlier, a later move below the published stop means the original risk definition has been invalidated."},
                            {"type": "steps", "title": "What to do next", "items": ["Do not treat the old call as a fresh entry", "Check whether a new structure has formed", "Wait for a new call or build a separately risked thesis", "Use the old result only as historical context"]}
                        ),
                    },
                ],
            },
            {
                "title": "Structure and confluence",
                "summary": "Understand what FVG, OB and sweep counts are actually saying.",
                "lessons": [
                    {
                        "title": "FVG / OB / Sweep decoded",
                        "type": "slides",
                        "minutes": 7,
                        "summary": "Evidence counts and near-entry checks, without false certainty.",
                        "blocks": _blocks(
                            {"type": "compare", "title": "Two different rows", "left": {"label": "FVG / OB / Sweep · 2 / 6 / 0", "items": ["Detected structure counts in the analysed context", "More is not automatically better", "A zero only means none detected by that rule"]}, "right": {"label": "Near entry · FVG: —, OB: ✓", "items": ["Whether that structure is close to the entry zone", "✓ is supporting context", "— is absence, not a rejection signal by itself"]}},
                            {"type": "callout", "tone": "info", "title": "Confluence is a stack", "body": "Structure, trend, momentum, liquidity, BTC context and invalidation should agree enough to justify attention. One checkmark cannot replace the stack."}
                        ),
                    },
                    {
                        "title": "The five-minute validation routine",
                        "type": "action",
                        "minutes": 6,
                        "summary": "A repeatable decision workflow for every filtered result.",
                        "blocks": _blocks(
                            {"type": "steps", "title": "Validate before acting", "items": ["Read called time and current status", "Check whether entry is still relevant", "Confirm SL has not been invalidated", "Read structure and momentum on the chart", "Compare BTC and broader market context", "Open Research, X shortcuts and source links for catalysts", "Define the price that proves your idea wrong"]},
                            {"type": "product", "title": "Research the current context", "body": "Use AI Research and its X shortcuts to check whether a catalyst, narrative or market event changed after the call was published.", "path": "/ai-arena", "cta": "Open AI Research"}
                        ),
                    },
                ],
            },
        ],
    },
    {
        "slug": "luxquant-workflow",
        "title": "The LuxQuant Workflow",
        "short_title": "Workflow",
        "summary": "Connect Signals, Terminal, AI Research, X, Journal and Agent into one disciplined loop.",
        "description": "Advanced product workflow: shortlist, validate, research, plan, observe and review.",
        "category": "LuxQuant",
        "level": "advanced",
        "access_tier": "premium",
        "featured": False,
        "skills": ["Multi-tool workflow", "Research", "Review"],
        "outcomes": ["Move from shortlist to decision", "Document why a setup was accepted or rejected", "Use automation only after the thesis is explicit"],
        "modules": [
            {
                "title": "From shortlist to evidence",
                "summary": "Filters narrow the desk; they do not make the decision.",
                "lessons": [
                    {
                        "title": "Hunt Full TP and Strongest Setups",
                        "type": "slides",
                        "minutes": 6,
                        "summary": "Historical tags identify a useful shortlist, not guaranteed continuation.",
                        "blocks": _blocks(
                            {"type": "hero", "eyebrow": "Shortlist", "title": "The filter changes where you look—not what the market owes you", "body": "Hunt Full TP uses entry-time tags whose closed calls historically reached TP3/TP4 more often. Strongest Setups prioritises current multi-factor quality. Both still require live validation."},
                            {"type": "callout", "tone": "warning", "title": "Open calls are not in the historical bars", "body": "The distribution describes closed outcomes. An open signal can still resolve differently."}
                        ),
                    },
                    {
                        "title": "Research, decide, journal",
                        "type": "action",
                        "minutes": 8,
                        "summary": "The complete LuxQuant review loop.",
                        "blocks": _blocks(
                            {"type": "steps", "title": "One disciplined loop", "items": ["Shortlist in Signals", "Validate structure in Terminal", "Research catalysts and X context", "Write entry, invalidation and no-trade condition", "Observe or execute outside LuxQuant", "Review outcome in Journal and public track record"]},
                            {"type": "product", "title": "Write the thesis", "body": "Record why the setup is valid, what would invalidate it, and what new evidence would make you stand aside.", "path": "/journal", "cta": "Open Journal"}
                        ),
                    },
                ],
            }
        ],
    },
]

CATALOG.append(MAXIMIZE_CALLS_COURSE)


def seed_learning_catalog(db: Session) -> int:
    created = 0
    for c_order, spec in enumerate(CATALOG):
        course = db.query(LearningCourse).filter(LearningCourse.slug == spec["slug"]).first()
        if course is None:
            course = LearningCourse(
                slug=spec["slug"],
                title=spec["title"],
                short_title=spec.get("short_title"),
                summary=spec.get("summary"),
                description=spec.get("description"),
                category=spec.get("category", "LuxQuant"),
                level=spec.get("level", "beginner"),
                access_tier=spec.get("access_tier", "free"),
                status="published",
                is_featured=spec.get("featured", False),
                sort_order=c_order,
                skills_json=json.dumps(spec.get("skills", [])),
                outcomes_json=json.dumps(spec.get("outcomes", [])),
            )
            db.add(course)
            db.flush()
            created += 1
        if db.query(LearningModule).filter(LearningModule.course_id == course.id).first():
            continue
        total = 0
        for m_order, m_spec in enumerate(spec.get("modules", [])):
            module = LearningModule(
                course_id=course.id,
                slug=_slug(m_spec["title"]),
                title=m_spec["title"],
                summary=m_spec.get("summary"),
                sort_order=m_order,
                is_preview=m_spec.get("preview", False),
            )
            db.add(module)
            db.flush()
            module_minutes = 0
            for l_order, lesson in enumerate(m_spec.get("lessons", [])):
                mins = int(lesson.get("minutes", 4))
                db.add(LearningLesson(
                    module_id=module.id,
                    slug=_slug(lesson["title"]),
                    title=lesson["title"],
                    summary=lesson.get("summary"),
                    lesson_type=lesson.get("type", "slides"),
                    level=spec.get("level", "beginner"),
                    access_tier="inherit",
                    status="published",
                    sort_order=l_order,
                    estimated_minutes=mins,
                    content_json=lesson.get("blocks", "[]"),
                    version=1,
                ))
                module_minutes += mins
            module.estimated_minutes = module_minutes
            total += module_minutes
        course.estimated_minutes = total
    db.commit()
    return created
