"""
Paths, quota constants, and the sampling frame for the Publish training pipeline.

Everything a reader might otherwise have to guess at is written down here: what a
YouTube API call costs, why the age band is what it is, and how a channel is
bucketed. Nothing in this file touches the network.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- Paths ------------------------------------------------------------------
ML_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("PUBLISHML_DATA", ML_DIR / "data"))
RAW_DIR = DATA_DIR / "raw"
THUMB_DIR = RAW_DIR / "thumbs"
BUILD_DIR = DATA_DIR / "build"
MODEL_DIR = DATA_DIR / "model"

CHANNELS_JSONL = RAW_DIR / "channels.jsonl"
VIDEOS_JSONL = RAW_DIR / "videos.jsonl"
THUMB_FEATURES_JSONL = RAW_DIR / "thumb_features.jsonl"
STATE_JSON = DATA_DIR / "state.json"

for _d in (DATA_DIR, RAW_DIR, THUMB_DIR, BUILD_DIR, MODEL_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# --- API quota --------------------------------------------------------------
# A free YouTube Data API v3 project gets 10,000 quota units per day, reset at
# midnight Pacific. The costs below are the published per-call prices, and they
# are the whole reason the collector is shaped the way it is:
#
#   search.list        100 units -> 50 results  = 2.00 units per result
#   playlistItems.list   1 unit  -> 50 results  = 0.02 units per result
#   videos.list          1 unit  -> 50 videos   = 0.02 units per video
#   channels.list        1 unit  -> 50 channels = 0.02 units per channel
#
# Search is 100x more expensive per row than walking a channel's uploads
# playlist. So search is used ONLY to discover channels, and every video is then
# harvested through the playlist walk. At 2 units per 50 videos (one
# playlistItems page plus one videos.list batch) a single day of free quota buys
# on the order of 200,000 videos, which is what makes "as many videos as
# possible" a real target on a free key rather than a slogan.
QUOTA_PER_DAY = int(os.environ.get("PUBLISHML_QUOTA", "10000"))

# Units held back so collection cannot drain the quota the running app might
# need. The app does not use this key today, but a shared key is the normal case
# and an exhausted key fails closed and silently.
QUOTA_RESERVE = 200

COST_SEARCH = 100
COST_LIST = 1

# Fraction of a day's usable quota that discovery (search) may consume; the rest
# goes to harvesting. 20% of 9,800 units is ~19 searches, i.e. up to ~950
# candidate channels per day, far more than one day of harvesting can drain.
DISCOVERY_SHARE = 0.20

# --- Sampling frame ---------------------------------------------------------
# Only videos in this age band are used for training.
#
# Lower bound: view counts climb steeply for the first few weeks, so a 3-day-old
# video and a 3-month-old video are not comparable. 30 days is where the curve
# has flattened enough in most niches that the remaining growth is small next to
# the between-video differences we want to learn.
#
# Upper bound: a five-year-old video was optimised for a different
# recommendation system, different thumbnail conventions, and a different
# audience. Two years trades some rows for rows that describe the platform as it
# behaves now.
MIN_AGE_DAYS = 30
MAX_AGE_DAYS = 730

# A channel needs enough harvested uploads for its own median to mean anything.
# The label is relative to that median, so below this count the denominator is
# noise and every row from the channel is dropped.
MIN_VIDEOS_PER_CHANNEL = 8

# Shorts behave differently enough - different surface, different retention
# mechanics, a different role for the thumbnail - that mixing them with
# long-form teaches the model contradictions. They are collected but tagged, and
# training filters to one form at a time.
SHORTS_MAX_SECONDS = 60

# Channel-size buckets. Reach scales with subscriber count in a way that has
# nothing to do with the video, so the label is a percentile WITHIN a bucket: a
# 5k-subscriber channel is compared with other 5k channels, never with MrBeast.
# Boundaries are subscriber counts.
SIZE_BUCKETS = [
    ("nano", 0, 1_000),
    ("micro", 1_000, 10_000),
    ("small", 10_000, 100_000),
    ("mid", 100_000, 1_000_000),
    ("large", 1_000_000, 10_000_000),
    ("mega", 10_000_000, 10**12),
]


def size_bucket(subscribers: int) -> str:
    """Bucket name for a subscriber count. Hidden counts arrive as 0 -> nano."""
    for name, lo, hi in SIZE_BUCKETS:
        if lo <= subscribers < hi:
            return name
    return "mega"


# YouTube's assignable video categories. Hardcoded because videoCategories.list
# is region-scoped and these ids have been stable for over a decade; the
# collector can still refresh them if that ever stops being true.
CATEGORIES = {
    "1": "Film & Animation",
    "2": "Autos & Vehicles",
    "10": "Music",
    "15": "Pets & Animals",
    "17": "Sports",
    "18": "Short Movies",
    "19": "Travel & Events",
    "20": "Gaming",
    "21": "Videoblogging",
    "22": "People & Blogs",
    "23": "Comedy",
    "24": "Entertainment",
    "25": "News & Politics",
    "26": "Howto & Style",
    "27": "Education",
    "28": "Science & Technology",
    "29": "Nonprofits & Activism",
    "30": "Movies",
    "31": "Anime/Animation",
    "32": "Action/Adventure",
    "33": "Classics",
    "34": "Comedy",
    "35": "Documentary",
    "36": "Drama",
    "37": "Family",
    "38": "Foreign",
    "39": "Horror",
    "40": "Sci-Fi/Fantasy",
    "41": "Thriller",
    "42": "Shorts",
    "43": "Shows",
    "44": "Trailers",
}

# Seed queries for channel discovery, one per niche the product actually serves.
# Discovery quality matters more than quantity: the model learns what separates a
# good video from a mediocre one INSIDE a niche, so a niche needs a spread of
# channels rather than only its stars. The queries are generic topic words rather
# than "best" or "viral" so the sample is not all outliers.
SEED_QUERIES = [
    "productivity tips", "personal finance", "software tutorial", "web development",
    "machine learning explained", "video editing tutorial", "camera review",
    "home cooking", "baking recipes", "meal prep", "home workout", "strength training",
    "running training", "yoga practice", "language learning", "study techniques",
    "history documentary", "science explained", "space astronomy", "car review",
    "motorcycle touring", "woodworking project", "3d printing", "electronics repair",
    "gardening beginners", "home renovation", "interior design", "minimalism",
    "travel vlog", "budget travel", "photography tutorial", "drawing tutorial",
    "music production", "guitar lesson", "piano lesson", "gaming walkthrough",
    "indie game review", "board games", "chess improvement", "sports analysis",
    "football tactics", "basketball skills", "fashion styling", "skincare routine",
    "hair tutorial", "parenting advice", "pet training", "dog behaviour",
    "small business", "marketing strategy", "public speaking", "career advice",
    "job interview", "book review", "film analysis", "animation breakdown",
    "podcast highlights", "news explainer", "real estate investing", "crypto explained",
]

# --- HTTP -------------------------------------------------------------------
API_BASE = "https://www.googleapis.com/youtube/v3"
HTTP_TIMEOUT = 20
HTTP_RETRIES = 4
USER_AGENT = "publish-ml/1.0 (+https://publish.genapps.online)"
