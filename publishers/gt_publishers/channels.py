"""The channels the project plans, what each one needs, and the rendering of a message for it.

Every channel here is **inert**: it can render a post and say what it would need, and it has no
client that could send one.  `deliver()` always returns a Result and never opens a socket.  Writing a
real client is a separate pull request; see publishers/README.md for what that PR must contain.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from .message import Message

INERT = True  # this package cannot post; flipping this alone changes nothing (there is no client)


@dataclass(frozen=True)
class RateLimit:
    per_hour: int = 4
    per_day: int = 30

    def exceeded(self, recent: list[datetime], now: datetime) -> str | None:
        """`recent` is the channel's earlier post times from the `publications` table."""
        hour = sum(1 for t in recent if now - t < timedelta(hours=1))
        day = sum(1 for t in recent if t.astimezone(timezone.utc).date() == now.astimezone(timezone.utc).date())
        if hour >= self.per_hour:
            return f"{hour} posts in the last hour, limit {self.per_hour}"
        if day >= self.per_day:
            return f"{day} posts today (UTC), limit {self.per_day}"
        return None


@dataclass(frozen=True)
class Channel:
    name: str
    language: str
    secrets: tuple[str, ...]          # names only; values never live in this repository
    endpoint: str                     # what a future client would talk to
    max_chars: int | None = None
    include_archives: bool = True     # false where the post is too short to carry them (see notes)
    rate_limit: RateLimit = field(default_factory=RateLimit)
    api_limits: str = ""              # the provider's own limits, for whoever writes the client
    notes: str = ""

    # --- what the channel needs

    def missing_secrets(self, env: dict) -> list[str]:
        return [name for name in self.secrets if not env.get(name)]

    def readiness(self, env: dict) -> tuple[str, str]:
        missing = self.missing_secrets(env)
        if missing:
            return "inert", f"no {', '.join(missing)} in the environment; nothing to do"
        if not self.secrets:
            return "inert", "no credential needed, but this package has no client either"
        return "inert", "secrets present, but this package has no client: posting is not implemented"

    # --- drafting

    def text_for(self, msg: Message) -> str:
        return msg.text_tr if self.language == "tr" else msg.text_en

    def render(self, msg: Message) -> str:
        """Body plus the source links. Attribution is part of the post, never a reply or a bio link."""
        body = self.text_for(msg).strip()
        links = "\n".join(f"{s.name}: {s.url}" + (f"\n  {s.archive_url}" if self.include_archives else "")
                          for s in msg.sources)
        return f"{body}\n\n{links}"

    def overlong(self, msg: Message) -> str | None:
        rendered = self.render(msg)
        if self.max_chars and len(rendered) > self.max_chars:
            return f"{len(rendered)} characters, {self.name} allows {self.max_chars}"
        return None


TELEGRAM = Channel(
    name="telegram-tr", language="tr",
    secrets=("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL_ID"),
    endpoint="https://api.telegram.org/bot<token>/sendMessage",
    max_chars=4096,
    api_limits="Bot API: ~30 messages/second overall and ~20 messages/minute to one channel.",
    notes=("Needs a bot created with @BotFather and made an administrator of the channel with "
           "'post messages'. The bot token is the only credential; no user account is used."),
)

BLUESKY = Channel(
    name="bluesky-en", language="en",
    secrets=("BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"),
    endpoint="https://bsky.social/xrpc/com.atproto.repo.createRecord",
    max_chars=300, include_archives=False,
    api_limits=("AT Protocol: 1,666 created records/hour and 11,666/day per account; "
                "createSession is rate limited separately, so a session is reused."),
    notes=("Uses an app password, never the account password, and the app password is revocable from "
           "the account settings. 300 graphemes is a hard limit: a long post is refused, never "
           "truncated automatically. The archive link does not fit, so it goes in a reply posted by "
           "the same run; the source link itself always stays in the post."),
)

RSS_RELAY = Channel(
    name="feed", language="tr",
    secrets=(),  # the relay publishes a file; it needs no credential at all
    endpoint="dist/feed.xml + dist/feed.json in Greater-Turkiye/datasets (GitHub Pages)",
    max_chars=None,
    rate_limit=RateLimit(per_hour=60, per_day=500),
    api_limits="None: the feed is a static file rebuilt by the datasets `pages` workflow.",
    notes=("The public feed already works and needs no account: the `datasets` build writes feed.xml, "
           "feed.json and a 7-day feed.md digest. This channel only relays bulletins that have no "
           "record yet; anything with a record reaches the feed by being merged."),
)

CHANNELS: dict[str, Channel] = {c.name: c for c in (TELEGRAM, BLUESKY, RSS_RELAY)}

# Channels the project does not automate, and why.
MANUAL_CHANNELS = {
    "x": "no free API tier since February 2026 (~USD 0.015/post); the bot only produces copy-ready text",
    "instagram": "no suitable free posting path; manual",
    "mastodon": "possible later; not part of this scaffold",
}


@dataclass(frozen=True)
class Result:
    channel: str
    action: str     # always a refusal in this package: never "posted"
    reason: str
    text: str = ""


def deliver(channel: Channel, msg: Message, env: dict, *, approved: bool = False,
            recent: list[datetime] | None = None, now: datetime | None = None) -> Result:
    """Decide what would happen, and do nothing. This function has no network client by design."""
    now = now or datetime.now(timezone.utc)
    text = channel.render(msg)
    if not approved:
        return Result(channel.name, "blocked:not-approved", "no human approval for this run", text)
    missing = channel.missing_secrets(env)
    if missing:
        return Result(channel.name, "skipped:no-secret", f"missing {', '.join(missing)}", text)
    over = channel.overlong(msg)
    if over:
        return Result(channel.name, "blocked:too-long", over, text)
    limited = channel.rate_limit.exceeded(recent or [], now)
    if limited:
        return Result(channel.name, "held:rate-limit", limited, text)
    return Result(channel.name, "blocked:not-implemented",
                  "this skeleton has no client; a reviewed pull request must add one before any post",
                  text)
