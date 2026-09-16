"""Publishing skeleton for Greater Türkiye.

Runnable, and inert on purpose: nothing in this package opens a network connection, and no channel
has a client that could post.  It drafts, validates and explains — a human still does the posting,
and switching a channel on takes a follow-up pull request reviewed against ADR 0007
(human-in-the-loop publishing).  See publishers/README.md.
"""
from __future__ import annotations

__all__ = ["approval", "channels", "message"]
