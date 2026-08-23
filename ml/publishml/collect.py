"""
Collector: discover channels, then harvest every upload we can afford.

Run it as a module so it can be re-run daily and pick up where it stopped:

    python -m publishml.collect --discover      # spend the search budget
    python -m publishml.collect --harvest       # walk uploads until quota is gone
    python -m publishml.collect --thumbs        # download thumbnails (no quota cost)
    python -m publishml.collect                 # all three, in that order

Everything is append-only JSONL keyed by id, and every stage is idempotent:
re-running skips what is already on disk. That matters more than speed here,
because the run WILL be interrupted - by the daily quota wall if nothing else.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import requests

from . import config
from .ytapi import ApiError, QuotaExhausted, YouTube


# --- JSONL helpers ----------------------------------------------------------
def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                # A half-written final line is the normal shape of "the process
                # was killed mid-append". Skip it rather than refuse to start.
                continue


def append_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("a", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def existing_ids(path: Path, key: str = "id") -> set[str]:
    return {row[key] for row in read_jsonl(path) if key in row}


# --- env --------------------------------------------------------------------
def api_key() -> str:
    """
    The key, read from the environment or from the app's .env files.

    The pipeline shares YOUTUBE_API_KEY with the web app on purpose: one key,
    one quota, one place to rotate it.
    """
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if key:
        return key
    for name in (".env.local", ".env"):
        env_file = config.ML_DIR.parent / name
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line.startswith("YOUTUBE_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


# --- stage 1: discovery -----------------------------------------------------
def discover(yt: YouTube, queries: list[str], budget: int) -> int:
    """
    Spend `budget` units of search to collect candidate channel ids.

    Only ids and the query that found them are recorded here. Subscriber counts
    and the uploads playlist id come from the 1-unit channels.list call in the
    harvest stage, because paying 100 units for data a 1-unit call also returns
    is how a day's quota disappears with nothing to show for it.
    """
    seen = existing_ids(config.CHANNELS_JSONL, "id")
    cursors = yt.ledger.cursors.setdefault("discover", {})
    spent = 0
    added = 0

    for query in queries:
        if spent + config.COST_SEARCH > budget:
            break
        if cursors.get(query) == "done":
            continue
        try:
            page = yt.search_channels(query, page_token=cursors.get(query) or None)
        except QuotaExhausted:
            raise
        except ApiError as err:
            print(f"  ! search '{query}' failed: {err}", file=sys.stderr)
            cursors[query] = "done"
            continue

        spent += config.COST_SEARCH
        rows = []
        for item in page.get("items", []):
            cid = item.get("id", {}).get("channelId")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            rows.append(
                {
                    "id": cid,
                    "discoveredVia": query,
                    "discoveredAt": datetime.now(timezone.utc).isoformat(),
                    "hydrated": False,
                }
            )
        append_jsonl(config.CHANNELS_JSONL, rows)
        added += len(rows)

        cursors[query] = page.get("nextPageToken") or "done"
        yt.ledger.save()
        print(f"  + {len(rows):>2} channels from '{query}' ({spent}/{budget} units)")

    return added


# --- stage 2: harvest -------------------------------------------------------
def hydrate_channels(yt: YouTube, ids: list[str]) -> dict[str, dict[str, Any]]:
    """channels.list in batches of 50. One unit buys 50 channels."""
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(ids), 50):
        batch = ids[i : i + 50]
        try:
            page = yt.channels(batch)
        except ApiError as err:
            print(f"  ! channels.list failed: {err}", file=sys.stderr)
            continue
        for item in page.get("items", []):
            stats = item.get("statistics", {})
            snippet = item.get("snippet", {})
            out[item["id"]] = {
                "id": item["id"],
                "title": snippet.get("title"),
                "country": snippet.get("country"),
                "publishedAt": snippet.get("publishedAt"),
                "subscribers": int(stats.get("subscriberCount", 0) or 0),
                "hiddenSubscribers": bool(stats.get("hiddenSubscriberCount")),
                "videoCount": int(stats.get("videoCount", 0) or 0),
                "totalViews": int(stats.get("viewCount", 0) or 0),
                "uploadsPlaylist": item.get("contentDetails", {})
                .get("relatedPlaylists", {})
                .get("uploads"),
                "topics": item.get("topicDetails", {}).get("topicCategories", []),
                "hydrated": True,
                "hydratedAt": datetime.now(timezone.utc).isoformat(),
            }
    return out


def harvest(yt: YouTube, max_per_channel: int) -> int:
    """
    Walk uploads playlists and pull full video records until quota runs out.

    Cost per channel is roughly `2 * ceil(videos / 50)` units: one playlistItems
    page and one videos.list batch per 50 videos. `max_per_channel` caps how
    deep we go into any one channel's back catalogue, which matters because the
    label is channel-relative - 80 videos from one channel teaches less than 8
    videos from ten channels, and costs the same.
    """
    channels = {row["id"]: row for row in read_jsonl(config.CHANNELS_JSONL)}
    # Later rows win, so a hydrated row overwrites its discovery stub.
    todo = [c for c in channels.values() if not c.get("harvested")]
    if not todo:
        print("  nothing left to harvest - run --discover for more channels")
        return 0

    unhydrated = [c["id"] for c in todo if not c.get("hydrated")]
    if unhydrated:
        print(f"  hydrating {len(unhydrated)} channels ({len(unhydrated) // 50 + 1} units)")
        hydrated = hydrate_channels(yt, unhydrated)
        append_jsonl(config.CHANNELS_JSONL, list(hydrated.values()))
        for cid, row in hydrated.items():
            channels[cid] = {**channels.get(cid, {}), **row}
        todo = [channels[c["id"]] for c in todo if channels[c["id"]].get("hydrated")]

    have = existing_ids(config.VIDEOS_JSONL)
    total_new = 0
    done_channels: list[dict[str, Any]] = []

    # Smallest channels first. They are the ones a paying creator resembles, and
    # they are cheapest to finish, so an interrupted run still leaves whole
    # channels rather than a scatter of half-walked ones.
    todo.sort(key=lambda c: c.get("subscribers", 0))

    for channel in todo:
        playlist = channel.get("uploadsPlaylist")
        if not playlist:
            done_channels.append({**channel, "harvested": True, "harvestNote": "no uploads playlist"})
            continue
        if channel.get("videoCount", 0) < config.MIN_VIDEOS_PER_CHANNEL:
            done_channels.append({**channel, "harvested": True, "harvestNote": "too few uploads"})
            continue

        try:
            new = harvest_channel(yt, channel, playlist, have, max_per_channel)
        except QuotaExhausted as err:
            print(f"  quota wall: {err}")
            break
        except ApiError as err:
            print(f"  ! {channel['id']}: {err}", file=sys.stderr)
            done_channels.append({**channel, "harvested": True, "harvestNote": str(err)[:120]})
            continue

        total_new += new
        done_channels.append({**channel, "harvested": True, "harvestedVideos": new})
        print(
            f"  + {new:>3} videos from {channel.get('title', channel['id'])[:40]:<40} "
            f"({yt.ledger.remaining()} units left)"
        )

    append_jsonl(config.CHANNELS_JSONL, done_channels)
    return total_new


def harvest_channel(
    yt: YouTube,
    channel: dict[str, Any],
    playlist: str,
    have: set[str],
    max_per_channel: int,
) -> int:
    """One channel: page the uploads playlist, then batch-fetch the videos."""
    ids: list[str] = []
    page_token: str | None = None
    while len(ids) < max_per_channel:
        page = yt.playlist_items(playlist, page_token)
        for item in page.get("items", []):
            vid = item.get("contentDetails", {}).get("videoId")
            if vid and vid not in have:
                ids.append(vid)
        page_token = page.get("nextPageToken")
        if not page_token:
            break

    ids = ids[:max_per_channel]
    if not ids:
        return 0

    written = 0
    for i in range(0, len(ids), 50):
        batch = ids[i : i + 50]
        page = yt.videos(batch)
        rows = [flatten_video(item, channel) for item in page.get("items", [])]
        rows = [r for r in rows if r]
        append_jsonl(config.VIDEOS_JSONL, rows)
        have.update(r["id"] for r in rows)
        written += len(rows)
    return written


def flatten_video(item: dict[str, Any], channel: dict[str, Any]) -> dict[str, Any] | None:
    """
    Reduce an API item to the fields the pipeline uses, and nothing else.

    Kept flat and explicit rather than storing the raw response: the raw payload
    is ~4x larger, and every field we keep is a field some later stage reads, so
    the file is self-documenting about what the model can possibly know.
    """
    snippet = item.get("snippet") or {}
    stats = item.get("statistics") or {}
    details = item.get("contentDetails") or {}
    status = item.get("status") or {}

    if not snippet.get("publishedAt"):
        return None

    thumbs = snippet.get("thumbnails") or {}
    best = None
    for name in ("maxres", "standard", "high", "medium", "default"):
        if name in thumbs:
            best = thumbs[name]
            break

    return {
        "id": item["id"],
        "channelId": snippet.get("channelId") or channel.get("id"),
        "channelTitle": snippet.get("channelTitle"),
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "tags": snippet.get("tags", []),
        "categoryId": snippet.get("categoryId"),
        "publishedAt": snippet.get("publishedAt"),
        "defaultLanguage": snippet.get("defaultLanguage") or snippet.get("defaultAudioLanguage"),
        "liveContent": snippet.get("liveBroadcastContent"),
        "thumbnailUrl": (best or {}).get("url"),
        "thumbnailWidth": (best or {}).get("width"),
        "thumbnailHeight": (best or {}).get("height"),
        "views": int(stats.get("viewCount", 0) or 0),
        "likes": int(stats.get("likeCount", 0) or 0) if "likeCount" in stats else None,
        "comments": int(stats.get("commentCount", 0) or 0) if "commentCount" in stats else None,
        "duration": details.get("duration"),
        "definition": details.get("definition"),
        "caption": details.get("caption") == "true",
        "licensedContent": bool(details.get("licensedContent")),
        "madeForKids": bool(status.get("madeForKids")),
        "license": status.get("license"),
        "topics": (item.get("topicDetails") or {}).get("topicCategories", []),
        "collectedAt": datetime.now(timezone.utc).isoformat(),
    }


# --- stage 3: thumbnails ----------------------------------------------------
def download_thumbs(limit: int, delay: float = 0.05) -> int:
    """
    Fetch thumbnails for harvested videos. No API quota is involved - these are
    plain image requests to i.ytimg.com - but they are rate-limited politely and
    stored once, because the feature pass reads them repeatedly.
    """
    session = requests.Session()
    session.headers["User-Agent"] = config.USER_AGENT
    fetched = 0
    for row in read_jsonl(config.VIDEOS_JSONL):
        if fetched >= limit:
            break
        url = row.get("thumbnailUrl")
        if not url:
            continue
        dest = config.THUMB_DIR / f"{row['id']}.jpg"
        if dest.exists() and dest.stat().st_size > 0:
            continue
        try:
            res = session.get(url, timeout=config.HTTP_TIMEOUT)
            if res.ok and res.content:
                dest.write_bytes(res.content)
                fetched += 1
        except requests.RequestException:
            continue
        time.sleep(delay)
    return fetched


# --- CLI --------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Collect YouTube training data.")
    parser.add_argument("--discover", action="store_true", help="find candidate channels (search, 100 units/call)")
    parser.add_argument("--harvest", action="store_true", help="walk uploads playlists (1 unit/50 videos)")
    parser.add_argument("--thumbs", action="store_true", help="download thumbnails (no quota cost)")
    parser.add_argument("--max-per-channel", type=int, default=60)
    parser.add_argument("--thumb-limit", type=int, default=20_000)
    parser.add_argument("--queries", type=int, default=0, help="cap discovery queries this run (0 = budget-limited)")
    args = parser.parse_args(argv)

    if not (args.discover or args.harvest or args.thumbs):
        args.discover = args.harvest = args.thumbs = True

    key = api_key()
    if not key and (args.discover or args.harvest):
        print(
            "No YOUTUBE_API_KEY found.\n\n"
            "  1. https://console.cloud.google.com/apis/library/youtube.googleapis.com -> Enable\n"
            "  2. https://console.cloud.google.com/apis/credentials -> Create credentials -> API key\n"
            "  3. Put YOUTUBE_API_KEY=... in .env.local\n\n"
            "The free tier is 10,000 units/day, which this collector turns into roughly\n"
            "200,000 videos per day. Nothing here needs OAuth or a paid plan.",
            file=sys.stderr,
        )
        return 2

    yt = YouTube(key) if key else None
    if yt:
        print(f"quota: {yt.ledger.today()} spent today, {yt.ledger.remaining()} available")

    if args.discover and yt:
        budget = int((config.QUOTA_PER_DAY - config.QUOTA_RESERVE) * config.DISCOVERY_SHARE)
        budget = min(budget, yt.ledger.remaining())
        queries = config.SEED_QUERIES[: args.queries] if args.queries else config.SEED_QUERIES
        print(f"\ndiscover: up to {budget} units")
        try:
            print(f"  {discover(yt, queries, budget)} new channels")
        except QuotaExhausted as err:
            print(f"  quota wall: {err}")

    if args.harvest and yt:
        print(f"\nharvest: {yt.ledger.remaining()} units available")
        try:
            print(f"  {harvest(yt, args.max_per_channel)} new videos")
        except QuotaExhausted as err:
            print(f"  quota wall: {err}")

    if args.thumbs:
        print(f"\nthumbs: up to {args.thumb_limit}")
        print(f"  {download_thumbs(args.thumb_limit)} downloaded")

    videos = sum(1 for _ in read_jsonl(config.VIDEOS_JSONL))
    channels = len({row["id"] for row in read_jsonl(config.CHANNELS_JSONL)})
    thumbs = sum(1 for _ in config.THUMB_DIR.glob("*.jpg"))
    print(f"\ntotals: {videos} videos, {channels} channels, {thumbs} thumbnails")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
