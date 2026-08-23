"""
Evaluate the EXPORTED model, not the in-memory one.

`train.py` already reports metrics from the booster it just fitted. This module
re-scores the holdout through `publish-model.json` and the pure-Python tree
walker, which checks something different and more important: that the artefact the
app will actually load produces the same numbers as the model that was trained.
An exporter bug is invisible to `train.py` by construction.

It also reports two things a training loop does not:

  - CALIBRATION. The score is shown to users as a number out of 100, so "videos
    we scored 80 landed in the 80th percentile on average" has to be true, not
    just "the ranking is good". A model can have excellent Spearman and be
    systematically 15 points optimistic.
  - THE BASELINES IT HAS TO BEAT. Predicting 50 every time, and predicting from
    title length alone. If the model cannot clearly beat both, it does not deserve
    to be in the product, and printing them next to the real number is the only
    way that stays honest.
"""

from __future__ import annotations

import argparse
import json
import math
from typing import Any

import numpy as np

from . import config, features
from .collect import read_jsonl
from .gbdt import score as gbdt_score
from .train import spearman, top_decile_auc


def calibration(y_true: np.ndarray, y_pred: np.ndarray, bins: int = 10) -> list[dict[str, float]]:
    """Mean actual percentile per predicted-score decile."""
    order = np.argsort(y_pred)
    out = []
    for b in range(bins):
        lo = b * len(order) // bins
        hi = (b + 1) * len(order) // bins
        idx = order[lo:hi]
        if len(idx) == 0:
            continue
        out.append(
            {
                "bin": b + 1,
                "n": int(len(idx)),
                "predicted": round(float(y_pred[idx].mean()), 2),
                "actual": round(float(y_true[idx].mean()), 2),
            }
        )
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate the exported model.")
    parser.add_argument("--holdout", type=float, default=0.15)
    args = parser.parse_args(argv)

    model_path = config.MODEL_DIR / "publish-model.json"
    if not model_path.exists():
        raise SystemExit("No exported model. Run: python -m publishml.export")
    model = json.loads(model_path.read_text(encoding="utf-8"))
    names = model["features"]
    if names != features.feature_names():
        raise SystemExit(
            "The exported model's feature list does not match the current extractor.\n"
            "Re-run labels -> train -> export; scoring with mismatched columns is worse\n"
            "than not scoring at all."
        )

    rows = list(read_jsonl(config.BUILD_DIR / "dataset.jsonl"))
    if not rows:
        raise SystemExit("No dataset. Run: python -m publishml.labels")

    # The same chronological cut train.py used, so this is the held-out tail and
    # not a re-score of the training rows.
    cut = int(len(rows) * (1.0 - args.holdout))
    test = rows[cut:]
    if len(test) < 50:
        raise SystemExit(f"Only {len(test)} holdout rows - not enough to evaluate.")

    y = np.array([float(r["target"]) for r in test], dtype=np.float64)
    pred = np.array(
        [gbdt_score(model, [float(r["features"].get(n, 0.0)) for n in names]) for r in test],
        dtype=np.float64,
    )

    resid = pred - y
    mse = float(np.mean(resid**2))
    baseline_mse = float(np.mean((y - 50.0) ** 2))

    title_len = np.array([r["features"]["title_len"] for r in test], dtype=np.float64)

    report: dict[str, Any] = {
        "rows": len(test),
        "spearman": round(spearman(y, pred), 4),
        "topDecileAuc": round(top_decile_auc(y, pred), 4),
        "mae": round(float(np.mean(np.abs(resid))), 2),
        "rmse": round(math.sqrt(mse), 2),
        "bias": round(float(resid.mean()), 2),
        "baselines": {
            "alwaysFifty": {"rmse": round(math.sqrt(baseline_mse), 2), "spearman": 0.0},
            "titleLengthOnly": {"spearman": round(spearman(y, -np.abs(title_len - 55.0)), 4)},
        },
        "calibration": calibration(y, pred),
        "card": model.get("card", {}),
    }
    out = config.MODEL_DIR / "evaluation.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps({k: v for k, v in report.items() if k != "calibration"}, indent=2))
    print("\ncalibration (predicted -> actual, by decile of prediction):")
    for row in report["calibration"]:
        print(f"  bin {row['bin']:>2}  n={row['n']:>5}  predicted {row['predicted']:>5.1f}  actual {row['actual']:>5.1f}")

    if report["spearman"] < 0.15:
        print(
            "\n  This model is close to useless (Spearman < 0.15). Do not ship it as a\n"
            "  score. Collect more channels - breadth, not depth - and retrain."
        )
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
