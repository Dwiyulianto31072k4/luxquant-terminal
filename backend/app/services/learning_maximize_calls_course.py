"""Flagship product-education course for the Learning Studio catalog.

The course teaches a repeatable decision process around LuxQuant calls. It is
deliberately framed around evidence and risk control, never promised returns.
"""

import json


def _blocks(*items):
    return json.dumps(list(items), ensure_ascii=False)


MAXIMIZE_CALLS_COURSE = {
    "slug": "maximize-luxquant-calls",
    "title": "How to Maximize Your Trading With LuxQuant Calls",
    "short_title": "Call Mastery",
    "summary": "Turn each LuxQuant call into a disciplined decision workflow—from first read to final review.",
    "description": "Learn how to read call freshness, judge entry quality, define invalidation, manage the TP ladder, reassess retests, add current research, and review the outcome. Maximizing a call means extracting more useful information and making fewer preventable mistakes—not guaranteeing profit.",
    "category": "LuxQuant",
    "level": "beginner",
    "access_tier": "free",
    "featured": True,
    "skills": [
        "Call triage",
        "Entry-quality judgement",
        "Risk definition",
        "Target management",
        "Retest validation",
        "Context research",
        "Decision journaling",
    ],
    "outcomes": [
        "Read any LuxQuant call in a consistent sequence",
        "Separate a relevant entry from a late or invalidated setup",
        "Translate the published stop into a personal risk decision",
        "Use TP1–TP4 as a management map rather than a promise",
        "Reassess retests with current structure and research",
        "Document accepted, rejected, and completed decisions",
    ],
    "modules": [
        {
            "title": "Read before you act",
            "summary": "Understand the call contract, then perform a fast but complete first read.",
            "preview": True,
            "lessons": [
                {
                    "title": "Maximize the process, not the promise",
                    "type": "slides",
                    "minutes": 6,
                    "summary": "Define what better use of a call really means before discussing entries or targets.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "The objective",
                            "title": "A better call workflow improves decisions—not certainty",
                            "body": "LuxQuant publishes a timestamped scenario with direction, entry, targets, stop, status, and context. The useful edge is the structure and evidence you can inspect. No call can remove volatility, execution differences, fees, slippage, or personal risk.",
                        },
                        {
                            "type": "compare",
                            "title": "Two meanings of maximize",
                            "left": {
                                "label": "Useful meaning",
                                "items": [
                                    "Read the complete plan before looking at profit",
                                    "Avoid entries whose original risk/reward has disappeared",
                                    "Define the condition that proves the idea wrong",
                                    "Use new information when the market changes",
                                    "Review decisions so the process can improve",
                                ],
                            },
                            "right": {
                                "label": "Dangerous meaning",
                                "items": [
                                    "Assume every call must win",
                                    "Increase leverage because a setup looks strong",
                                    "Chase after price has already moved",
                                    "Move or ignore the stop to avoid being wrong",
                                    "Judge quality from one result instead of a repeatable process",
                                ],
                            },
                        },
                        {
                            "type": "steps",
                            "title": "The complete LuxQuant loop",
                            "items": [
                                "Triage the call: pair, side, time, status, and current distance",
                                "Validate the setup: entry relevance, structure, and invalidation",
                                "Research the present: BTC, market regime, catalysts, and X context",
                                "Plan personal risk before considering potential reward",
                                "Manage targets and retests without rewriting the original thesis",
                                "Journal the decision and compare it with the public outcome trail",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "Which result best represents successful use of a LuxQuant call?",
                            "options": [
                                "Taking every call as quickly as possible",
                                "Following a repeatable process, including passing on weak or late setups",
                                "Using the highest leverage on the strongest-looking setup",
                                "Holding every position until TP4",
                            ],
                            "answer": 1,
                            "explanation": "A disciplined no-trade decision can be a successful use of information. The objective is consistent judgement and controlled risk, not maximum activity.",
                        },
                        {
                            "type": "product",
                            "title": "See the complete call, not only the alert",
                            "body": "Open Signals and choose one call. Read every published field and its current status before opening the chart or thinking about an order.",
                            "path": "/signals",
                            "cta": "Open Signals",
                        },
                    ),
                },
                {
                    "title": "The 90-second call scan",
                    "type": "action",
                    "minutes": 8,
                    "summary": "A fixed reading sequence that prevents most interpretation mistakes.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "First-pass routine",
                            "title": "Read in the same order every time",
                            "body": "A fixed sequence reduces the chance that an attractive chart or large target makes you ignore age, status, entry distance, or invalidation. The scan is fast because it is ordered—not because it skips risk.",
                        },
                        {
                            "type": "steps",
                            "title": "Six fields before any decision",
                            "items": [
                                "Pair and venue: confirm the exact market being analysed",
                                "Direction: identify whether the scenario is long or short",
                                "Called time: measure how much market information arrived afterward",
                                "Entry: compare the planned level with current price",
                                "TP1–TP4 and SL: map potential path and original invalidation",
                                "Status: confirm whether it is waiting, active, reached a target, stopped, or otherwise resolved",
                            ],
                        },
                        {
                            "type": "callout",
                            "tone": "warning",
                            "title": "Called time changes the meaning of every other field",
                            "body": "A technically good setup published hours ago may no longer offer the same entry or risk/reward. Always treat the alert and the current market as two different timestamps.",
                        },
                        {
                            "type": "check",
                            "question": "A long call was published three hours ago and price is now close to TP2. What should you check first?",
                            "options": [
                                "How quickly you can enter before TP2",
                                "Whether the current price still offers the original entry and invalidation structure",
                                "Whether TP4 is the largest number",
                                "How many people are discussing the coin",
                            ],
                            "answer": 1,
                            "explanation": "Current entry distance and invalidation determine whether the original setup is still relevant. A valid historical call is not automatically a valid new entry.",
                        },
                        {
                            "type": "product",
                            "title": "Run the scan without trading",
                            "body": "Pick three calls with different statuses. Say the six fields aloud or write them down. The goal is accurate classification, not action.",
                            "path": "/signals",
                            "cta": "Practice the scan",
                        },
                    ),
                },
                {
                    "title": "Fresh, active, reached, or invalidated?",
                    "type": "case",
                    "minutes": 8,
                    "summary": "Use time and status together so yesterday's success does not become today's bad entry.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Status literacy",
                            "title": "The same call can mean different things at different moments",
                            "body": "Before entry, the call is a scenario waiting for confirmation. Near entry, it may be actionable under the original plan. After targets, it becomes a management or retest question. After SL, the original setup is over even if an earlier target was reached.",
                        },
                        {
                            "type": "compare",
                            "title": "Classify before analysing",
                            "left": {
                                "label": "Still deserves live validation",
                                "items": [
                                    "Current price remains near the planned entry",
                                    "The published stop has not been breached",
                                    "The call is waiting or active",
                                    "No major new catalyst has changed the context",
                                ],
                            },
                            "right": {
                                "label": "Treat as history or a new thesis",
                                "items": [
                                    "Price has already travelled through several targets",
                                    "The original stop or invalidation was breached",
                                    "The setup is resolved or materially stale",
                                    "A new market event changed the underlying regime",
                                ],
                            },
                        },
                        {
                            "type": "steps",
                            "title": "A three-clock check",
                            "items": [
                                "Call clock: how long since publication?",
                                "Price clock: what important levels were reached since then?",
                                "Information clock: what market, news, funding, or narrative changes arrived afterward?",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "A call reached TP2 yesterday and later traded below its published SL. How should it be classified today?",
                            "options": [
                                "A guaranteed rebound because TP2 was reached",
                                "The original setup is invalidated; any new idea needs a new thesis and risk definition",
                                "Still active until TP4",
                                "A fresh entry at a better price",
                            ],
                            "answer": 1,
                            "explanation": "Earlier achievement remains part of the record, but a later SL breach ends the original setup. Historical success does not restore present validity.",
                        },
                        {
                            "type": "product",
                            "title": "Compare calls by status",
                            "body": "Open Signals and compare one waiting call, one target-reached call, and one stopped call. Notice how the correct next question changes with status.",
                            "path": "/signals",
                            "cta": "Compare statuses",
                        },
                    ),
                },
            ],
        },
        {
            "title": "Turn the call into your plan",
            "summary": "Judge entry quality and translate published invalidation into personal risk control.",
            "lessons": [
                {
                    "title": "Entry quality: relevant, late, or missed",
                    "type": "case",
                    "minutes": 9,
                    "summary": "Decide whether the original opportunity still exists at the price available to you.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Entry judgement",
                            "title": "A good call can become a poor late entry",
                            "body": "The published entry and stop define an original distance and structure. If current price is far from entry, your upside may be smaller while the distance back to invalidation is larger. That changes the decision even when the call eventually wins.",
                        },
                        {
                            "type": "compare",
                            "title": "Relevant entry vs chase",
                            "left": {
                                "label": "More relevant",
                                "items": [
                                    "Price remains within or close to the planned entry area",
                                    "The original invalidation still makes structural sense",
                                    "There is room before the first target",
                                    "Current evidence still supports the setup",
                                ],
                            },
                            "right": {
                                "label": "More likely a chase",
                                "items": [
                                    "Price is already near or beyond an early target",
                                    "A normal retest would create an unacceptable loss for the new entry",
                                    "The decision is driven by fear of missing out",
                                    "The stop would need to be moved just to make the trade look attractive",
                                ],
                            },
                        },
                        {
                            "type": "steps",
                            "title": "Recalculate from your actual price",
                            "items": [
                                "Mark the price you could realistically receive, including spread and slippage",
                                "Measure distance from that price to the unchanged invalidation",
                                "Measure remaining distance to the next meaningful target",
                                "Check whether the structure still supports that invalidation",
                                "Pass if the new relationship no longer fits your risk limits",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "The original entry was 100, SL was 95, and TP1 was 108. Current price is 107. What changed for a new participant?",
                            "options": [
                                "Nothing—the published call is the same",
                                "The available upside to TP1 shrank while distance to the original SL increased",
                                "Risk disappeared because price moved up",
                                "TP1 automatically becomes the new entry",
                            ],
                            "answer": 1,
                            "explanation": "The historical call is unchanged, but the new participant's actual entry geometry is materially worse. Recalculate from the price available now.",
                        },
                        {
                            "type": "product",
                            "title": "Compare entry with live price",
                            "body": "Open a signal row and explicitly compare the published entry, current price, next target, and original SL before considering the chart narrative.",
                            "path": "/signals",
                            "cta": "Inspect entry distance",
                        },
                    ),
                },
                {
                    "title": "Risk first: size from invalidation",
                    "type": "slides",
                    "minutes": 10,
                    "summary": "Let the maximum acceptable loss constrain exposure before potential reward creates bias.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Risk architecture",
                            "title": "The call publishes a stop; you still choose the risk budget",
                            "body": "A published SL describes where the original setup is considered wrong. It does not know your account, obligations, experience, exchange, fees, or tolerance for loss. Personal exposure must be chosen separately and conservatively.",
                        },
                        {
                            "type": "callout",
                            "tone": "danger",
                            "title": "Leverage amplifies loss as well as gain",
                            "body": "Crypto derivatives can move quickly, and margin rules, liquidation, slippage, and gaps may produce outcomes worse than a simple stop calculation. Never use money required for essential expenses, and do not trade a product you do not understand.",
                        },
                        {
                            "type": "steps",
                            "title": "Risk-budget sequence",
                            "items": [
                                "Decide the maximum account loss you are willing and able to accept before opening the position",
                                "Use the current entry—not the published entry—to measure distance to invalidation",
                                "Estimate exposure so a move to invalidation stays within that loss budget",
                                "Add fees, spread, slippage, funding, and possible gap risk",
                                "Check liquidation distance separately when leverage or margin is involved",
                                "Reduce size or pass if the calculation depends on a perfect stop fill",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "A setup looks exceptionally strong. Which reason justifies increasing risk beyond your predetermined loss limit?",
                            "options": [
                                "A high historical win rate",
                                "Several bullish tags",
                                "A popular X narrative",
                                "None—the risk limit should not be rewritten by excitement",
                            ],
                            "answer": 3,
                            "explanation": "Confidence is not a substitute for risk capacity. Historical quality and confluence can inform selection, but they do not remove loss scenarios.",
                        },
                        {
                            "type": "product",
                            "title": "Write the invalidation before the target",
                            "body": "Use Journal to record the actual entry, invalidation, maximum planned loss, and conditions that would make you pass. This course does not prescribe a personal risk percentage.",
                            "path": "/journal",
                            "cta": "Open Journal",
                        },
                    ),
                },
            ],
        },
        {
            "title": "Manage targets, retests, and failure",
            "summary": "Use the target ladder as a management map and keep history separate from current validity.",
            "lessons": [
                {
                    "title": "Turn the TP ladder into a management map",
                    "type": "slides",
                    "minutes": 9,
                    "summary": "Understand what each reached target proves—and what it does not prove about the next one.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Target discipline",
                            "title": "TP1 through TP4 describe a path, not an obligation",
                            "body": "Each target is a published milestone. Reaching TP1 confirms that price travelled from the setup to the first objective. It does not guarantee TP2, and reaching TP2 does not guarantee TP3 or TP4.",
                        },
                        {
                            "type": "compare",
                            "title": "Public outcome vs personal result",
                            "left": {
                                "label": "LuxQuant can record",
                                "items": [
                                    "The highest published target price reached",
                                    "Whether SL was reached before any target",
                                    "Called time and outcome history",
                                    "Closed-call distributions for comparable tags",
                                ],
                            },
                            "right": {
                                "label": "Depends on the user",
                                "items": [
                                    "Actual fill and fees",
                                    "Partial exits and remaining exposure",
                                    "Use of leverage or margin",
                                    "Whether the published stop was followed",
                                ],
                            },
                        },
                        {
                            "type": "steps",
                            "title": "Plan the ladder before price moves",
                            "items": [
                                "Decide whether and where exposure would be reduced",
                                "Define what happens to remaining risk after an early target",
                                "Avoid inventing a new plan during a fast move",
                                "Reassess only when new structure or information genuinely changes the thesis",
                                "Record actual exits separately from the highest target reached",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "A call reaches TP1 and later returns to entry. Which statement is accurate?",
                            "options": [
                                "Every participant made the same profit",
                                "The call reached its first published milestone; personal outcomes may differ",
                                "The call must later reach TP4",
                                "The original SL no longer matters",
                            ],
                            "answer": 1,
                            "explanation": "The public milestone is objective, but fills and management vary. Later movement also does not erase the need to respect current invalidation.",
                        },
                        {
                            "type": "product",
                            "title": "Audit how targets are counted",
                            "body": "Open Performance and compare the SL, TP1, TP2, TP3, and TP4 buckets. Use the distribution as historical evidence, not a forecast for one open call.",
                            "path": "/performance",
                            "cta": "Open Performance",
                        },
                    ),
                },
                {
                    "title": "Retest after TP1 or TP2: continue, wait, or invalidate?",
                    "type": "case",
                    "minutes": 10,
                    "summary": "A complete frozen case for judging a pullback after early targets.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Frozen case",
                            "title": "Price reached TP2, then returned near entry",
                            "body": "A long call published entry at 0.500, TP1 at 0.520, TP2 at 0.540, TP3 at 0.565, TP4 at 0.600, and SL at 0.470. Price reached TP2, then pulled back to 0.505. The pullback is real, but its meaning is not automatic.",
                        },
                        {
                            "type": "compare",
                            "title": "Evidence that changes the classification",
                            "left": {
                                "label": "May remain a valid retest",
                                "items": [
                                    "Price remains above the original invalidation",
                                    "The supporting structure has not broken",
                                    "Selling pressure weakens into the retest",
                                    "Price stabilises or reclaims a relevant level",
                                    "Current BTC and catalyst context do not contradict the thesis",
                                ],
                            },
                            "right": {
                                "label": "May be failing or invalidated",
                                "items": [
                                    "Price reaches or closes beyond the defined invalidation",
                                    "The supporting market structure breaks",
                                    "Selling pressure expands instead of fading",
                                    "Reclaims repeatedly fail",
                                    "A material event changes the original market regime",
                                ],
                            },
                        },
                        {
                            "type": "steps",
                            "title": "Reassess without hindsight",
                            "items": [
                                "Read the original call and freeze what was known at publication",
                                "Confirm the highest target reached and the current status",
                                "Compare current price with the unchanged invalidation",
                                "Check present structure, momentum, liquidity, BTC, and catalysts",
                                "Classify the setup as intact, uncertain, or invalidated",
                                "Recalculate risk from the current price rather than the old entry",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "Price is near entry after TP2, remains above SL, and current context has not yet been reviewed. What is the honest conclusion?",
                            "options": [
                                "It automatically failed",
                                "It is guaranteed to reach TP3 and TP4",
                                "It may remain valid, but current evidence and risk must be reviewed",
                                "SL can now be ignored because TP2 was reached",
                            ],
                            "answer": 2,
                            "explanation": "A retest preserves possibility, not certainty. Staying above SL is relevant, but current structure and information still need validation.",
                        },
                        {
                            "type": "product",
                            "title": "Research what changed after the call",
                            "body": "Use AI Research and the available X shortcuts to check catalysts, narratives, and market events that arrived after publication. Search for disconfirming evidence as deliberately as supporting evidence.",
                            "path": "/ai-arena",
                            "cta": "Open AI Research",
                        },
                    ),
                },
                {
                    "title": "When the original setup is over",
                    "type": "case",
                    "minutes": 7,
                    "summary": "Recognise invalidation and stop turning an old call into an unplanned new trade.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Invalidation",
                            "title": "An SL breach closes the original thesis",
                            "body": "If the published stop or stated invalidation is breached, the original setup is no longer valid under its own rules. Price may later rebound, but that rebound belongs to a new structure—not retroactive proof that the old stop should have been ignored.",
                        },
                        {
                            "type": "callout",
                            "tone": "danger",
                            "title": "Do not move the definition of wrong after the fact",
                            "body": "Widening or removing the stop because loss feels uncomfortable creates a different risk than the published plan. Leverage can make that change especially damaging.",
                        },
                        {
                            "type": "steps",
                            "title": "After invalidation",
                            "items": [
                                "Mark the original setup as finished",
                                "Separate any new idea from the old call",
                                "Require a new structure, entry, invalidation, and risk budget",
                                "Record whether the original plan was followed",
                                "Review the decision without deleting the loss or rewriting the history",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "A stopped call rebounds strongly the next day. What does the rebound prove?",
                            "options": [
                                "The original SL was meaningless",
                                "The old call should still be counted as active",
                                "Only that a new price move occurred after the original setup was invalidated",
                                "Stops should always be widened",
                            ],
                            "answer": 2,
                            "explanation": "Markets can reverse after invalidation. That does not restore the old thesis or justify ignoring the predefined risk boundary.",
                        },
                        {
                            "type": "product",
                            "title": "Review stopped calls honestly",
                            "body": "Use Performance to inspect stopped calls alongside target-reaching calls. Losses belong in the sample and in the learning process.",
                            "path": "/performance",
                            "cta": "Review outcomes",
                        },
                    ),
                },
            ],
        },
        {
            "title": "Add context without adding bias",
            "summary": "Use filters, Terminal, AI Research, X, and market regime as evidence—not decoration.",
            "lessons": [
                {
                    "title": "A filter is a shortlist, not a verdict",
                    "type": "action",
                    "minutes": 8,
                    "summary": "Understand Hunt Full TP and Strongest Setups before acting on filtered results.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Selection",
                            "title": "Filters improve where you look; validation decides what survives",
                            "body": "Hunt Full TP highlights entry-time tag mixes whose closed calls historically reached deeper targets more often. Strongest Setups prioritises current multi-factor quality. Neither filter can guarantee the outcome of an open call.",
                        },
                        {
                            "type": "compare",
                            "title": "Use the statistic correctly",
                            "left": {
                                "label": "The filter can support",
                                "items": [
                                    "Faster prioritisation across many calls",
                                    "Comparison with relevant closed-call history",
                                    "Visibility into tags present at publication",
                                    "A repeatable shortlist for deeper review",
                                ],
                            },
                            "right": {
                                "label": "The filter cannot decide",
                                "items": [
                                    "Whether current price is still a good entry",
                                    "Whether this open call must match history",
                                    "How much personal risk is appropriate",
                                    "Whether a new catalyst changed the setup",
                                ],
                            },
                        },
                        {
                            "type": "steps",
                            "title": "Shortlist-to-validation workflow",
                            "items": [
                                "Apply one filter and note why the call entered the shortlist",
                                "Check called time, status, entry distance, and SL",
                                "Open the chart and validate present structure",
                                "Check BTC, market regime, and liquidity context",
                                "Research catalysts and contradictory evidence",
                                "Write an accept, wait, or reject decision with reasons",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "A Hunt Full TP result is currently below its published SL. What is the correct interpretation?",
                            "options": [
                                "The historical tag edge overrides SL",
                                "The original setup is invalidated despite the historical shortlist tag",
                                "It must rebound to preserve the filter statistics",
                                "It is automatically the best discounted entry",
                            ],
                            "answer": 1,
                            "explanation": "The filter is historical selection evidence. It does not override present invalidation or turn a resolved setup into a fresh call.",
                        },
                        {
                            "type": "product",
                            "title": "Build a three-call shortlist",
                            "body": "Use Signals filters to select three calls. Validate all three, then record why one deserves attention and why the others should wait or be rejected.",
                            "path": "/signals",
                            "cta": "Open the shortlist",
                        },
                    ),
                },
                {
                    "title": "AI Research and X without confirmation bias",
                    "type": "reading",
                    "minutes": 9,
                    "summary": "Research the present while actively searching for evidence that could disprove your preferred idea.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Research discipline",
                            "title": "More information only helps when the question is good",
                            "body": "Searching only for bullish posts after choosing a long—or only bearish posts after choosing a short—creates confirmation bias. Research should test the thesis, identify new facts, and reveal what the original call could not know yet.",
                        },
                        {
                            "type": "compare",
                            "title": "Evidence search vs narrative collecting",
                            "left": {
                                "label": "Evidence search",
                                "items": [
                                    "Uses timestamps and primary sources where possible",
                                    "Separates fact, interpretation, and promotion",
                                    "Searches for disconfirming evidence",
                                    "Checks whether the information is new to the market",
                                    "Defines what finding would change the decision",
                                ],
                            },
                            "right": {
                                "label": "Narrative collecting",
                                "items": [
                                    "Counts repeated posts as independent confirmation",
                                    "Ignores when the claim was first published",
                                    "Treats engagement as truth",
                                    "Selects only posts aligned with the preferred side",
                                    "Adds confidence without changing invalidation",
                                ],
                            },
                        },
                        {
                            "type": "steps",
                            "title": "Five research questions",
                            "items": [
                                "What changed after the call was published?",
                                "Is the source primary, attributable, and timely?",
                                "Is the information already reflected in price?",
                                "What evidence directly contradicts the thesis?",
                                "Would this finding change entry, invalidation, size, timing, or the decision to pass?",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "Ten X accounts repeat the same unverified rumour. How many independent confirmations does that create?",
                            "options": [
                                "Ten",
                                "At least five",
                                "Potentially only one repeated claim until the underlying source is verified",
                                "Enough to ignore the stop",
                            ],
                            "answer": 2,
                            "explanation": "Repetition is not independent verification. Trace claims back to their origin, timestamp, and evidence before allowing them to change a decision.",
                        },
                        {
                            "type": "product",
                            "title": "Research both sides of one call",
                            "body": "Open AI Research, follow relevant X shortcuts, and write the strongest supporting fact and strongest contradictory fact. If neither is verifiable, label the uncertainty instead of filling the gap with confidence.",
                            "path": "/ai-arena",
                            "cta": "Research the context",
                        },
                    ),
                },
            ],
        },
        {
            "title": "Run the full workflow",
            "summary": "Combine selection, validation, research, risk, management, and review in one repeatable operating system.",
            "lessons": [
                {
                    "title": "Full case: from Hunt to Journal",
                    "type": "case",
                    "minutes": 12,
                    "summary": "Walk through a complete decision without using the outcome to rewrite what was known at the time.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "End-to-end case",
                            "title": "A strong shortlist candidate still has to earn the decision",
                            "body": "A long call appears in Hunt Full TP. It is 25 minutes old, current price remains near entry, and the published SL has not been breached. Structure looks constructive, but BTC is approaching resistance and an upcoming catalyst may increase volatility. The correct workflow preserves both opportunity and uncertainty.",
                        },
                        {
                            "type": "steps",
                            "title": "Freeze the decision record",
                            "items": [
                                "Selection: record the filter and entry-time tags that created the shortlist",
                                "Triage: capture called time, status, current price, entry, targets, and SL",
                                "Validation: note supporting structure and the exact invalidation",
                                "Context: check BTC, market pulse, liquidity, catalyst timing, and contrary evidence",
                                "Risk: calculate from actual entry and include execution costs and gap risk",
                                "Decision: choose accept, wait, or reject—and write why before the outcome",
                                "Management: follow the prewritten target and invalidation rules",
                                "Review: compare decision quality with the result without confusing the two",
                            ],
                        },
                        {
                            "type": "compare",
                            "title": "Decision quality and outcome are different axes",
                            "left": {
                                "label": "Good process can still lose",
                                "items": [
                                    "Entry was relevant",
                                    "Risk stayed within the chosen limit",
                                    "Invalidation was explicit and followed",
                                    "Current evidence was checked",
                                    "The loss remained an anticipated scenario",
                                ],
                            },
                            "right": {
                                "label": "Bad process can still win",
                                "items": [
                                    "Entry was chased",
                                    "Leverage replaced risk planning",
                                    "SL was moved or ignored",
                                    "Research was selected to confirm a bias",
                                    "A lucky outcome rewarded an unrepeatable decision",
                                ],
                            },
                        },
                        {
                            "type": "check",
                            "question": "The case follows the complete process but eventually hits SL. What should the review focus on first?",
                            "options": [
                                "How to remove all future losses",
                                "Whether the decision followed its evidence, risk limit, and invalidation rules",
                                "Why the filter must be wrong forever",
                                "How far the stop could have been moved",
                            ],
                            "answer": 1,
                            "explanation": "No process eliminates losses. Review whether the decision was repeatable and controlled, then use a larger sample to evaluate the workflow.",
                        },
                        {
                            "type": "product",
                            "title": "Write one pre-outcome decision",
                            "body": "Open Journal and record the shortlist reason, live evidence, contradictory evidence, actual entry, invalidation, risk limit, and decision. Do this before checking how the call later resolves.",
                            "path": "/journal",
                            "cta": "Create the journal entry",
                        },
                    ),
                },
                {
                    "title": "Build your repeatable call routine",
                    "type": "action",
                    "minutes": 8,
                    "summary": "A daily and weekly operating rhythm that turns the course into behaviour.",
                    "blocks": _blocks(
                        {
                            "type": "hero",
                            "eyebrow": "Operating system",
                            "title": "Consistency is the final multiplier",
                            "body": "The value of a checklist appears across repeated decisions. A routine makes it harder for urgency, recent wins, recent losses, or social attention to silently change the rules.",
                        },
                        {
                            "type": "steps",
                            "title": "Daily routine",
                            "items": [
                                "Choose a limited review window instead of reacting to every alert",
                                "Shortlist with one stated filter or selection reason",
                                "Run the 90-second scan on every candidate",
                                "Validate only the candidates that survive triage",
                                "Research present context and at least one contradictory possibility",
                                "Write accept, wait, or reject before any execution",
                                "Record management changes and the final review",
                            ],
                        },
                        {
                            "type": "steps",
                            "title": "Weekly review",
                            "items": [
                                "Count accepted, rejected, missed, and invalidated setups",
                                "Separate process errors from normal market losses",
                                "Look for repeated chasing, oversizing, late research, or rule changes",
                                "Compare personal decisions with the public outcome trail",
                                "Change one process rule only when evidence repeats across a meaningful sample",
                            ],
                        },
                        {
                            "type": "check",
                            "question": "Which weekly finding is most actionable?",
                            "options": [
                                "One well-planned trade lost",
                                "Three different late entries were taken after price had already reached TP1",
                                "One rejected call later reached TP4",
                                "A popular coin received many posts",
                            ],
                            "answer": 1,
                            "explanation": "A repeated controllable behaviour is a stronger process signal than one outcome. The goal is to reduce preventable errors across a sample.",
                        },
                        {
                            "type": "product",
                            "title": "Start with observation mode",
                            "body": "For the next review cycle, journal several calls without trading them. Practise classification, invalidation, and research until the workflow is consistent enough to evaluate honestly.",
                            "path": "/journal",
                            "cta": "Start the routine",
                        },
                    ),
                },
            ],
        },
    ],
}

