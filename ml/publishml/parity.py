"""
Generate the Python-vs-TypeScript parity fixture.

    python -m publishml.parity

Writes `src/lib/ml/__fixtures__/parity.json`, which `src/lib/ml/parity.test.ts`
reads. The fixture has two halves, because there are two independent ways the
two languages can drift apart:

1. FEATURES. Video inputs chosen to hit every place JavaScript and Python
   disagree by default - emoji (code points vs UTF-16 units), CRLF and trailing
   newlines (`splitlines` vs `split`), non-ASCII hashtags (`\\w` is ASCII-only in
   JS), all-caps words, empty strings, a Monday and a Sunday (weekday numbering).
   Each case carries the feature row Python produced, at a FIXED `now`.

2. THE TREE WALKER. A small tree ensemble, generated deterministically rather
   than trained, plus the score Python's walker gives each of several vectors.
   Generated rather than trained because the point is to test the flat-array
   format and the child encoding - including the awkward cases a trained model
   produces rarely and a fixture should produce always: a single-leaf stump, a
   tree whose root is a leaf, exact-threshold ties (`<=` goes left), and negative
   thresholds.

Re-run this whenever `features.py` or `gbdt.py` changes. The test failing is the
system working: it means the two extractors have diverged and the scores the app
shows would no longer be the scores the model was trained to produce.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timezone
from . import config, features
from .gbdt import score as gbdt_score

# A fixed clock. Every age-derived feature depends on it, so both sides must use
# the same instant or the fixture fails for a reason that has nothing to do with
# the code being tested.
NOW = datetime(2026, 8, 21, 12, 0, 0, tzinfo=timezone.utc)

OUT_DIR = config.ML_DIR.parent / "src" / "lib" / "ml" / "__fixtures__"

CASES: list[dict] = [
    {
        # Published on a Wednesday: a mid-week point, so a reversed weekday
        # mapping cannot pass by symmetry the way Monday/Sunday alone might.
        "name": "ordinary long-form video",
        "video": {
            "title": "How to Build a Home Studio in 7 Days (Full Guide)",
            "description": (
                "Everything I used, and what I would skip next time.\n"
                "0:00 Intro\n1:45 The desk\n7:20 Acoustics\n"
                "Subscribe for more. https://example.com/kit"
            ),
            "tags": ["home studio", "desk setup", "acoustics", "diy"],
            "duration": "PT14M32S",
            "publishedAt": "2026-03-04T09:15:00Z",
            "definition": "hd",
            "caption": True,
            "madeForKids": False,
            "licensedContent": False,
        },
        "channel": {"subscribers": 48200, "videoCount": 213, "publishedAt": "2019-06-11T00:00:00Z"},
        "thumb": {
            "thumb_brightness": 0.5121,
            "thumb_brightness_std": 0.2033,
            "thumb_contrast": 0.7412,
            "thumb_saturation": 0.4408,
            "thumb_colorfulness": 61.2044,
            "thumb_warm_fraction": 0.6013,
            "thumb_red_fraction": 0.0822,
            "thumb_edge_density": 0.1904,
            "thumb_text_area": 0.0731,
            "thumb_text_blocks": 2.0,
            "thumb_face_area": 0.1142,
            "thumb_face_count": 1.0,
            "thumb_skin_fraction": 0.1533,
            "thumb_center_weight": 0.5602,
            "thumb_third_offset": 0.0911,
            "thumb_complexity": 0.4417,
            "thumb_border_fraction": 0.1204,
            "thumb_aspect": 1.7778,
        },
    },
    {
        # Emoji: 1 code point in Python, 2 UTF-16 units in JS. Every length
        # feature diverges here unless both sides count code points.
        "name": "emoji title, no thumbnail",
        "video": {
            "title": "I CANNOT believe this happened 😱🔥 (2026)",
            "description": "",
            "tags": [],
            "duration": "PT58S",
            "publishedAt": "2026-01-05T23:59:59Z",
            "definition": "sd",
            "caption": False,
        },
        "channel": {"subscribers": 0, "videoCount": 4},
        "thumb": None,
    },
    {
        # CRLF plus a trailing newline: `splitlines()` gives 3 lines, a naive
        # `split('\n')` gives 4, and one of them is empty.
        # Also a Friday - dow 4, the value either side of the `weekend` cutoff.
        "name": "CRLF description with trailing newline",
        "video": {
            "title": "5 Mistakes Everyone Makes | Beginner Woodworking",
            "description": "Line one\r\nLine two\r\n0:00 start\r\n",
            "tags": ["woodworking"],
            "duration": "PT1H2M",
            "publishedAt": "2025-11-28T06:00:00Z",
            "definition": "hd",
            "caption": True,
        },
        "channel": {"subscribers": 1_250_000, "videoCount": 812, "publishedAt": "2014-02-01T00:00:00Z"},
        "thumb": None,
    },
    {
        # Non-ASCII hashtag and non-ASCII letters: JS `\w` would miss #café.
        "name": "non-ASCII hashtags and letters",
        "video": {
            "title": "Café Crème — ¿Por qué?",
            "description": "#café #crème #español #123 plain text",
            "tags": ["café", "crème brûlée"],
            "duration": "PT0S",
            "publishedAt": None,
            "definition": None,
            "caption": False,
        },
        "channel": {},
        "thumb": None,
    },
    {
        # A Monday and the hour boundary: Python weekday()==0, JS getUTCDay()==1.
        "name": "monday publish, weekday numbering",
        "video": {
            "title": "why nobody talks about this",
            "description": "no links, no chapters, nothing",
            "tags": ["a", "b c", "d e f"],
            "duration": "PT7M7S",
            "publishedAt": "2026-08-17T00:00:00Z",
            "definition": "hd",
            "caption": False,
        },
        "channel": {"subscribers": 9999, "videoCount": 51},
        "thumb": None,
    },
    {
        # A Sunday, the other end of the weekday mapping, plus everything empty.
        "name": "sunday publish, empty everything",
        "video": {
            "title": "",
            "description": "",
            "tags": [],
            "duration": None,
            "publishedAt": "2026-08-16T13:30:00Z",
        },
        "channel": {},
        "thumb": None,
    },
    {
        # An EMPTY thumb dict. Python's `if thumb:` is false for `{}`; JavaScript's
        # `if (thumb)` is true. Without an explicit emptiness check the TS side
        # would report `has_thumb = 1` for a video that has no thumbnail features.
        "name": "empty thumb dict is not a thumbnail",
        "video": {
            "title": "Quiet Desk Setup Tour",
            "description": "one line",
            "tags": ["desk"],
            "duration": "PT6M",
            "publishedAt": "2026-02-10T11:00:00Z",
            "definition": "hd",
            "caption": False,
        },
        "channel": {"subscribers": 5000, "videoCount": 30},
        "thumb": {},
    },
    {
        # A PARTIAL thumb dict carrying a key the model does not know. Absent
        # features must stay absent (not become 0), and the unknown key must not
        # leak into the row, or the two sides' row shapes diverge.
        "name": "partial thumb dict with an unknown key",
        "video": {
            "title": "Half-measured Thumbnail Case",
            "description": "0:00 start\n1:00 middle",
            "tags": [],
            "duration": "PT12M30S",
            "publishedAt": "2026-04-22T15:20:00Z",
            "definition": "hd",
            "caption": True,
        },
        "channel": {"subscribers": 82000, "videoCount": 140},
        "thumb": {
            "thumb_brightness": 0.31,
            "thumb_contrast": 0.9,
            "thumb_aspect": 1.7778,
            "thumb_not_a_real_feature": 42.0,
        },
    },
    {
        "name": "shouting all-caps with exclamation runs",
        "video": {
            "title": "STOP DOING THIS!!! IT IS RUINING YOUR SETUP!!!",
            "description": "TOP 10 THINGS\nsubscribe\n#shorts",
            "tags": ["x"] * 22,
            "duration": "PT45S",
            "publishedAt": "2026-05-30T18:45:00Z",
            "definition": "hd",
            "caption": False,
            "madeForKids": True,
            "licensedContent": True,
        },
        "channel": {"subscribers": 340, "videoCount": 9, "publishedAt": "2025-12-30T00:00:00Z"},
        "thumb": None,
    },
    {
        # A NON-UTC OFFSET timestamp. Python's fromisoformat keeps the
        # wall-clock fields as written (hour 9); a `new Date()` + getUTCHours()
        # implementation reads the UTC-converted hour (4). This case exists so
        # that divergence can never come back silently.
        "name": "offset timestamp keeps wall-clock fields",
        "video": {
            "title": "offset timestamps and unicode digits Ⅷ",
            "description": "٣ tips and ١٢:٣٤ arabic-indic digits\nhttps://x.example\n#٣x",
            "tags": ["offset"],
            "duration": "PT3M",
            "publishedAt": "2026-03-04T09:15:00+05:00",
            "definition": "hd",
            "caption": False,
        },
        "channel": {"subscribers": 1200, "videoCount": 77},
        "thumb": None,
    },
    {
        # The `\b`-vs-word-class howto edge: "to" glued to a non-ASCII letter.
        # Python's Unicode-aware `\b` does not see a boundary after "to" here;
        # the explicit lookaround classes match on both sides.
        "name": "howto with unicode-glued word and clickbaity roots",
        "video": {
            "title": "How toüntertake this — 7 joinery joints that clicked",
            "description": "the following umbrella joins\n0:00",
            "tags": [],
            "duration": "PT2M1S",
            "publishedAt": "2026-07-01T00:30:00-07:00",
            "definition": "hd",
            "caption": False,
        },
        "channel": {"subscribers": 10, "videoCount": 2},
        "thumb": None,
    },
    {
        # The digit-class edge the extractors used to drift on: Python's
        # isdigit() accepted superscripts (100²) and circled digits (①), which
        # a hand-enumerated Nd range list in TS missed, while full-width and
        # Khmer Nd digits fell outside the ranges too. isdecimal()/\p{Nd} now
        # agree exactly — this case pins that: superscripts must NOT count,
        # full-width and Khmer digits must.
        "name": "digit class edges: superscript no, fullwidth and khmer yes",
        "video": {
            "title": "100² growth and ① trick with ５ Khmer ៣",
            "description": "the ① superscript ² must not count as a number",
            "tags": [],
            "duration": "PT5M",
            "publishedAt": "2026-07-02T12:00:00Z",
            "definition": "hd",
            "caption": False,
        },
        "channel": {"subscribers": 500, "videoCount": 3},
        "thumb": None,
    },
    {
        # DATE-ONLY publishedAt: Python's fromisoformat accepts it (midnight,
        # real weekday); the TS wallClock regex used to demand a time component
        # and fell to the absent branch (dow pinned to Monday). 2026-03-04 is a
        # WEDNESDAY — without agreement, publish_dow and publish_weekend drift
        # on every date-only input.
        "name": "date-only timestamp keeps the real weekday",
        "video": {
            "title": "date only",
            "description": "",
            "tags": [],
            "duration": "PT4M",
            "publishedAt": "2026-03-04",
            "definition": "sd",
            "caption": True,
        },
        "channel": {"subscribers": 800, "videoCount": 12},
        "thumb": None,
    },
]


def synthetic_trees(n_features: int, n_trees: int = 12, seed: int = 7) -> list[dict]:
    """
    A deterministic tree ensemble that exercises every branch of the walker.

    Not a trained model: a trained one would almost never contain a bare stump or
    an exact-threshold tie, and those are precisely the cases where a
    reimplementation of the format goes wrong.
    """
    rng = random.Random(seed)
    trees: list[dict] = []

    # Tree 0: a bare stump. Root is a leaf, so the walk loop must run zero times.
    trees.append({"root": -1, "feature": [], "threshold": [], "left": [], "right": [], "leaf": [3.25]})

    # Tree 1: one split with an exact-tie threshold, to pin down that `<=` goes left.
    trees.append(
        {
            "root": 0,
            "feature": [0],
            "threshold": [1.0],
            "left": [-1],
            "right": [-2],
            "leaf": [10.0, -10.0],
        }
    )

    # Tree 2: two levels, a negative threshold (which a naive unsigned encoding
    # would mangle) and a right child that is an internal node rather than a leaf.
    trees.append(
        {
            "root": 0,
            "feature": [1, 2],
            "threshold": [-2.5, 0.0],
            "left": [-1, -2],
            "right": [1, -3],
            "leaf": [1.5, -0.5, 0.25],
        }
    )

    # The rest: random balanced-ish trees over random features and thresholds.
    for t in range(n_trees - len(trees)):
        feature: list[int] = []
        threshold: list[float] = []
        left: list[int] = []
        right: list[int] = []
        leaves: list[float] = []
        depth_limit = 3 + (t % 3)

        def grow(depth: int) -> int:
            if depth >= depth_limit or rng.random() < 0.25:
                leaves.append(round(rng.uniform(-4.0, 4.0), 4))
                return -len(leaves)
            idx = len(feature)
            feature.append(rng.randrange(n_features))
            threshold.append(round(rng.uniform(-3.0, 60.0), 4))
            left.append(0)
            right.append(0)
            left[idx] = grow(depth + 1)
            right[idx] = grow(depth + 1)
            return idx

        root = grow(0)
        trees.append(
            {
                "root": root,
                "feature": feature,
                "threshold": threshold,
                "left": left,
                "right": right,
                "leaf": leaves,
            }
        )
    return trees


def main() -> int:
    names = features.feature_names()

    feature_cases = []
    for case in CASES:
        row = features.extract(case["video"], case.get("channel") or {}, case.get("thumb"), now=NOW)
        feature_cases.append(
            {
                "name": case["name"],
                "video": case["video"],
                "channel": case.get("channel") or {},
                "thumb": case.get("thumb"),
                # Rounded to 10 decimals: float formatting differs between the two
                # JSON writers, and no feature carries meaning past that.
                "expected": {k: round(float(v), 10) for k, v in sorted(row.items())},
            }
        )

    model = {
        "format": "publish-gbdt-1",
        "objective": "percentile-rank-within-niche",
        "baseScore": 47.5,
        "features": names,
        "controllable": sorted(features.CONTROLLABLE),
        "context": sorted(features.CONTEXT),
        "percentiles": [10, 25, 50, 75, 90],
        "trees": synthetic_trees(len(names)),
        "nicheStats": {},
        "card": {
            "trainedAt": NOW.isoformat(),
            "videos": 0,
            "channels": 0,
            "dateRange": None,
            "form": "fixture",
            "backend": "fixture",
            "trees": 12,
            "features": len(names),
            "spearman": None,
            "topDecileAuc": None,
            "channelDisjointSpearman": None,
            "holdout": None,
            "limitations": ["Not a trained model. Exists only to test the tree walker."],
        },
    }

    # Score vectors: the real feature rows above, plus edge vectors (all zero, all
    # exactly-on-threshold, all large) that a real row would never produce.
    vectors: list[dict] = []
    for case in feature_cases:
        vector = [float(case["expected"].get(n, 0.0)) for n in names]
        vectors.append({"name": case["name"], "vector": vector})
    vectors.append({"name": "all zeros", "vector": [0.0] * len(names)})
    vectors.append({"name": "all ones", "vector": [1.0] * len(names)})
    vectors.append({"name": "all negative", "vector": [-5.0] * len(names)})
    vectors.append({"name": "all large", "vector": [1e6] * len(names)})
    for entry in vectors:
        entry["expected"] = round(gbdt_score(model, entry["vector"]), 10)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedBy": "python -m publishml.parity",
        "now": NOW.isoformat().replace("+00:00", "Z"),
        "featureNames": names,
        "cases": feature_cases,
        "model": model,
        "scoreVectors": vectors,
    }
    out = OUT_DIR / "parity.json"
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
    print(f"  {len(feature_cases)} feature cases, {len(names)} features, "
          f"{len(model['trees'])} trees, {len(vectors)} score vectors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
