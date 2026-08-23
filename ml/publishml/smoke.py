"""
Synthetic end-to-end smoke test for the whole pipeline.

WHY THIS EXISTS
---------------
Collecting real data needs a YouTube API key and a day of quota. Until that key
exists, every stage after `collect` is untested code. This module fabricates raw
files with the same shape the collector writes - channels, videos, and real JPEG
thumbnails - so `labels -> thumbs -> train -> export -> evaluate -> recommend`
can be run start to finish and proven to work.

THE DATA IS FAKE AND SAYS SO
----------------------------
It writes into a SEPARATE data directory (`ml/data-smoke`) so it can never be
confused with, or mixed into, collected data. Every channel id starts with
`SMOKE`, and the model card generated from it carries the fake row count. Nothing
here should ever reach the app.

WHAT IT PROVES
--------------
Views are generated from a known function of a few features - title length near
55, a face in the thumbnail, moderate text area, chapters in the description -
plus a large multiplicative noise term and a per-channel scale factor. So there
IS real signal to find, and a working pipeline should recover a clearly positive
Spearman on the holdout. If it comes back near zero, the pipeline is broken, not
the data. That is a much stronger check than "it ran without raising".
"""

from __future__ import annotations

import json
import math
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

# The data directory has to be redirected BEFORE config is imported, because
# config resolves its paths at import time and creates them.
os.environ.setdefault("PUBLISHML_DATA", str(Path(__file__).resolve().parent.parent / "data-smoke"))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from . import config  # noqa: E402

RNG = random.Random(20260821)
NP_RNG = np.random.default_rng(20260821)

TITLE_BITS = [
    "How to {verb} {noun} in {n} Minutes",
    "{n} {noun} Mistakes Everyone Makes",
    "Why Your {noun} Is {adj} (And How To Fix It)",
    "I Tried {verb}ing {noun} For {n} Days",
    "The {adj} Guide To {noun}",
    "{noun}: What Nobody Tells You",
    "Stop {verb}ing Your {noun} Like This",
    "{adj} {noun} Setup Tour {n}",
    "{verb} {noun} - Full Walkthrough",
    "This {noun} Changed How I {verb}",
]
VERBS = ["build", "fix", "learn", "cook", "train", "edit", "plan", "record", "paint", "ship"]
NOUNS = ["workflow", "kitchen", "camera", "budget", "routine", "studio", "garden", "code", "bike", "desk"]
ADJS = ["complete", "honest", "brutal", "simple", "minimal", "ultimate", "quiet", "cheap"]


def synth_title() -> str:
    return (
        RNG.choice(TITLE_BITS)
        .replace("{verb}", RNG.choice(VERBS))
        .replace("{noun}", RNG.choice(NOUNS))
        .replace("{adj}", RNG.choice(ADJS))
        .replace("{n}", str(RNG.choice([3, 5, 7, 10, 14, 30, 2026])))
    )


def synth_thumbnail(path: Path, brightness: int, has_face: bool, text_rows: int) -> None:
    """
    A real JPEG with the properties the feature extractor measures.

    Not noise: a background wash, an optional skin-toned ellipse where a face
    would be, and optional white-on-black caption bars. That way `thumbs.py` is
    exercised on images whose measured features actually vary in the intended
    direction, rather than on random pixels where every feature is the same.
    """
    img = Image.new("RGB", (480, 270), (brightness, brightness // 2 + 20, 200 - brightness // 2))
    draw = ImageDraw.Draw(img)
    for _ in range(RNG.randint(3, 12)):
        x, y = RNG.randint(0, 470), RNG.randint(0, 260)
        draw.rectangle(
            [x, y, x + RNG.randint(10, 90), y + RNG.randint(10, 70)],
            fill=(RNG.randint(0, 255), RNG.randint(0, 255), RNG.randint(0, 255)),
        )
    if has_face:
        cx, cy = RNG.randint(120, 360), RNG.randint(90, 180)
        draw.ellipse([cx - 55, cy - 70, cx + 55, cy + 70], fill=(226, 178, 148))
    for i in range(text_rows):
        y = 20 + i * 60
        draw.rectangle([30, y, 450, y + 42], fill=(0, 0, 0))
        for x in range(40, 440, 26):
            draw.rectangle([x, y + 8, x + 16, y + 34], fill=(255, 255, 255))
    img.save(path, format="JPEG", quality=80)


def generate(channels: int = 220, per_channel: int = 26) -> dict[str, int]:
    """Write synthetic channels.jsonl, videos.jsonl, and thumbnail JPEGs."""
    now = datetime.now(timezone.utc)
    channel_rows = []
    video_rows = []

    for c in range(channels):
        cid = f"SMOKE_CHANNEL_{c:04d}"
        subs = int(10 ** RNG.uniform(2.5, 6.2))
        # Category is fixed per channel, as it effectively is in reality, and drawn
        # from a small set so cells reach the MIN_CELL threshold.
        category = RNG.choice(["22", "27", "28", "26", "20", "24"])
        # A per-channel scale, so the channel-relative label has something real to
        # divide out. Without this the ratio is 1.0 everywhere and the label is noise.
        scale = 10 ** RNG.uniform(2.0, 5.0)
        channel_rows.append(
            {
                "id": cid,
                "title": f"Smoke Channel {c}",
                "publishedAt": (now - timedelta(days=RNG.randint(400, 4000))).isoformat(),
                "subscribers": subs,
                "videoCount": per_channel + RNG.randint(0, 200),
                "totalViews": int(subs * RNG.uniform(20, 400)),
                "uploadsPlaylist": f"UUSMOKE{c:04d}",
                "topics": [],
                "hydrated": True,
                "harvested": True,
            }
        )

        for v in range(per_channel):
            vid = f"SMOKE{c:04d}{v:03d}"
            title = synth_title()
            age = RNG.randint(config.MIN_AGE_DAYS + 5, config.MAX_AGE_DAYS - 5)
            duration = RNG.choice([RNG.randint(180, 2400)] * 9 + [RNG.randint(15, 58)])
            has_face = RNG.random() < 0.5
            text_rows = RNG.choice([0, 1, 1, 2, 3])
            brightness = RNG.randint(40, 220)
            chapters = RNG.choice([0, 0, 0, 3, 5, 8])

            desc_lines = [f"{title} - everything in one place."]
            for i in range(chapters):
                desc_lines.append(f"{i}:{(i * 7) % 60:02d} Part {i + 1}")
            if RNG.random() < 0.6:
                desc_lines.append("Subscribe for more. https://example.com/newsletter")
            description = "\n".join(desc_lines)

            # The known generative relationship. Everything in here is a feature the
            # extractor computes, so the model has a fair chance of recovering it.
            quality = (
                1.0
                - 0.010 * abs(len(title) - 55)          # titles near 55 chars do best
                + (0.35 if has_face else 0.0)           # a face helps
                - 0.16 * abs(text_rows - 1)             # one caption band, not three
                + 0.05 * min(chapters, 5)               # chapters help a little
                + 0.20 * (1 if any(ch.isdigit() for ch in title) else 0)
                - 0.0009 * abs(brightness - 150)
            )
            # Multiplicative lognormal noise, sd well above the effect sizes above,
            # because that is what real view counts look like. A pipeline that only
            # works on clean data is not a working pipeline.
            views = max(1, int(scale * math.exp(quality) * math.exp(NP_RNG.normal(0, 0.85))))

            thumb_path = config.THUMB_DIR / f"{vid}.jpg"
            if not thumb_path.exists():
                synth_thumbnail(thumb_path, brightness, has_face, text_rows)

            published = now - timedelta(days=age)
            video_rows.append(
                {
                    "id": vid,
                    "channelId": cid,
                    "channelTitle": f"Smoke Channel {c}",
                    "title": title,
                    "description": description,
                    "tags": [RNG.choice(NOUNS) for _ in range(RNG.randint(0, 14))],
                    "categoryId": category,
                    "publishedAt": published.isoformat().replace("+00:00", "Z"),
                    "liveContent": "none",
                    "thumbnailUrl": f"https://example.invalid/{vid}.jpg",
                    "thumbnailWidth": 480,
                    "thumbnailHeight": 270,
                    "views": views,
                    "likes": int(views * RNG.uniform(0.01, 0.06)),
                    "comments": int(views * RNG.uniform(0.0005, 0.004)),
                    "duration": f"PT{duration // 60}M{duration % 60}S",
                    "definition": "hd",
                    "caption": RNG.random() < 0.35,
                    "licensedContent": False,
                    "madeForKids": False,
                    "license": "youtube",
                    "topics": [],
                    "collectedAt": now.isoformat(),
                    "_smoke": True,
                }
            )

    with config.CHANNELS_JSONL.open("w", encoding="utf-8") as fh:
        for row in channel_rows:
            fh.write(json.dumps(row, separators=(",", ":")) + "\n")
    with config.VIDEOS_JSONL.open("w", encoding="utf-8") as fh:
        for row in video_rows:
            fh.write(json.dumps(row, separators=(",", ":")) + "\n")

    return {"channels": len(channel_rows), "videos": len(video_rows)}


def main() -> int:
    print(f"data dir: {config.DATA_DIR}")
    counts = generate()
    print(f"generated {counts['videos']} synthetic videos across {counts['channels']} channels")
    print(f"thumbnails: {sum(1 for _ in config.THUMB_DIR.glob('*.jpg'))}")
    print("\nnow run, with the same PUBLISHML_DATA set:")
    print("  python -m publishml.thumbs")
    print("  python -m publishml.labels")
    print("  python -m publishml.train")
    print("  python -m publishml.export")
    print("  python -m publishml.evaluate")
    print("  python -m publishml.recommend")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
