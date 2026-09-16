"""The human-approval gate.

ADR 0007: automation only drafts.  A draft becomes postable only when a named reviewer approved it in
the reviewer group *and* a maintainer repeats the confirmation phrase at the moment of posting.  Both
are recorded, so a post can always be traced back to the two humans behind it.
"""
from __future__ import annotations

from dataclasses import dataclass

from .message import Message

# Typed by a maintainer into the workflow's confirmation input. Deliberately awkward: it cannot be
# reached by clicking "Run workflow" and leaving the defaults alone.
CONFIRMATION_PHRASE = "I HAVE READ THIS DRAFT AND APPROVE POSTING"
PAUSED_ENV = "PUBLISH_PAUSED"  # the kill switch, mirroring the KV key `publish:paused`


class ApprovalError(PermissionError):
    """The message is not cleared for posting."""


@dataclass(frozen=True)
class Approval:
    reviewer: str       # who approved the content, from the message
    operator: str       # who is running the publish step now
    phrase_ok: bool


def check(msg: Message, confirmation: str | None, operator: str | None, env: dict) -> Approval:
    """Raise unless both gates are satisfied and the kill switch is off."""
    if str(env.get(PAUSED_ENV, "")).strip() == "1":
        raise ApprovalError("publishing is paused (kill switch); a maintainer must clear it first")
    if not msg.approved_by:
        raise ApprovalError("the message carries no reviewer approval (gate 1)")
    if not operator:
        raise ApprovalError("no operator recorded for this run (gate 2)")
    if confirmation != CONFIRMATION_PHRASE:
        raise ApprovalError("the confirmation phrase was not typed exactly; nothing is posted")
    return Approval(reviewer=msg.approved_by, operator=operator, phrase_ok=True)
