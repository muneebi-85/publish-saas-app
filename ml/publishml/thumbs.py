"""
Thumbnail features, computed with Pillow and numpy only.

WHY NOT CLIP / A VISION MODEL
-----------------------------
A CLIP embedding would predict better. It also means a ~2.5GB torch install, and
on an 8GB-RAM CPU machine, roughly 40ms per image - which is 2.5 hours per
100,000 thumbnails, per pass, every time a feature changes. More importantly, a
512-dim embedding cannot be turned into advice: "dimension 217 is low" is not
something a creator can act on.

Every feature below is a number a creator can change on purpose: how bright the
image is, how much of it is text, whether a face is present and how large, how
busy it is, where the visual weight sits. That is what makes the recommendation
stage possible at all. The cost is a real accuracy ceiling, written down in the
model card rather than hidden.

Each feature is computed on a 160px-wide downscale. Thumbnails are displayed at
around 360x202 on desktop and smaller on mobile, so 160px preserves everything
that survives to the viewer's eye while making the whole pass ~3ms per image.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter

from . import config

# Optional: a real face detector, if the user installed opencv-python. The
# skin-fraction heuristic below is a usable stand-in, but it counts hands, wood,
# and sand as faces, so when cv2 is present we prefer it and say so in the row.
try:  # pragma: no cover - environment dependent
    import cv2  # type: ignore

    _CASCADE = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    HAS_CV2 = not _CASCADE.empty()
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore
    _CASCADE = None
    HAS_CV2 = False


WORK_WIDTH = 160

FEATURE_NAMES = [
    "thumb_brightness",
    "thumb_brightness_std",
    "thumb_contrast",
    "thumb_saturation",
    "thumb_colorfulness",
    "thumb_warm_fraction",
    "thumb_red_fraction",
    "thumb_edge_density",
    "thumb_text_area",
    "thumb_text_blocks",
    "thumb_face_area",
    "thumb_face_count",
    "thumb_skin_fraction",
    "thumb_center_weight",
    "thumb_third_offset",
    "thumb_complexity",
    "thumb_border_fraction",
    "thumb_aspect",
]


def _gray(arr: np.ndarray) -> np.ndarray:
    """Rec. 601 luma - what perceived brightness actually tracks."""
    return arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114


def _sobel(gray: np.ndarray) -> np.ndarray:
    """Gradient magnitude. Hand-rolled so numpy is the only dependency."""
    gx = np.zeros_like(gray)
    gy = np.zeros_like(gray)
    gx[:, 1:-1] = gray[:, 2:] - gray[:, :-2]
    gy[1:-1, :] = gray[2:, :] - gray[:-2, :]
    return np.hypot(gx, gy)


def _text_mask(gray: np.ndarray) -> np.ndarray:
    """
    Where the image looks like overlaid text rather than photography.

    Overlaid captions have two properties photographs rarely have together: very
    high local contrast (a hard glyph edge against a flat plate) and near-uniform
    local extremes (pure white on pure black). So: find pixels whose local
    range is large AND whose value is near the local max or min. That fires on
    bold captions and stroked text, and stays quiet on foliage and hair, which
    are high-frequency but mid-tone.
    """
    img = Image.fromarray(gray.astype(np.uint8))
    local_max = np.asarray(img.filter(ImageFilter.MaxFilter(5)), dtype=np.float32)
    local_min = np.asarray(img.filter(ImageFilter.MinFilter(5)), dtype=np.float32)
    local_range = local_max - local_min
    near_extreme = np.minimum(np.abs(gray - local_max), np.abs(gray - local_min))
    return (local_range > 70) & (near_extreme < 25)


def _count_blocks(mask: np.ndarray, min_pixels: int = 40) -> int:
    """
    How many separate text regions the mask contains, as a row-band count.

    A full connected-component labelling would be better and needs scipy. Text in
    thumbnails is laid out in horizontal bands, so counting runs of consecutive
    rows that carry text pixels gets the same answer for the common cases -
    "one caption" vs "a caption plus a corner sticker plus a price tag" - at a
    fraction of the code.
    """
    per_row = mask.sum(axis=1)
    threshold = max(2, mask.shape[1] // 40)
    active = per_row > threshold
    blocks = 0
    run = 0
    for is_active in active:
        if is_active:
            run += 1
        else:
            if run * threshold >= min_pixels:
                blocks += 1
            run = 0
    if run * threshold >= min_pixels:
        blocks += 1
    return blocks


def _skin_mask(arr: np.ndarray) -> np.ndarray:
    """
    YCbCr skin-tone gate, the classic Chai-Ngan bounds.

    Chosen over an RGB rule because it holds across lighting and across skin
    tones far better: chrominance is roughly tone-invariant while luma is not.
    It still fires on wood, sand, and terracotta, which is exactly why the value
    is reported as `skin_fraction` and never called "face" unless cv2 confirmed
    it.
    """
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return (y > 60) & (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173)


def features_for_image(path: Path) -> dict[str, float] | None:
    """All thumbnail features for one file, or None if it will not open."""
    try:
        with Image.open(path) as raw:
            raw = raw.convert("RGB")
            width, height = raw.size
            if width < 32 or height < 32:
                return None
            scale = WORK_WIDTH / width
            work = raw.resize((WORK_WIDTH, max(1, int(round(height * scale)))), Image.BILINEAR)
            arr = np.asarray(work, dtype=np.float32)
            full_size = (width, height)
    except Exception:
        return None

    h, w = arr.shape[:2]
    gray = _gray(arr)
    total = float(h * w)

    # Colour
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    saturation = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    # Hasler-Susstrunk colourfulness: the standard no-reference metric, and the
    # one that tracks "this thumbnail pops" better than mean saturation does.
    rg = arr[..., 0] - arr[..., 1]
    yb = 0.5 * (arr[..., 0] + arr[..., 1]) - arr[..., 2]
    colorfulness = math.sqrt(float(rg.std()) ** 2 + float(yb.std()) ** 2) + 0.3 * math.sqrt(
        float(rg.mean()) ** 2 + float(yb.mean()) ** 2
    )

    warm = (arr[..., 0] > arr[..., 2] + 15).sum() / total
    red = ((arr[..., 0] > 120) & (arr[..., 0] > arr[..., 1] * 1.4) & (arr[..., 0] > arr[..., 2] * 1.4)).sum() / total

    # Structure
    edges = _sobel(gray)
    edge_density = float((edges > 40).sum() / total)

    text = _text_mask(gray)
    text_area = float(text.sum() / total)
    text_blocks = _count_blocks(text)

    skin = _skin_mask(arr)
    skin_fraction = float(skin.sum() / total)

    face_count = 0
    face_area = 0.0
    if HAS_CV2:  # pragma: no cover - environment dependent
        small = np.asarray(Image.fromarray(gray.astype(np.uint8)))
        faces = _CASCADE.detectMultiScale(small, scaleFactor=1.15, minNeighbors=5, minSize=(14, 14))
        face_count = int(len(faces))
        face_area = float(sum(fw * fh for _, _, fw, fh in faces) / total) if face_count else 0.0
    else:
        # Without a detector, the honest proxy is the skin fraction. It is a
        # different quantity, so it goes in a different column and face_area
        # stays 0 rather than being faked from it.
        face_count = 0
        face_area = 0.0

    # Composition: where the visual energy sits.
    weight = edges + 1e-6
    ys, xs = np.mgrid[0:h, 0:w]
    cx = float((weight * xs).sum() / weight.sum()) / w
    cy = float((weight * ys).sum() / weight.sum()) / h
    center_weight = float(
        weight[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4].sum() / weight.sum()
    )
    # Distance from the nearest rule-of-thirds intersection, normalised. Small is
    # "composed", large is "everything is dead centre or shoved into a corner".
    thirds = [(1 / 3, 1 / 3), (2 / 3, 1 / 3), (1 / 3, 2 / 3), (2 / 3, 2 / 3)]
    third_offset = min(math.hypot(cx - tx, cy - ty) for tx, ty in thirds)

    # Compression complexity: JPEG size at fixed quality is a good cheap proxy
    # for how much detail the image carries, and it correlates with "busy".
    import io as _io

    buf = _io.BytesIO()
    Image.fromarray(arr.astype(np.uint8)).save(buf, format="JPEG", quality=60)
    complexity = len(buf.getvalue()) / total

    # Letterboxing / solid frames: near-uniform outer ring.
    ring = np.concatenate(
        [gray[:2, :].ravel(), gray[-2:, :].ravel(), gray[:, :2].ravel(), gray[:, -2:].ravel()]
    )
    border_fraction = float((np.abs(ring - ring.mean()) < 8).mean())

    return {
        "thumb_brightness": float(gray.mean() / 255.0),
        "thumb_brightness_std": float(gray.std() / 255.0),
        "thumb_contrast": float((np.percentile(gray, 95) - np.percentile(gray, 5)) / 255.0),
        "thumb_saturation": float(saturation.mean()),
        "thumb_colorfulness": float(colorfulness),
        "thumb_warm_fraction": float(warm),
        "thumb_red_fraction": float(red),
        "thumb_edge_density": edge_density,
        "thumb_text_area": text_area,
        "thumb_text_blocks": float(text_blocks),
        "thumb_face_area": face_area,
        "thumb_face_count": float(face_count),
        "thumb_skin_fraction": skin_fraction,
        "thumb_center_weight": center_weight,
        "thumb_third_offset": float(third_offset),
        "thumb_complexity": float(complexity),
        "thumb_border_fraction": border_fraction,
        "thumb_aspect": float(full_size[0] / max(1, full_size[1])),
    }


def build(limit: int = 0) -> int:
    """
    Compute features for every downloaded thumbnail not already in the cache.

    Append-only JSONL keyed by video id, so this is safe to interrupt and cheap
    to resume - which matters because the thumbnail pass is the slowest stage.
    """
    done: set[str] = set()
    if config.THUMB_FEATURES_JSONL.exists():
        with config.THUMB_FEATURES_JSONL.open("r", encoding="utf-8") as fh:
            for line in fh:
                try:
                    done.add(json.loads(line)["id"])
                except Exception:
                    continue

    written = 0
    with config.THUMB_FEATURES_JSONL.open("a", encoding="utf-8") as out:
        for path in sorted(config.THUMB_DIR.glob("*.jpg")):
            vid = path.stem
            if vid in done:
                continue
            feats = features_for_image(path)
            if feats is None:
                continue
            row: dict[str, Any] = {"id": vid, "detector": "cv2" if HAS_CV2 else "none", **feats}
            out.write(json.dumps(row, separators=(",", ":")) + "\n")
            written += 1
            if written % 2000 == 0:
                out.flush()
                print(f"  {written} thumbnails featurised")
            if limit and written >= limit:
                break
    return written


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Featurise downloaded thumbnails.")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args(argv)

    print(f"face detector: {'cv2 Haar cascade' if HAS_CV2 else 'none (skin-tone proxy only)'}")
    if not HAS_CV2:
        print("  install opencv-python for real face counts: pip install opencv-python")
    print(f"  {build(args.limit)} new rows -> {config.THUMB_FEATURES_JSONL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
