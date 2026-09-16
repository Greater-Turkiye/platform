"""`python -m gt_publishers` — inspect channels, draft a post, and be refused when asking to publish.

  channels                       what each channel needs and why it is inert
  draft   --message FILE         render the post for every channel in the message
  check   --message FILE         contract and content checks (this is what CI runs)
  publish --message FILE         the publish path; it explains its refusal and exits 0
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .approval import CONFIRMATION_PHRASE, ApprovalError, check as check_approval
from .channels import CHANNELS, INERT, MANUAL_CHANNELS, deliver
from .message import MessageError, content_findings, parse


def _load(path: Path):
    return parse(json.loads(path.read_text(encoding="utf-8")))


def _targets(msg):
    unknown = [c for c in msg.channels if c not in CHANNELS]
    if unknown:
        raise MessageError(f"unknown channel(s): {', '.join(unknown)}")
    return [CHANNELS[c] for c in msg.channels]


def cmd_channels(args) -> int:
    env = os.environ
    for channel in CHANNELS.values():
        state, reason = channel.readiness(env)
        print(f"{channel.name}  [{state}]  {reason}")
        print(f"  language      {channel.language}")
        print(f"  secrets       {', '.join(channel.secrets) or 'none needed'}  (names only)")
        print(f"  endpoint      {channel.endpoint}")
        print(f"  our limit     {channel.rate_limit.per_hour}/hour, {channel.rate_limit.per_day}/day (UTC)")
        print(f"  their limit   {channel.api_limits}")
        if channel.max_chars:
            print(f"  max length    {channel.max_chars} characters")
        print(f"  notes         {channel.notes}")
        print()
    for name, why in MANUAL_CHANNELS.items():
        print(f"{name}  [manual]  {why}")
    return 0


def cmd_draft(args) -> int:
    msg = _load(args.message)
    for channel in _targets(msg):
        over = channel.overlong(msg)
        print(f"--- {channel.name} ({channel.language})" + (f"  !! {over}" if over else ""))
        print(channel.render(msg))
        print()
    print("Drafts only. Nothing above has been posted, and this tool cannot post it.")
    return 0


def cmd_check(args) -> int:
    msg = _load(args.message)
    findings = content_findings(msg)
    for channel in _targets(msg):
        over = channel.overlong(msg)
        if over:
            findings.append(f"{channel.name}: {over}")
    for f in findings:
        print(f"finding: {f}")
    print(f"{msg.type} {msg.publication_id}: {len(findings)} finding(s)")
    return 1 if findings else 0


def cmd_publish(args) -> int:
    """The shape of the real publish step. It refuses, loudly and for a stated reason."""
    msg = _load(args.message)
    operator = args.operator or os.environ.get("GITHUB_ACTOR")
    try:
        check_approval(msg, args.confirm, operator, os.environ)
        approved = True
        print(f"human approval: reviewer {msg.approved_by}, operator {operator}")
    except ApprovalError as e:
        approved = False
        print(f"human approval: refused — {e}")
    for channel in _targets(msg):
        result = deliver(channel, msg, os.environ, approved=approved)
        print(f"{result.channel}: {result.action} — {result.reason}")
    print("\nNothing was posted." + ("  (package is inert by design)" if INERT else ""))
    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="gt_publishers", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("channels").set_defaults(func=cmd_channels)
    for name, func in (("draft", cmd_draft), ("check", cmd_check), ("publish", cmd_publish)):
        p = sub.add_parser(name)
        p.add_argument("--message", type=Path, required=True, help="a publish message (JSON)")
        if name == "publish":
            p.add_argument("--confirm", help=f"must be exactly: {CONFIRMATION_PHRASE}")
            p.add_argument("--operator", help="who is running this step (defaults to $GITHUB_ACTOR)")
        p.set_defaults(func=func)
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except MessageError as e:
        print(f"invalid message: {e}", file=sys.stderr)
        return 2
