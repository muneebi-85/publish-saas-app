# The Publish Score training pipeline

This directory trains the model behind the Publish Score. It runs on a laptop CPU
with 8 GB of RAM, on a **free** YouTube Data API key, and needs no GPU.

It exists because the product used to claim its score was "trained on over 12.7M
high-performing videos" and correlated with "a 68% higher chance" of reaching a
niche's top 10%. Nothing had been trained. Both numbers were invented. This
pipeline produces a real model and a **model card** carrying the numbers that were
actually measured — sample size, date range, rank correlation, top-decile AUC —
and the app prints those instead of a slogan.

If no model artefact is deployed, `src/lib/ml/publish.ts` returns
`{ available: false, reason }` and the API route answers **503**. There is no
fallback heuristic on purpose: a guessed number wearing the name "Publish Score"
is the exact problem this replaced, and a client cannot tell a fabricated 62 from
a measured one.

---

## Install

```bash
pip install -r ml/requirements.txt
```

`lightgbm` is included and used automatically when present; without it the
trainer falls back to scikit-learn's `HistGradientBoostingRegressor`. Both are
CPU-only.

`opencv-python` is **optional and worth installing**. Without it `thumb_face_area`
and `thumb_face_count` stay 0 for every row, only the skin-tone proxy remains, and
the `thumb_face` lever can never fire. That is a weaker model, not a cosmetic
difference.

## Get a key

1. <https://console.cloud.google.com/> — create a project.
2. Enable **YouTube Data API v3**.
3. Credentials — API key.
4. Put it in `.env.local` at the repo root as `YOUTUBE_API_KEY=...`, or export it
   in your shell. The pipeline reads the same variable the web app does — one key,
   one place.

The key is free. The quota is 10,000 units per day, resetting at midnight
Pacific.

---

## Run the pipeline

Every command is run from the **repo root**.

```bash
# 1. Find candidate channels. Search costs 100 units per call, so this is
#    budget-capped to 20% of the day's quota and is the only step that uses it.
python -m publishml.collect --discover

# 2. Walk those channels' uploads playlists. 2 units per 50 videos - 50x cheaper
#    per row than search, which is why this is where the volume comes from.
#    Re-run daily; it resumes where it stopped and skips ids it already has.
python -m publishml.collect --harvest --max-per-channel 60

# 3. Download thumbnails. No quota cost (plain HTTP to i.ytimg.com).
python -m publishml.collect --thumbs --thumb-limit 20000

# 4. Geometric thumbnail features: text coverage, faces, contrast, saturation,
#    rule-of-thirds offset. Pillow + optional OpenCV, no network.
python -m publishml.thumbs

# 5. Build the training set: 64 features per video, and the label - each video's
#    percentile rank WITHIN ITS OWN NICHE CELL (category x channel size x form).
#    Also writes the per-cell percentile distributions the advice is drawn from.
python -m publishml.labels

# 6. Train. Long-form and Shorts are different games; train them separately.
python -m publishml.train --shorts long

# 7. Export to the JSON the TypeScript scorer reads, straight into the app.
python -m publishml.export --out src/lib/ml/publish-model.json

# 8. Held-out metrics, printed and written to the model card.
python -m publishml.evaluate
```

Steps 1-3 are quota-bound and meant to be repeated over several days: harvest
adds videos, and the model improves with them. Steps 4-8 are pure CPU and can be
re-run any time.

### Why the label is a within-niche percentile

Raw view count measures the channel, not the video. A 40k-view video from a
2k-subscriber channel outperformed a 400k-view video from a 5M-subscriber channel,
and a model trained on views learns "have more subscribers" — true, useless, and
not something a creator can act on before publishing. Ranking within a cell of
comparable channels removes the channel's size from the target.

### Why 8 of the 64 features are frozen

`age_days_log`, `channel_age_days_log`, `channel_subs_log`, `channel_videos_log`,
`has_thumb`, `licensed`, `made_for_kids` and `thumb_aspect` are **context**: real
predictors that no creator can change on the way to publishing. They stay in the
model — dropping them would make the score worse — but the recommender re-pins
every one of them to its original value before scoring a counterfactual. Without
that, the top suggestion would be "gain 400,000 subscribers".

---

## Verify it, and keep it honest

```bash
# End-to-end on ~5k throwaway rows: collect through export, no API key needed.
PUBLISHML_DATA=ml/data-smoke python -m publishml.smoke

# Regenerate the Python<->TypeScript parity fixture after ANY change to
# features.py. Then run the TS side, which recomputes every value and compares.
python -m publishml.parity
npx vitest run src/lib/ml/
```

**Run `publishml.parity` after every change to `features.py`.** The model trains
in Python and scores in TypeScript over the same positional 64-number vector. If
the two extractors drift, nothing breaks — the app returns confident, wrong
scores, with no error anywhere. Five real divergences have already been caught
this way and are pinned by tests:

| Behaviour | Python | JavaScript |
|---|---|---|
| String length | `len(s)` counts code points | `s.length` counts UTF-16 units |
| Line splitting | empty string gives no lines; a trailing terminator adds none | `split` yields an empty leading and trailing element |
| Weekday | `weekday()` has Monday = 0 | `getUTCDay()` has Sunday = 0 |
| Word characters | `\w` is Unicode by default | ASCII unless `\p{L}` is used |
| Empty dict | falsy | truthy |

A sixth lives in the cell key: `labels.py` resolves the numeric `categoryId`
through `config.CATEGORIES` to a **name** before building it, so a cell is
`People & Blogs|small|long`, never `22|small|long`. `benchmark.ts` mirrors that
map for the same reason.

---

## Environment variables

| Variable | Meaning |
|---|---|
| `YOUTUBE_API_KEY` | Required for `collect`. Shared with the web app. |
| `PUBLISHML_DATA` | Data root. Defaults to `ml/data`. Set it to isolate a run. |
| `PUBLISHML_QUOTA` | Daily quota units. Defaults to 10,000 — raise it only if your project genuinely has more. |
| `PUBLISH_MODEL_PATH` | Read by the **app**, not the pipeline: an absolute path to the artefact, overriding `src/lib/ml/publish-model.json`. |

## What lands where

```
ml/data/raw/channels.jsonl          discovered channels + statistics
ml/data/raw/videos.jsonl            one row per harvested video
ml/data/raw/thumbs/                 downloaded jpgs
ml/data/raw/thumb_features.jsonl    output of publishml.thumbs
ml/data/build/dataset.jsonl         64 features + within-niche label
ml/data/build/dataset-summary.json  row counts, cells, coverage
ml/data/model/model.txt|.pkl        the trained booster
ml/data/model/metrics.json          held-out metrics
ml/data/model/publish-model.json    the export the app reads
src/lib/ml/publish-model.json       where --out should put it
```

`ml/data/` and `ml/data-smoke/` are gitignored. **Never commit the smoke
artefact** — it is trained on throwaway rows (rank correlation around 0.21) and
would put a meaningless score in front of users under a real-looking model card.

## Reading the result

A weak model produces **no advice**, not weak advice. `MIN_LIFT` is 1.5 points:
an edit the model cannot back by at least that much is dropped. On the smoke
artefact all 17 levers are tried, the best is worth 0.66 points, and the report
comes back with an empty suggestion list plus `suggestionsConsidered: 9` — so the
UI can say "tried 9 changes, none moves the score by more than 0.7" instead of
rendering a blank panel. The niche benchmark still shows its gaps, because those
are measured facts about the distribution rather than model predictions.

More harvested videos raise the correlation, and the suggestions appear on their
own.
