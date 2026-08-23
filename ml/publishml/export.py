"""
Export the trained model to JSON the TypeScript app can evaluate directly.

WHY NOT ONNX / A PYTHON SERVICE
-------------------------------
A GBDT is a list of comparisons. Evaluating one in TypeScript is about 40 lines,
runs in Node and in Edge, needs no native module, no `onnxruntime` binary, no
sidecar process, and no cold-start cost. Shipping a Python inference service to
score a title would be the most expensive part of this entire product.

THE FORMAT
----------
Trees are flattened into parallel arrays rather than nested objects, which is
roughly 4x smaller on the wire:

    feature[i]   split feature index for internal node i
    threshold[i] split threshold        ("<= threshold" goes left)
    left[i]      >= 0 -> internal node index;  < 0 -> leaf  (-leaf - 1)
    right[i]     same encoding
    leaf[j]      output value of leaf j

Three things travel with the trees:

  - `features`: the column order. The TS side asserts its own extractor produces
    exactly this list, so a feature added on one side and not the other fails
    loudly at load instead of silently scoring against shifted columns.
  - `nicheStats`: per (category x channel size x form) percentiles of every
    controllable feature. This is what turns a prediction into a sentence: "your
    title is 82 characters; videos in the top decile of your niche average 51".
  - `card`: the model card - real row count, real date range, real metrics. The
    site quotes THIS, so the number on the page is the number that was trained
    on.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from . import config, features
from .collect import read_jsonl

# Percentiles kept per niche cell. p50 is the comparison point for "typical" and
# p90 for "what the good ones do"; the rest bound the advice so the recommender
# cannot suggest a value no successful video in that niche has ever had.
PERCENTILES = [10, 25, 50, 75, 90]


def load_booster():
    """The trained model, whichever backend produced it."""
    lgb_path = config.MODEL_DIR / "model.txt"
    if lgb_path.exists():
        import lightgbm as lgb

        return lgb.Booster(model_file=str(lgb_path)), "lightgbm"
    pkl_path = config.MODEL_DIR / "model.pkl"
    if pkl_path.exists():
        import pickle

        return pickle.loads(pkl_path.read_bytes()), "sklearn"
    raise SystemExit("No trained model. Run: python -m publishml.train")


def flatten_lightgbm(dump: dict[str, Any]) -> list[dict[str, Any]]:
    """LightGBM's nested tree dump -> flat parallel arrays."""
    trees = []
    for tree in dump["tree_info"]:
        feature: list[int] = []
        threshold: list[float] = []
        left: list[int] = []
        right: list[int] = []
        leaves: list[float] = []

        def walk(node: dict[str, Any]) -> int:
            """Returns the child encoding for this node: >=0 internal, <0 leaf."""
            if "leaf_value" in node:
                leaves.append(float(node["leaf_value"]))
                return -len(leaves)  # -leaf_index - 1
            if node.get("decision_type") not in ("<=", None):
                # Categorical splits would need a set-membership test on the TS
                # side. No feature in this pipeline is declared categorical, so
                # this cannot happen - and if it ever does, failing here is much
                # better than exporting a tree the scorer silently mis-evaluates.
                raise SystemExit(f"Unsupported split type {node['decision_type']!r}")
            idx = len(feature)
            feature.append(int(node["split_feature"]))
            threshold.append(float(node["threshold"]))
            left.append(0)
            right.append(0)
            left[idx] = walk(node["left_child"])
            right[idx] = walk(node["right_child"])
            return idx

        root = walk(tree["tree_structure"])
        trees.append(
            {
                "root": root,
                "feature": feature,
                "threshold": [round(t, 6) for t in threshold],
                "left": left,
                "right": right,
                "leaf": [round(v, 6) for v in leaves],
            }
        )
    return trees


def flatten_sklearn(model) -> list[dict[str, Any]]:
    """
    HistGradientBoostingRegressor -> the same flat arrays.

    sklearn stores each tree as a flat structured array already, but with a
    different child encoding (absolute node indices, leaves marked by a flag), so
    it is re-indexed into the same layout the TS scorer expects rather than
    teaching the scorer two formats.
    """
    trees = []
    for stage in model._predictors:
        for predictor in stage:
            nodes = predictor.nodes
            feature: list[int] = []
            threshold: list[float] = []
            left: list[int] = []
            right: list[int] = []
            leaves: list[float] = []
            mapping: dict[int, int] = {}

            def walk(i: int) -> int:
                node = nodes[i]
                if node["is_leaf"]:
                    leaves.append(float(node["value"]))
                    return -len(leaves)
                idx = len(feature)
                mapping[i] = idx
                feature.append(int(node["feature_idx"]))
                threshold.append(float(node["num_threshold"]))
                left.append(0)
                right.append(0)
                left[idx] = walk(int(node["left"]))
                right[idx] = walk(int(node["right"]))
                return idx

            root = walk(0)
            trees.append(
                {
                    "root": root,
                    "feature": feature,
                    "threshold": [round(t, 6) for t in threshold],
                    "left": left,
                    "right": right,
                    "leaf": [round(v, 6) for v in leaves],
                }
            )
    return trees


def niche_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Per-cell percentiles of every controllable feature, overall and top-decile.

    Two distributions per cell, because they answer different questions.
    `all` says "what is normal here". `top` - the videos that landed in the top
    10% - says "what do the ones that worked look like". Advice is generated
    against `top`; `all` is what the UI shows as the baseline the creator is
    currently sitting in.
    """
    names = sorted(features.CONTROLLABLE)
    cells: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        cells[row["cell"]].append(row)

    out: dict[str, Any] = {}
    for cell, cell_rows in cells.items():
        top = [r for r in cell_rows if r["target"] >= 90.0]
        entry: dict[str, Any] = {"n": len(cell_rows), "nTop": len(top), "all": {}, "top": {}}
        for name in names:
            values = np.array([r["features"].get(name, 0.0) for r in cell_rows], dtype=np.float64)
            entry["all"][name] = [round(float(np.percentile(values, p)), 4) for p in PERCENTILES]
            if len(top) >= 10:
                tvals = np.array([r["features"].get(name, 0.0) for r in top], dtype=np.float64)
                entry["top"][name] = [round(float(np.percentile(tvals, p)), 4) for p in PERCENTILES]
        out[cell] = entry
    return out


def build(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export the model for the TypeScript app.")
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    model, backend = load_booster()
    names = features.feature_names()

    if backend == "lightgbm":
        trees = flatten_lightgbm(model.dump_model())
    else:
        trees = flatten_sklearn(model)

    rows = list(read_jsonl(config.BUILD_DIR / "dataset.jsonl"))
    metrics_path = config.MODEL_DIR / "metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}

    # LightGBM folds its intercept into the first tree; sklearn keeps it separate
    # as `_baseline_prediction`. Without adding it back, every sklearn-backed score
    # is shifted by ~50 (the mean of a percentile target) - which looks like a
    # working model returning uniformly wrong numbers.
    base_score = 0.0
    if backend == "sklearn":
        base_score = float(np.ravel(model._baseline_prediction)[0])

    card = {
        # THESE ARE THE NUMBERS THE MARKETING COPY MUST USE. Anything the site
        # claims about accuracy or training-set size comes from this block, so
        # there is exactly one place a false claim could come from, and it is
        # generated rather than written.
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "videos": metrics.get("rows", len(rows)),
        "channels": metrics.get("channels"),
        "dateRange": metrics.get("dateRange"),
        "form": metrics.get("form"),
        "backend": backend,
        "trees": len(trees),
        "features": len(names),
        "spearman": (metrics.get("timeSplit") or {}).get("spearman"),
        "topDecileAuc": (metrics.get("timeSplit") or {}).get("topDecileAuc"),
        "channelDisjointSpearman": (metrics.get("channelSplit") or {}).get("spearman"),
        "holdout": metrics.get("holdout"),
        "limitations": [
            "Thumbnail features are geometric (brightness, text area, face area, "
            "composition), not semantic. The model cannot tell what the image is of.",
            "Trained on English-language, US-region channels found by topic search; "
            "other languages and regions are out of distribution.",
            "The label is channel-relative performance, so the score predicts "
            "'better than this channel's usual', not absolute views.",
            "Publish hour and weekday are in UTC because channel timezone is not "
            "exposed by the API, so scheduling signal is weak by construction.",
        ],
    }

    payload = {
        "format": "publish-gbdt-1",
        "objective": "percentile-rank-within-niche",
        "baseScore": round(base_score, 6),
        "features": names,
        "controllable": sorted(features.CONTROLLABLE),
        "context": sorted(features.CONTEXT),
        "percentiles": PERCENTILES,
        "trees": trees,
        "nicheStats": niche_stats(rows) if rows else {},
        "card": card,
    }

    # `--out` writes straight to the app (or to a mounted volume) instead of the
    # build directory, so a retrain is one command rather than a command plus a copy
    # someone forgets. Parents are created because the common target is a path that
    # does not exist yet on a fresh checkout.
    out_path = Path(args.out) if args.out else config.MODEL_DIR / "publish-model.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    # A tiny parity fixture: 24 real rows with the Python prediction attached. The
    # TypeScript test scores the same rows and asserts agreement to 1e-4, which is
    # the only thing standing between "the exporter works" and "we hope it works".
    fixture_rows = rows[:: max(1, len(rows) // 24)][:24] if rows else []
    if fixture_rows:
        X = np.array(
            [[float(r["features"].get(n, 0.0)) for n in names] for r in fixture_rows],
            dtype=np.float64,
        )
        preds = np.asarray(model.predict(X), dtype=np.float64)
        fixture = [
            {"id": r["id"], "features": r["features"], "expected": round(float(p), 6)}
            for r, p in zip(fixture_rows, preds)
        ]
        (out_path.parent / "parity-fixture.json").write_text(
            json.dumps(fixture, indent=1), encoding="utf-8"
        )

    size_kb = out_path.stat().st_size / 1024
    print(f"wrote {out_path} ({size_kb:.0f} KB)")
    print(f"  {len(trees)} trees, {len(names)} features, {len(payload['nicheStats'])} niche cells")
    print(f"  card: {card['videos']} videos, spearman={card['spearman']}, auc={card['topDecileAuc']}")
    if size_kb > 4096:
        print(
            f"\n  {size_kb / 1024:.1f} MB is large to ship in a bundle. Re-train with fewer\n"
            "  rounds or load it from R2 at runtime instead of importing it."
        )
    if args.out:
        print("\nnext: nothing further - written straight to that path")
    else:
        print("\nnext: copy to the app -> src/lib/ml/publish-model.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
