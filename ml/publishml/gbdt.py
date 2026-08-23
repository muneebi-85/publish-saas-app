"""
Pure-Python evaluation of the exported tree ensemble.

This is the reference implementation. `src/lib/ml/gbdt.ts` is a line-for-line
mirror of `score()` below, and a test scores the same fixture through both and
asserts they agree to 1e-4. Two implementations of the same 15 lines is a
deliberate choice: the alternative is trusting that an export format survives a
language boundary untested, which is exactly the kind of bug that produces
plausible-looking wrong scores forever.
"""

from __future__ import annotations

from typing import Any


def score(model: dict[str, Any], row: list[float]) -> float:
    """
    Sum every tree's leaf value for this feature vector.

    Child encoding, matching the exporter: a non-negative child is an internal
    node index; a negative child `c` is leaf index `-c - 1`.
    """
    total = float(model.get("baseScore", 0.0))
    for tree in model["trees"]:
        feature = tree["feature"]
        threshold = tree["threshold"]
        left = tree["left"]
        right = tree["right"]
        node = tree["root"]
        # A stump - a tree that is a single leaf - has a negative root and no
        # internal nodes at all. LightGBM produces these once it runs out of
        # useful splits, so this is a normal case, not a corrupt tree.
        while node >= 0:
            node = left[node] if row[feature[node]] <= threshold[node] else right[node]
        total += tree["leaf"][-node - 1]
    return total


def score_dict(model: dict[str, Any], row: dict[str, float]) -> float:
    """Same thing, from a named feature dict, in the model's own column order."""
    return score(model, [float(row.get(name, 0.0)) for name in model["features"]])
