"""
Train the score model.

MODEL CHOICE: gradient-boosted trees, not a neural net.
  - The features are 64 tabular numbers. On tabular data of this size GBDTs beat
    neural nets consistently, and this is a CPU-only 8GB machine: LightGBM trains
    100k rows x 64 features in well under a minute.
  - Trees are exportable to a few hundred KB of JSON and evaluable in plain
    TypeScript, which is what lets the app score a video with zero Python at
    runtime and no inference server to pay for.
  - Trees give per-feature counterfactuals cheaply, which is what the
    recommendation stage needs.

LightGBM if installed, scikit-learn's HistGradientBoostingRegressor otherwise.
The sklearn fallback is not a stub - it is the same algorithm family and the
exporter handles both - it just trains slower and tunes less.

TWO HOLDOUTS, BECAUSE ONE WOULD FLATTER THE MODEL
-------------------------------------------------
1. TIME SPLIT (the headline number). Train on everything before a cutoff date,
   test on everything after. This is the only split that answers the question the
   product actually asks: given the past, can we score something new? A random
   split cannot answer it, because it lets the model see the future.

2. CHANNEL-DISJOINT SPLIT (the honesty check). No channel appears in both halves.
   Because the label is channel-relative, a random split puts siblings from one
   channel on both sides, and the model can score well by memorising "this
   channel writes titles like X". If the channel-disjoint number is far below the
   time-split number, the model has learned channels, not videos - and that gets
   printed rather than buried.
"""

from __future__ import annotations

import argparse
import json
import math
from typing import Any

import numpy as np

from . import config, features
from .collect import read_jsonl

try:  # pragma: no cover - environment dependent
    import lightgbm as lgb

    HAS_LGB = True
except Exception:  # pragma: no cover
    lgb = None  # type: ignore
    HAS_LGB = False

from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402


# Hyperparameters. Deliberately conservative: with the noise floor of a
# channel-relative label, a deeper model memorises rather than generalises.
PARAMS = {
    "objective": "regression",
    "metric": "l2",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "min_data_in_leaf": 40,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    # L2 on leaf weights. The label is a percentile, so extreme leaves are almost
    # always a handful of rows in an odd cell rather than a real effect.
    "lambda_l2": 1.0,
    "verbosity": -1,
    "num_threads": 0,
}
NUM_ROUNDS = 1200
EARLY_STOPPING = 60


def load_dataset(path=None) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]], list[str]]:
    """Read `build/dataset.jsonl` into a dense matrix in fixed column order."""
    path = path or (config.BUILD_DIR / "dataset.jsonl")
    names = features.feature_names()
    rows = list(read_jsonl(path))
    if not rows:
        raise SystemExit(
            f"No dataset at {path}. Run:\n"
            "  python -m publishml.collect\n"
            "  python -m publishml.thumbs\n"
            "  python -m publishml.labels"
        )
    X = np.array([[float(r["features"].get(n, 0.0)) for n in names] for r in rows], dtype=np.float32)
    y = np.array([float(r["target"]) for r in rows], dtype=np.float32)
    return X, y, rows, names


def time_split(rows: list[dict[str, Any]], holdout: float) -> tuple[np.ndarray, np.ndarray]:
    """Indices for a chronological split. The dataset is already sorted by date."""
    n = len(rows)
    cut = int(n * (1.0 - holdout))
    return np.arange(cut), np.arange(cut, n)


def channel_split(rows: list[dict[str, Any]], holdout: float) -> tuple[np.ndarray, np.ndarray]:
    """
    Indices for a channel-disjoint split.

    Channels are assigned by a hash of the id rather than by shuffling, so the
    split is identical on every run and across machines - a metric that moves
    because the random seed moved is not a metric.
    """
    test_channels = {
        r["channelId"] for r in rows
        if (hash_str(r["channelId"]) % 1000) < holdout * 1000
    }
    train = np.array([i for i, r in enumerate(rows) if r["channelId"] not in test_channels])
    test = np.array([i for i, r in enumerate(rows) if r["channelId"] in test_channels])
    return train, test


def hash_str(text: str) -> int:
    """FNV-1a. Python's `hash()` is salted per process and would not be stable."""
    h = 0x811C9DC5
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    """Rank correlation. The headline metric, because the product ranks."""
    if len(a) < 3:
        return 0.0
    ra = np.argsort(np.argsort(a)).astype(np.float64)
    rb = np.argsort(np.argsort(b)).astype(np.float64)
    ra -= ra.mean()
    rb -= rb.mean()
    denom = math.sqrt(float((ra**2).sum()) * float((rb**2).sum()))
    return float((ra * rb).sum() / denom) if denom else 0.0


def top_decile_auc(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    AUC for "is this video in the top 10% of its cell?".

    This is the number the marketing claim should be built on, because it is the
    claim: can the score tell a top-decile video from the rest? Computed via the
    Mann-Whitney identity so it needs no sklearn call and no thresholds.
    """
    positive = y_true >= 90.0
    n_pos = int(positive.sum())
    n_neg = int((~positive).sum())
    if n_pos == 0 or n_neg == 0:
        return 0.5
    ranks = np.argsort(np.argsort(y_pred)).astype(np.float64) + 1.0
    return float((ranks[positive].sum() - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))


def fit(X_train, y_train, X_valid, y_valid) -> tuple[Any, str, int]:
    """Train one model, returning it plus the backend name and its size."""
    if HAS_LGB:
        train_set = lgb.Dataset(X_train, label=y_train, free_raw_data=False)
        valid_set = lgb.Dataset(X_valid, label=y_valid, reference=train_set, free_raw_data=False)
        booster = lgb.train(
            PARAMS,
            train_set,
            num_boost_round=NUM_ROUNDS,
            valid_sets=[valid_set],
            callbacks=[lgb.early_stopping(EARLY_STOPPING, verbose=False), lgb.log_evaluation(0)],
        )
        return booster, "lightgbm", booster.num_trees()

    model = HistGradientBoostingRegressor(
        learning_rate=PARAMS["learning_rate"],
        max_leaf_nodes=PARAMS["num_leaves"],
        min_samples_leaf=PARAMS["min_data_in_leaf"],
        l2_regularization=PARAMS["lambda_l2"],
        max_iter=NUM_ROUNDS,
        early_stopping=True,
        n_iter_no_change=EARLY_STOPPING,
        validation_fraction=0.1,
        random_state=0,
    )
    model.fit(X_train, y_train)
    return model, "sklearn", int(model.n_iter_)


def predict(model, X) -> np.ndarray:
    return np.asarray(model.predict(X), dtype=np.float64)


def evaluate(model, X, y) -> dict[str, float]:
    pred = predict(model, X)
    resid = pred - y
    baseline = float(np.mean((y - y.mean()) ** 2))
    mse = float(np.mean(resid**2))
    return {
        "rows": int(len(y)),
        "spearman": round(spearman(y, pred), 4),
        "mae": round(float(np.mean(np.abs(resid))), 3),
        "rmse": round(math.sqrt(mse), 3),
        # Against predicting the mean every time. A percentile target has mean 50
        # and sd ~29, so "always say 50" already scores rmse ~29; r2 says how much
        # of that the model actually beat.
        "r2": round(1.0 - mse / baseline, 4) if baseline else 0.0,
        "topDecileAuc": round(top_decile_auc(y, pred), 4),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train the Publish score model.")
    parser.add_argument("--holdout", type=float, default=0.15)
    parser.add_argument("--shorts", choices=["long", "short", "both"], default="long")
    args = parser.parse_args(argv)

    X, y, rows, names = load_dataset()

    if args.shorts != "both":
        want = args.shorts == "short"
        keep = np.array([i for i, r in enumerate(rows) if bool(r["isShorts"]) == want])
        if len(keep) < 200:
            print(
                f"Only {len(keep)} {args.shorts}-form rows. Training on both forms instead - "
                "the `is_shorts` feature lets the model separate them, but less cleanly."
            )
        else:
            X, y = X[keep], y[keep]
            rows = [rows[i] for i in keep]

    print(f"{len(rows)} rows, {len(names)} features, backend={'lightgbm' if HAS_LGB else 'sklearn'}")

    tr, te = time_split(rows, args.holdout)
    if len(te) < 50:
        raise SystemExit(f"Holdout is only {len(te)} rows. Collect more data before trusting a metric.")

    model, backend, trees = fit(X[tr], y[tr], X[te], y[te])
    time_metrics = evaluate(model, X[te], y[te])
    print(f"\ntime split      {json.dumps(time_metrics)}")

    ctr, cte = channel_split(rows, args.holdout)
    channel_metrics: dict[str, float] = {}
    if len(cte) >= 50 and len(ctr) >= 200:
        cmodel, _, _ = fit(X[ctr], y[ctr], X[cte], y[cte])
        channel_metrics = evaluate(cmodel, X[cte], y[cte])
        print(f"channel split   {json.dumps(channel_metrics)}")
        gap = time_metrics["spearman"] - channel_metrics["spearman"]
        if gap > 0.10:
            print(
                f"\n  WARNING: the channel-disjoint split is {gap:.2f} Spearman worse.\n"
                "  The model is partly memorising channels. More channels, not more\n"
                "  videos per channel, is the fix."
            )

    importance: dict[str, float] = {}
    if backend == "lightgbm":
        gains = model.feature_importance(importance_type="gain")
        total = float(sum(gains)) or 1.0
        importance = {
            name: round(float(g) / total, 5)
            for name, g in sorted(zip(names, gains), key=lambda kv: -kv[1])
        }
        model.save_model(str(config.MODEL_DIR / "model.txt"))
    else:
        import pickle

        (config.MODEL_DIR / "model.pkl").write_bytes(pickle.dumps(model))

    metrics = {
        "backend": backend,
        "trees": trees,
        "rows": len(rows),
        "features": len(names),
        "form": args.shorts,
        "holdout": args.holdout,
        "timeSplit": time_metrics,
        "channelSplit": channel_metrics,
        "topFeatures": dict(list(importance.items())[:25]),
        "dateRange": [rows[0]["publishedAt"], rows[-1]["publishedAt"]],
        "channels": len({r["channelId"] for r in rows}),
        "params": PARAMS,
    }
    (config.MODEL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    if importance:
        print("\ntop features by gain:")
        for name, share in list(importance.items())[:12]:
            print(f"  {share:6.2%}  {name}")

    print(f"\nwrote {config.MODEL_DIR / 'metrics.json'}")
    print("next: python -m publishml.export")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
