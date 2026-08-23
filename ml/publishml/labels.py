"""
Label construction: turn raw view counts into something a model can learn from.

THE PROBLEM WITH VIEWS
----------------------
Raw views are mostly a fact about the channel, not the video. A mediocre video on
a 2M-subscriber channel outperforms an excellent video on a 2k-subscriber channel
by two orders of magnitude. Train on raw views and the model learns "be famous",
which is true, useless, and impossible to act on.

THE LABEL USED HERE
-------------------
Three transforms, in order:

1. CHANNEL-RELATIVE RATIO. `views / median(views of that channel's other
   harvested videos in-band)`. This divides out subscriber count, niche size,
   language, and the channel's general appeal, leaving the part that varies
   between one video and the next on the SAME channel - which is exactly the part
   a title and thumbnail control.

   The median, not the mean: one 50x breakout in a channel's history would drag a
   mean denominator up and make every other video look like a failure.

   Leave-one-out: a video is never part of its own denominator. Without this, a
   channel with 8 videos has each video contributing 1/8 of the thing it is being
   measured against, which shrinks every ratio toward 1 and flattens the signal.

2. LOG. Ratios are multiplicative and heavily right-skewed - the floor is 0 and
   the ceiling is 50x. log makes "half as well as usual" and "twice as well as
   usual" equally distant from average, which is what a squared-error objective
   needs to be sane.

3. PERCENTILE RANK WITHIN (category x channel-size bucket). The final target is
   0-100. This makes the model's output directly comparable to a Publish Score
   and, more importantly, it removes the between-niche difference in how spread
   out those ratios are: a 2x in News is a different achievement from a 2x in
   Music, and ranking inside the cell handles that without needing to know why.

WHAT IS THROWN AWAY, AND WHY
----------------------------
  - videos younger than MIN_AGE_DAYS: still climbing, not comparable
  - videos older than MAX_AGE_DAYS: optimised for a different platform
  - channels with fewer than MIN_VIDEOS_PER_CHANNEL in-band videos: the median
    denominator is noise
  - live broadcasts and premieres: views mean something different for them
  - cells with fewer than MIN_CELL rows: a percentile over 4 rows is theatre

Every one of those exclusions is counted and reported, because "we trained on N
videos" is only an honest sentence if N is the number that survived.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from . import config, features
from .collect import read_jsonl

# A percentile rank needs enough neighbours to mean anything. Below this the cell
# is dropped rather than ranked - a "top 10%" computed over 6 videos is a lie
# with a number attached.
MIN_CELL = 40


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_channels() -> dict[str, dict[str, Any]]:
    """
    Latest row per channel id.

    The file is append-only and a channel appears up to three times (discovery
    stub, hydrated, harvested), so later rows are merged over earlier ones.
    """
    out: dict[str, dict[str, Any]] = {}
    for row in read_jsonl(config.CHANNELS_JSONL):
        cid = row.get("id")
        if cid:
            out[cid] = {**out.get(cid, {}), **row}
    return out


def load_thumb_features() -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for row in read_jsonl(config.THUMB_FEATURES_JSONL):
        vid = row.pop("id", None)
        if vid:
            row.pop("detector", None)
            out[vid] = {k: float(v) for k, v in row.items()}
    return out


def _percentile_ranks(values: list[float]) -> list[float]:
    """
    Mid-rank percentile in 0-100, ties averaged.

    Ties matter here: whole clusters of videos share a view count in small
    channels, and giving them different ranks would teach the model to separate
    rows that are actually identical.
    """
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    n = len(values)
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        # Average rank of the tied group, mapped to 0-100.
        mid = (i + j) / 2.0
        pct = 100.0 * mid / max(1, n - 1)
        for k in range(i, j + 1):
            ranks[order[k]] = pct
        i = j + 1
    return ranks


def build(now: datetime | None = None) -> dict[str, Any]:
    """Join everything, label it, and write `build/dataset.jsonl`."""
    now = now or datetime.now(timezone.utc)
    channels = load_channels()
    thumbs = load_thumb_features()

    dropped: dict[str, int] = defaultdict(int)
    by_channel: dict[str, list[dict[str, Any]]] = defaultdict(list)
    total_seen = 0

    for video in read_jsonl(config.VIDEOS_JSONL):
        total_seen += 1
        published = _parse(video.get("publishedAt"))
        if not published:
            dropped["no publish date"] += 1
            continue
        age = (now - published).total_seconds() / 86400.0
        if age < config.MIN_AGE_DAYS:
            dropped["too new"] += 1
            continue
        if age > config.MAX_AGE_DAYS:
            dropped["too old"] += 1
            continue
        if video.get("liveContent") not in (None, "none", ""):
            dropped["live/premiere"] += 1
            continue
        if int(video.get("views", 0) or 0) <= 0:
            dropped["zero views"] += 1
            continue
        channel = channels.get(video.get("channelId", ""))
        if not channel or not channel.get("hydrated"):
            dropped["channel not hydrated"] += 1
            continue
        video["_age"] = age
        video["_channel"] = channel
        by_channel[video["channelId"]].append(video)

    rows: list[dict[str, Any]] = []
    for cid, videos in by_channel.items():
        # Shorts and long-form get separate denominators. A channel that posts
        # both would otherwise have its shorts measured against its long-form
        # median, which says nothing about either.
        for is_short in (False, True):
            group = [
                v for v in videos
                if (0 < features.duration_seconds(v.get("duration")) <= config.SHORTS_MAX_SECONDS) == is_short
            ]
            if len(group) < config.MIN_VIDEOS_PER_CHANNEL:
                dropped["channel too small"] += len(group)
                continue

            views = [float(v.get("views", 0) or 0) for v in group]
            for idx, video in enumerate(group):
                others = views[:idx] + views[idx + 1:]
                others.sort()
                mid = len(others) // 2
                median = others[mid] if len(others) % 2 else (others[mid - 1] + others[mid]) / 2.0
                if median <= 0:
                    dropped["zero median"] += 1
                    continue

                ratio = views[idx] / median
                channel = video["_channel"]
                thumb = thumbs.get(video["id"])
                row = features.extract(video, channel, thumb, now=now)
                rows.append(
                    {
                        "id": video["id"],
                        "channelId": cid,
                        "publishedAt": video["publishedAt"],
                        "category": config.CATEGORIES.get(str(video.get("categoryId")), "Other"),
                        "sizeBucket": config.size_bucket(int(channel.get("subscribers", 0) or 0)),
                        "isShorts": is_short,
                        "views": views[idx],
                        "channelMedian": median,
                        "ratio": ratio,
                        "logRatio": math.log(ratio),
                        "features": row,
                    }
                )

    # Percentile-rank within each (category, size bucket, form) cell.
    cells: dict[tuple[str, str, bool], list[int]] = defaultdict(list)
    for i, row in enumerate(rows):
        cells[(row["category"], row["sizeBucket"], row["isShorts"])].append(i)

    kept: list[dict[str, Any]] = []
    for cell, idxs in cells.items():
        if len(idxs) < MIN_CELL:
            dropped["cell too small"] += len(idxs)
            continue
        ranks = _percentile_ranks([rows[i]["logRatio"] for i in idxs])
        for rank, i in zip(ranks, idxs):
            rows[i]["target"] = rank
            rows[i]["cell"] = f"{cell[0]}|{cell[1]}|{'short' if cell[2] else 'long'}"
            kept.append(rows[i])

    kept.sort(key=lambda r: r["publishedAt"])
    out_path = config.BUILD_DIR / "dataset.jsonl"
    with out_path.open("w", encoding="utf-8") as fh:
        for row in kept:
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")

    summary = {
        "videosSeen": total_seen,
        "rowsKept": len(kept),
        "channels": len({r["channelId"] for r in kept}),
        "cells": len({r["cell"] for r in kept}),
        "withThumbnail": sum(1 for r in kept if r["features"].get("has_thumb")),
        "shorts": sum(1 for r in kept if r["isShorts"]),
        "dateRange": [kept[0]["publishedAt"], kept[-1]["publishedAt"]] if kept else None,
        "dropped": dict(sorted(dropped.items(), key=lambda kv: -kv[1])),
        "builtAt": now.isoformat(),
        "featureCount": len(features.feature_names()),
        "minCell": MIN_CELL,
    }
    (config.BUILD_DIR / "dataset-summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the labelled training set.")
    parser.parse_args(argv)
    summary = build()
    print(json.dumps(summary, indent=2))
    if summary["rowsKept"] == 0:
        print(
            "\nNo rows survived. Collect more data first:\n"
            "  python -m publishml.collect\n"
            f"A cell needs {MIN_CELL} videos and a channel needs "
            f"{config.MIN_VIDEOS_PER_CHANNEL}, so a few hundred videos is not enough."
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
