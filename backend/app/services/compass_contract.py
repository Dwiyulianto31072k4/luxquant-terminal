"""
Compass 2.0 dynamic scenario contract validation.

This module keeps the LLM in the right role: it may draft a BTC scenario map,
but the contract must be structured and deterministic before it can be treated
as active guidance. Resolution is handled later by event/evaluator code from
stored levels and trigger rules, not by the LLM narrative.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.verdict_schema import DynamicScenarioContract


class ContractValidationError(ValueError):
    """Raised when a Compass scenario contract cannot be safely published."""


@dataclass(frozen=True)
class ContractValidationResult:
    ok: bool
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "errors": list(self.errors)}


ALLOWED_DIRECTIONAL_BIAS_PREFIXES = (
    "BULLISH",
    "BEARISH",
    "RANGE",
    "NEUTRAL_RANGE",
    "MEAN_REVERSION",
    "RISK_ON",
    "RISK_OFF",
)


def _as_contract(value: DynamicScenarioContract | dict[str, Any]) -> DynamicScenarioContract:
    if isinstance(value, DynamicScenarioContract):
        return value
    if isinstance(value, dict):
        return DynamicScenarioContract.model_validate(value)
    raise ContractValidationError("scenario_contract must be an object")


def inspect_dynamic_scenario_contract(
    value: DynamicScenarioContract | dict[str, Any] | None,
) -> ContractValidationResult:
    """Return validation errors without throwing."""
    if value is None:
        return ContractValidationResult(False, ("scenario_contract is missing",))

    try:
        contract = _as_contract(value)
    except Exception as exc:  # pydantic includes detailed validation messages
        return ContractValidationResult(False, (f"schema_validation_failed: {exc}",))

    errors: list[str] = []
    ref = float(contract.reference_price)
    bias = contract.primary_bias.upper()

    if not bias.startswith(ALLOWED_DIRECTIONAL_BIAS_PREFIXES):
        errors.append(f"primary_bias unsupported: {contract.primary_bias}")

    if contract.extension_zone.price_low > contract.extension_zone.price_high:
        errors.append("extension_zone price_low must be <= price_high")

    if contract.review_policy.soft_review_after_minutes >= contract.review_policy.stale_after_minutes:
        errors.append("soft review must happen before stale review")

    prob_total = (
        contract.probabilities.primary
        + contract.probabilities.alternative
        + contract.probabilities.risk_tail
    )
    if prob_total < 80 or prob_total > 120:
        errors.append("scenario probabilities should roughly sum to 100")

    target = float(contract.primary_touch.level)
    invalidation = float(contract.invalidation.level)

    if bias.startswith(("BULLISH", "RISK_ON")):
        if target <= ref:
            errors.append("bullish primary_touch must be above reference_price")
        if invalidation >= ref:
            errors.append("bullish invalidation must be below reference_price")
        if "ABOVE" not in contract.confirmation.trigger.upper():
            errors.append("bullish confirmation trigger should close above its level")
        if "BELOW" not in contract.invalidation.trigger.upper():
            errors.append("bullish invalidation trigger should close below its level")

    if bias.startswith(("BEARISH", "RISK_OFF")):
        if target >= ref:
            errors.append("bearish primary_touch must be below reference_price")
        if invalidation <= ref:
            errors.append("bearish invalidation must be above reference_price")
        if "BELOW" not in contract.confirmation.trigger.upper():
            errors.append("bearish confirmation trigger should close below its level")
        if "ABOVE" not in contract.invalidation.trigger.upper():
            errors.append("bearish invalidation trigger should close above its level")

    if bias.startswith(("RANGE", "NEUTRAL_RANGE")):
        lower = min(contract.support.level, contract.invalidation.level, *contract.alternative_path)
        upper = max(contract.primary_touch.level, contract.extension_zone.price_high)
        if not (lower < ref < upper):
            errors.append("range scenario must bracket reference_price")

    return ContractValidationResult(not errors, tuple(errors))


def validate_dynamic_scenario_contract(
    value: DynamicScenarioContract | dict[str, Any] | None,
) -> DynamicScenarioContract:
    """Return a parsed contract or raise ContractValidationError."""
    result = inspect_dynamic_scenario_contract(value)
    if not result.ok:
        raise ContractValidationError("; ".join(result.errors))
    return _as_contract(value)  # parsed once more only on the success path


__all__ = [
    "ContractValidationError",
    "ContractValidationResult",
    "inspect_dynamic_scenario_contract",
    "validate_dynamic_scenario_contract",
]
