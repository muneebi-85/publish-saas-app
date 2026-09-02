"""
Title, description, tag, duration and metadata features.

TWO RULES SHAPE THIS FILE.

1. EVERY FEATURE IS COMPUTABLE BEFORE PUBLISHING. The model's job is to answer
   "will this do well?" from the things a creator chooses. So there is nothing
   here derived from views, likes, comments, or watch time - those are the label,
   and feeding them back in would produce a model with a beautiful score that
   cannot say anything about an unpublished video.

2. FEATURES SPLIT INTO CONTROLLABLE AND CONTEXT. A creator can rewrite a title;
   they cannot change the category their channel sits in, or how old the video
   is. Only CONTROLLABLE names are eligible for a recommendation, and the context
   features are held fixed when the recommender asks "what if this were
   different?". Getting this wrong produces advice like "publish 200 days
   earlier", which is what most naive versions of this do.

The extractor is mirrored in TypeScript at `src/lib/ml/features.ts`. The two are
kept in step by a parity test that runs both over the same fixtures; if you add a
feature here and not there, that test fails.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any

from . import config

# --- vocabulary -------------------------------------------------------------
# Small, hand-built word lists rather than a learned embedding. A learned
# representation would score better and could not answer "which word should I
# change?", which is the only reason the product needs a title model at all.

POWER_WORDS = {
    "secret", "proven", "ultimate", "essential", "surprising", "shocking",
    "brutal", "honest", "insane", "crazy", "genius", "perfect", "instant",
    "hidden", "forbidden", "banned", "exposed", "revealed", "truth", "myth",
    "mistake", "mistakes", "warning", "danger", "wrong", "stop", "avoid",
    "finally", "actually", "really", "definitive", "complete", "free",
}

CURIOSITY_MARKERS = {
    "why", "how", "what", "when", "who", "which", "nobody", "everyone",
    "before", "after", "until", "unless", "happens", "happened", "went",
    "turns", "learned", "found", "discovered", "reason", "because",
}

URGENCY_WORDS = {
    "now", "today", "tonight", "2024", "2025", "2026", "new", "just", "breaking",
    "update", "latest", "still", "already", "immediately", "quick", "fast",
}

SECOND_PERSON = {"you", "your", "yours", "you're", "youre", "yourself"}

# ASCII `[0-9]`, not Python's Unicode-aware `\d`, in the title-grammar patterns
# (LIST_PREFIX, TOP_N, TIMESTAMP): JS `\d` is ASCII-only, so `٣ tips` produced
# title_starts_number=1 here and 0 in the TS mirror. Aligned on the narrower
# class — changed on BOTH sides together per the parity contract. ISO_DURATION
# keeps `\d` only because it parses YouTube's ASCII-only ISO-8601 durations.
LIST_PREFIX = re.compile(r"^\s*([0-9]{1,3})\s*(?:[.)\-:]|\s)")
# Word boundaries written out instead of `\b`: Python's `\b` is Unicode-aware
# while JS `\b` is ASCII-word based, so "how toüntertake" matched here but not
# in the TS mirror. `(?<![A-Za-z0-9_])…(?![A-Za-z0-9_])` is the same class both
# extractors use for word characters. Changed on BOTH sides together — the
# parity contract requires it.
HOWTO = re.compile(r"(?<![A-Za-z0-9_])how\s+(to|i|we|he|she|they)(?![A-Za-z0-9_])", re.I)
EMOJI = re.compile(
    "[" "\U0001f300-\U0001faff" "\U00002600-\U000027bf" "\U0001f1e6-\U0001f1ff" "←-⇿" "]"
)
BRACKETS = re.compile(r"[\[\](){}|]")
URL = re.compile(r"https?://\S+")
# `[0-9]` for parity with the TS mirror — see the note on LIST_PREFIX.
TIMESTAMP = re.compile(r"^\s*\(?[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\)?", re.M)
# Word characters written as an explicit class rather than `\w`: Python's
# `\w` is Unicode-aware and JS's is ASCII-only, so `#café` matched here but
# not in the TS mirror. `[A-Za-z0-9_]` is the class both extractors agree on.
HASHTAG = re.compile(r"(?:^|\s)#[A-Za-z0-9_]+")
ISO_DURATION = re.compile(r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")

# Features a creator can act on. Anything not in here is context, and the
# recommender is forbidden from suggesting a change to it.
CONTROLLABLE = {
    "title_len", "title_words", "title_caps_ratio", "title_allcaps_words",
    "title_has_number", "title_starts_number", "title_question",
    "title_exclaim", "title_brackets", "title_emoji", "title_colon",
    "title_second_person", "title_power_words", "title_curiosity",
    "title_urgency", "title_howto", "title_list", "title_avg_word_len",
    "title_longest_word", "title_stopword_ratio", "title_truncated",
    "desc_len", "desc_lines", "desc_links", "desc_timestamps",
    "desc_hashtags", "desc_first_line_len", "desc_has_cta",
    "tag_count", "tag_chars", "tag_avg_words",
    "duration_seconds", "duration_log", "is_shorts", "is_hd",
    "has_captions", "publish_hour", "publish_dow", "publish_weekend",
    # Thumbnail features are controllable too - the whole point is to be able to
    # say "add a face" or "cut the text down".
    "thumb_brightness", "thumb_brightness_std", "thumb_contrast",
    "thumb_saturation", "thumb_colorfulness", "thumb_warm_fraction",
    "thumb_red_fraction", "thumb_edge_density", "thumb_text_area",
    "thumb_text_blocks", "thumb_face_area", "thumb_face_count",
    "thumb_skin_fraction", "thumb_center_weight", "thumb_third_offset",
    "thumb_complexity", "thumb_border_fraction",
}

# Held fixed at inference. `age_days_log` is here because it is the single
# strongest predictor of raw views and has nothing to do with video quality:
# including it lets the model stop attributing age to the title, and holding it
# fixed stops the recommender from "advising" a time machine.
CONTEXT = {
    "age_days_log", "channel_subs_log", "channel_videos_log",
    "channel_age_days_log", "made_for_kids", "licensed",
    "thumb_aspect", "has_thumb",
}

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for",
    "with", "is", "it", "this", "that", "as", "by", "from", "was", "are", "be",
}

CTA_PHRASES = (
    "subscribe", "like and", "comment below", "let me know", "follow me",
    "join the", "sign up", "free guide", "check out", "link below", "patreon",
)


def _duration_seconds(iso: str | None) -> int:
    """
    ISO-8601 duration -> seconds.

    YouTube emits `PT4M13S`, `PT1H2M`, `P1DT2H`, and bare `PT0S` for live
    streams that never started. Written out rather than pulled from
    `isodate` because it is nine lines and one fewer dependency.
    """
    if not iso:
        return 0
    m = ISO_DURATION.match(iso.strip())
    if not m:
        return 0
    days, hours, minutes, seconds = (int(x) if x else 0 for x in m.groups())
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


# Public alias: `labels.py` needs the same parse to split shorts from long-form,
# and it must be the exact same function, not a second implementation of it.
duration_seconds = _duration_seconds


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        # Date-only (and any offset-less) input: the TS mirror's `new Date`
        # treats a date-only ISO string as UTC midnight, so Python must too —
        # a naive datetime otherwise crashes the aware-`now` subtraction in
        # the age path, and a naive datetime WITH a time disagrees with JS
        # (which reads it in the machine's local zone — machine-dependent).
        # UTC is the single deterministic contract for both sides.
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _words(text: str) -> list[str]:
    return [w for w in re.split(r"[^A-Za-z0-9'’]+", text) if w]


def title_features(title: str) -> dict[str, float]:
    """Everything derivable from the title string alone."""
    title = title or ""
    words = _words(title)
    lower = [w.lower() for w in words]
    letters = [c for c in title if c.isalpha()]

    return {
        "title_len": float(len(title)),
        "title_words": float(len(words)),
        # Share of letters that are capitals. Distinguishes normal Title Case
        # (~0.15) from ALL CAPS SHOUTING (1.0) without a threshold.
        "title_caps_ratio": (sum(1 for c in letters if c.isupper()) / len(letters)) if letters else 0.0,
        "title_allcaps_words": float(sum(1 for w in words if len(w) > 2 and w.isupper())),
        # `isdecimal()`, NOT `isdigit()`: isdigit() also accepts superscripts
        # (100²), circled (①), and subscripts, which the TS side's `\p{Nd}`
        # rejects — the two extractors disagreed on exactly those titles.
        # isdecimal() is precisely the Nd class, matching TS `\p{Nd}` exactly.
        "title_has_number": float(any(c.isdecimal() for c in title)),
        "title_starts_number": float(bool(LIST_PREFIX.match(title))),
        "title_question": float("?" in title),
        "title_exclaim": float(title.count("!")),
        "title_brackets": float(len(BRACKETS.findall(title))),
        "title_emoji": float(len(EMOJI.findall(title))),
        "title_colon": float(title.count(":") + title.count("|") + title.count(" - ")),
        "title_second_person": float(sum(1 for w in lower if w in SECOND_PERSON)),
        "title_power_words": float(sum(1 for w in lower if w in POWER_WORDS)),
        "title_curiosity": float(sum(1 for w in lower if w in CURIOSITY_MARKERS)),
        "title_urgency": float(sum(1 for w in lower if w in URGENCY_WORDS)),
        "title_howto": float(bool(HOWTO.search(title))),
        "title_list": float(bool(LIST_PREFIX.match(title)) or bool(re.match(r"^\s*top\s+[0-9]", title, re.I))),
        "title_avg_word_len": (sum(len(w) for w in words) / len(words)) if words else 0.0,
        "title_longest_word": float(max((len(w) for w in words), default=0)),
        "title_stopword_ratio": (sum(1 for w in lower if w in STOPWORDS) / len(lower)) if lower else 0.0,
        # YouTube truncates around 60 characters in most surfaces. Past that the
        # tail of the title is invisible to the viewer deciding whether to click.
        "title_truncated": float(len(title) > 60),
    }


def description_features(desc: str) -> dict[str, float]:
    desc = desc or ""
    lines = desc.splitlines()
    first = lines[0] if lines else ""
    low = desc.lower()
    return {
        "desc_len": float(len(desc)),
        "desc_lines": float(len(lines)),
        "desc_links": float(len(URL.findall(desc))),
        # Chapter markers. They change the surface YouTube renders, so they are a
        # real, actionable lever rather than a style preference.
        "desc_timestamps": float(len(TIMESTAMP.findall(desc))),
        "desc_hashtags": float(len(HASHTAG.findall(desc))),
        # Only the first ~150 chars show under the player before "Show more".
        "desc_first_line_len": float(len(first)),
        "desc_has_cta": float(any(p in low for p in CTA_PHRASES)),
    }


def tag_features(tags: list[str] | None) -> dict[str, float]:
    tags = tags or []
    return {
        "tag_count": float(len(tags)),
        "tag_chars": float(sum(len(t) for t in tags)),
        "tag_avg_words": (sum(len(t.split()) for t in tags) / len(tags)) if tags else 0.0,
    }


def extract(video: dict[str, Any], channel: dict[str, Any] | None = None,
            thumb: dict[str, float] | None = None,
            now: datetime | None = None) -> dict[str, float]:
    """
    The full feature row for one video.

    `thumb` is the row from `thumbs.py` if the image was downloaded and
    featurised. When it is missing, the thumbnail features are set to 0 and
    `has_thumb` is 0 - so the model can learn to distrust them for that row
    instead of treating 0 brightness as a black image.
    """
    channel = channel or {}
    now = now or datetime.now(timezone.utc)

    published = _parse_time(video.get("publishedAt"))
    age_days = max(0.0, (now - published).total_seconds() / 86400.0) if published else 0.0
    seconds = _duration_seconds(video.get("duration"))

    row: dict[str, float] = {}
    row.update(title_features(video.get("title", "")))
    row.update(description_features(video.get("description", "")))
    row.update(tag_features(video.get("tags")))

    row["duration_seconds"] = float(seconds)
    # log1p, because the difference between 30s and 90s matters far more than the
    # difference between 30min and 31min, and a raw-seconds split would spend all
    # its resolution on the long tail.
    row["duration_log"] = math.log1p(seconds)
    row["is_shorts"] = float(0 < seconds <= config.SHORTS_MAX_SECONDS)
    row["is_hd"] = float(video.get("definition") == "hd")
    row["has_captions"] = float(bool(video.get("caption")))

    if published:
        # Creator-local time is what matters for scheduling and we do not have
        # the channel's timezone, so this is UTC and the model can only learn a
        # weak global effect. Recorded honestly rather than faked.
        row["publish_hour"] = float(published.hour)
        row["publish_dow"] = float(published.weekday())
        row["publish_weekend"] = float(published.weekday() >= 5)
    else:
        row["publish_hour"] = row["publish_dow"] = row["publish_weekend"] = 0.0

    row["age_days_log"] = math.log1p(age_days)
    row["channel_subs_log"] = math.log1p(float(channel.get("subscribers", 0) or 0))
    row["channel_videos_log"] = math.log1p(float(channel.get("videoCount", 0) or 0))
    channel_started = _parse_time(channel.get("publishedAt"))
    row["channel_age_days_log"] = math.log1p(
        max(0.0, (now - channel_started).total_seconds() / 86400.0) if channel_started else 0.0
    )
    row["made_for_kids"] = float(bool(video.get("madeForKids")))
    row["licensed"] = float(bool(video.get("licensedContent")))

    if thumb:
        for name in CONTROLLABLE | CONTEXT:
            if name.startswith("thumb_") and name in thumb:
                row[name] = float(thumb[name])
        row["has_thumb"] = 1.0
    else:
        for name in sorted(CONTROLLABLE | CONTEXT):
            if name.startswith("thumb_"):
                row[name] = 0.0
        row["has_thumb"] = 0.0

    return row


def feature_names() -> list[str]:
    """
    The column order, fixed and sorted.

    Sorted rather than insertion-ordered so that the Python trainer and the
    TypeScript scorer cannot disagree about column 34 because someone moved a
    line. The exported model carries this list, and the TS side asserts against
    it at load time.
    """
    return sorted(CONTROLLABLE | CONTEXT)
