"""
Turn a prediction into advice, by asking the model counterfactual questions.

THE NAIVE VERSION AND WHY IT IS WRONG
-------------------------------------
The obvious approach is: for each feature, nudge it, see if the score rises,
report the ones that helped. That produces garbage, for three reasons.

1. FEATURES MOVE TOGETHER. You cannot change `title_len` without changing
   `title_words`, `title_avg_word_len`, and probably `title_truncated`. Nudging
   one in isolation asks the model about a title that cannot exist, and the model
   answers confidently because nothing stopped it.

2. SOME FEATURES ARE NOT CHOICES. Video age and subscriber count predict views
   enormously well. A single-feature sweep happily advises "have more
   subscribers".

3. EXTRAPOLATION IS FREE AND MEANINGLESS. Trees are flat outside their training
   range, so pushing `title_exclaim` to 40 either does nothing or lands in a leaf
   built from three rows. Either way the number is not evidence.

WHAT THIS MODULE DOES INSTEAD
-----------------------------
Advice is generated at the level of LEVERS: a named edit a creator could actually
make, which moves a defined group of features together to a defined target. The
target is always a percentile drawn from the videos that ALREADY DID WELL in the
same niche cell, so no lever ever proposes a value outside the observed
distribution. Each lever is scored by the model's predicted change, and the ones
that clear a minimum lift are returned, largest first.

The numbers this produces are the model's opinion, not a promise, and the caller
is expected to present them that way.
"""

from __future__ import annotations

import argparse
import json
from typing import Any, Callable

import numpy as np

from . import config, features

# Minimum predicted change, in percentile points, for a lever to be worth saying
# out loud. Below ~1.5 the difference is inside the model's own noise, and a list
# of twelve suggestions each worth 0.3 points is worse than three worth 6.
MIN_LIFT = 1.5

# How many suggestions to return. More than this and the creator stops reading -
# and the tail is always the weakest advice.
MAX_SUGGESTIONS = 6


class Lever:
    """
    One editable thing, and what changing it does to the feature vector.

    `apply` receives the current feature dict and the niche target percentiles and
    returns a NEW dict. It is a function rather than a value because most edits
    are relational - "shorten the title toward 55 characters" has to recompute
    word count and truncation from the new length, not just overwrite one column.
    """

    def __init__(self, key: str, label: str, touches: list[str],
                 apply: Callable[[dict[str, float], dict[str, list[float]]], dict[str, float] | None],
                 advice: str) -> None:
        self.key = key
        self.label = label
        self.touches = touches
        self.apply = apply
        self.advice = advice


def _target(niche: dict[str, list[float]], name: str, current: float, index: int = 2) -> float | None:
    """
    The value to move a feature toward: a percentile of the successful videos.

    Returns None when the niche has no data for this feature (a cell too small to
    have a top-decile distribution), which suppresses the lever rather than
    falling back to a guess.
    """
    stats = niche.get(name)
    if not stats or index >= len(stats):
        return None
    target = float(stats[index])
    return None if abs(target - current) < 1e-9 else target


def _retitle_length(row: dict[str, float], niche: dict[str, list[float]]) -> dict[str, float] | None:
    """Move title length toward the successful median, keeping the rest coherent."""
    current = row.get("title_len", 0.0)
    target = _target(niche, "title_len", current)
    if target is None or abs(target - current) < 4:
        return None
    out = dict(row)
    out["title_len"] = target
    # Word count scales with length at roughly the current words-per-character
    # rate, so the two stay consistent instead of describing an impossible title.
    if current > 0:
        ratio = target / current
        out["title_words"] = max(1.0, round(row.get("title_words", 1.0) * ratio))
        out["title_stopword_ratio"] = row.get("title_stopword_ratio", 0.0)
    out["title_truncated"] = 1.0 if target > 60 else 0.0
    words = max(1.0, out["title_words"])
    out["title_avg_word_len"] = target / words
    return out


def _simple(name: str, index: int = 2, min_delta: float = 0.0) -> Callable[..., dict[str, float] | None]:
    """A lever that moves exactly one feature, for the genuinely independent ones."""

    def apply(row: dict[str, float], niche: dict[str, list[float]]) -> dict[str, float] | None:
        current = row.get(name, 0.0)
        target = _target(niche, name, current, index)
        if target is None or abs(target - current) <= min_delta:
            return None
        out = dict(row)
        out[name] = target
        return out

    return apply


def _thumb_text(row: dict[str, float], niche: dict[str, list[float]]) -> dict[str, float] | None:
    """Text overlay: area and block count move together, so they are one lever."""
    current = row.get("thumb_text_area", 0.0)
    target = _target(niche, "thumb_text_area", current)
    if target is None or abs(target - current) < 0.01:
        return None
    out = dict(row)
    out["thumb_text_area"] = target
    block_target = _target(niche, "thumb_text_blocks", row.get("thumb_text_blocks", 0.0))
    if block_target is not None:
        out["thumb_text_blocks"] = block_target
    return out


def _thumb_face(row: dict[str, float], niche: dict[str, list[float]]) -> dict[str, float] | None:
    """A face is present or it is not; area and count cannot disagree."""
    current_area = row.get("thumb_face_area", 0.0)
    target = _target(niche, "thumb_face_area", current_area)
    if target is None or target <= current_area + 0.01:
        return None
    out = dict(row)
    out["thumb_face_area"] = target
    out["thumb_face_count"] = max(1.0, row.get("thumb_face_count", 0.0))
    return out


def _thumb_contrast(row: dict[str, float], niche: dict[str, list[float]]) -> dict[str, float] | None:
    """Contrast, brightness spread and colourfulness are one grading decision."""
    out = dict(row)
    moved = False
    for name in ("thumb_contrast", "thumb_brightness", "thumb_saturation", "thumb_colorfulness"):
        target = _target(niche, name, row.get(name, 0.0))
        if target is not None:
            out[name] = target
            moved = True
    return out if moved else None


LEVERS = [
    Lever("title_length", "Title length", ["title_len", "title_words"], _retitle_length,
          "Rewrite the title to about {target:.0f} characters - that is the median "
          "length among videos that reached the top 10% of your niche."),
    Lever("title_number", "Number in the title", ["title_has_number"],
          _simple("title_has_number", min_delta=0.4),
          "Put a concrete number in the title (a count, a price, a year, a result)."),
    Lever("title_question", "Question framing", ["title_question"],
          _simple("title_question", min_delta=0.4),
          "Frame the title as a question the viewer wants answered."),
    Lever("title_second_person", "Speak to the viewer", ["title_second_person"],
          _simple("title_second_person", min_delta=0.4),
          "Address the viewer directly - 'you' or 'your' in the title."),
    Lever("title_curiosity", "Open a gap", ["title_curiosity"],
          _simple("title_curiosity", min_delta=0.4),
          "Add a curiosity gap: what, why, or what happened, without answering it."),
    Lever("title_caps", "Capitalisation", ["title_caps_ratio"],
          _simple("title_caps_ratio", min_delta=0.05),
          "Adjust capitalisation toward {target:.0%} of letters - shouting reads as "
          "spam in this niche, and all-lowercase reads as unfinished."),
    Lever("title_brackets", "Bracketed qualifier", ["title_brackets"],
          _simple("title_brackets", min_delta=0.4),
          "Add a bracketed qualifier - [2026], (full guide), (no code) - to carry "
          "detail without lengthening the main clause."),
    Lever("desc_first_line", "First description line", ["desc_first_line_len"],
          _simple("desc_first_line_len", min_delta=15),
          "Rewrite the first line of the description to about {target:.0f} "
          "characters. It is the only part shown before 'Show more'."),
    Lever("desc_timestamps", "Chapters", ["desc_timestamps"],
          _simple("desc_timestamps", min_delta=1),
          "Add {target:.0f} timestamped chapters. They change the surface YouTube "
          "renders and give the viewer a reason to believe the video is organised."),
    Lever("desc_length", "Description depth", ["desc_len"],
          _simple("desc_len", min_delta=150),
          "Expand the description toward {target:.0f} characters - it is what search "
          "indexes and what the top performers in your niche write."),
    Lever("tags", "Tags", ["tag_count"], _simple("tag_count", min_delta=2),
          "Use about {target:.0f} tags."),
    Lever("duration", "Length", ["duration_seconds", "duration_log"],
          _simple("duration_seconds", min_delta=60),
          "Videos in the top decile of your niche run about {target:.0f} seconds."),
    Lever("captions", "Captions", ["has_captions"], _simple("has_captions", min_delta=0.4),
          "Upload a caption track. It is indexed, and it is the single cheapest "
          "thing on this list."),
    Lever("thumb_text", "Thumbnail text", ["thumb_text_area", "thumb_text_blocks"], _thumb_text,
          "Change how much of the thumbnail is text - the successful ones in your "
          "niche sit near {target:.0%} of the frame."),
    Lever("thumb_face", "Face in the thumbnail", ["thumb_face_area", "thumb_face_count"], _thumb_face,
          "Put a face in the thumbnail at around {target:.0%} of the frame."),
    Lever("thumb_grade", "Thumbnail contrast and colour",
          ["thumb_contrast", "thumb_brightness", "thumb_saturation", "thumb_colorfulness"],
          _thumb_contrast,
          "Push contrast and saturation toward what works in your niche - the "
          "thumbnail competes at 168px wide on a phone."),
    Lever("thumb_composition", "Thumbnail composition", ["thumb_third_offset"],
          _simple("thumb_third_offset", min_delta=0.05),
          "Move the subject off dead centre, toward a rule-of-thirds intersection."),
]


def duration_coupled(row: dict[str, float]) -> dict[str, float]:
    """Keep `duration_log` and `is_shorts` consistent after a duration change."""
    import math

    seconds = row.get("duration_seconds", 0.0)
    row["duration_log"] = math.log1p(max(0.0, seconds))
    row["is_shorts"] = 1.0 if 0 < seconds <= config.SHORTS_MAX_SECONDS else 0.0
    return row


def recommend(
    predict: Callable[[dict[str, float]], float],
    row: dict[str, float],
    niche_top: dict[str, list[float]],
    max_suggestions: int = MAX_SUGGESTIONS,
    min_lift: float = MIN_LIFT,
) -> list[dict[str, Any]]:
    """
    Rank the levers by the model's predicted lift.

    `predict` takes a feature dict and returns a score, so this module never
    imports LightGBM and the same code path serves both the Python trainer's
    sanity check and any other caller.
    """
    base = predict(row)
    out: list[dict[str, Any]] = []

    for lever in LEVERS:
        changed = lever.apply(row, niche_top)
        if changed is None:
            continue
        if "duration_seconds" in lever.touches:
            changed = duration_coupled(changed)
        # Context features must be byte-identical, or the "lift" includes a change
        # to something the creator cannot do anything about.
        for name in features.CONTEXT:
            changed[name] = row.get(name, 0.0)

        lift = predict(changed) - base
        if lift < min_lift:
            continue

        primary = lever.touches[0]
        out.append(
            {
                "key": lever.key,
                "label": lever.label,
                "lift": round(lift, 2),
                "from": round(row.get(primary, 0.0), 4),
                "to": round(changed.get(primary, 0.0), 4),
                "advice": lever.advice.format(target=changed.get(primary, 0.0)),
                "touches": lever.touches,
            }
        )

    out.sort(key=lambda s: -s["lift"])
    return out[:max_suggestions]


def main(argv: list[str] | None = None) -> int:
    """Sanity-run the recommender against the exported model and dataset."""
    parser = argparse.ArgumentParser(description="Show recommendations for sample rows.")
    parser.add_argument("--rows", type=int, default=3)
    args = parser.parse_args(argv)

    model_path = config.MODEL_DIR / "publish-model.json"
    if not model_path.exists():
        raise SystemExit("No exported model. Run: python -m publishml.export")
    model = json.loads(model_path.read_text(encoding="utf-8"))
    names = model["features"]

    from .gbdt import score as gbdt_score

    def predict(row: dict[str, float]) -> float:
        return gbdt_score(model, [float(row.get(n, 0.0)) for n in names])

    dataset = config.BUILD_DIR / "dataset.jsonl"
    from .collect import read_jsonl

    shown = 0
    for entry in read_jsonl(dataset):
        if shown >= args.rows:
            break
        niche = model["nicheStats"].get(entry["cell"], {})
        top = niche.get("top") or niche.get("all") or {}
        if not top:
            continue
        suggestions = recommend(predict, entry["features"], top)
        print(f"\n{entry['id']}  cell={entry['cell']}  actual={entry['target']:.0f}  "
              f"predicted={predict(entry['features']):.1f}")
        for s in suggestions:
            print(f"  +{s['lift']:>5.2f}  {s['label']:<32} {s['advice']}")
        if not suggestions:
            print("  (nothing above the lift threshold - this row is already well set up)")
        shown += 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
