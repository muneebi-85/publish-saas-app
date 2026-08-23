"""
YouTube Data API v3 client with hard quota accounting.

Two things make this different from a bare `requests.get` loop:

1. QUOTA IS TRACKED LOCALLY, NOT DISCOVERED BY FAILING. The API answers
   403 quotaExceeded once the day's 10,000 units are gone, and by then the
   collector has already lost whatever it was mid-way through. Every call here
   debits a local ledger first and refuses to make the request when the day's
   budget is spent, so a run ends on a clean boundary and resumes tomorrow.

2. THE LEDGER SURVIVES RESTARTS. It is keyed by the quota day - midnight
   US/Pacific, which is when Google resets - so stopping and restarting the
   collector five times in an afternoon still respects one day's budget.

The client is deliberately synchronous. The bottleneck is quota, not latency:
9,800 units of playlist walking is at most ~9,800 HTTP calls, and at ~150ms each
that is well under an hour. Concurrency would only reach the quota wall sooner.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

import requests

from . import config


class QuotaExhausted(RuntimeError):
    """Raised when the day's local quota budget cannot cover the next call."""


class ApiError(RuntimeError):
    """A non-retryable API failure, with the response body attached."""


def quota_day(now: datetime | None = None) -> str:
    """
    The quota day a moment belongs to, as YYYY-MM-DD.

    Google resets quota at midnight US/Pacific. Pacific is UTC-8 in winter and
    UTC-7 in summer; using a fixed -8 makes the ledger roll over up to an hour
    late in summer, which errs toward under-spending rather than toward a
    surprise 403. That is the right direction to be wrong in.
    """
    now = now or datetime.now(timezone.utc)
    return (now - timedelta(hours=8)).strftime("%Y-%m-%d")


@dataclass
class Ledger:
    """Units spent per quota day, plus the collector's resume cursors."""

    spent: dict[str, int]
    cursors: dict[str, Any]

    @classmethod
    def load(cls) -> "Ledger":
        if config.STATE_JSON.exists():
            raw = json.loads(config.STATE_JSON.read_text(encoding="utf-8"))
            return cls(spent=raw.get("spent", {}), cursors=raw.get("cursors", {}))
        return cls(spent={}, cursors={})

    def save(self) -> None:
        payload = {"spent": self.spent, "cursors": self.cursors}
        tmp = config.STATE_JSON.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=1), encoding="utf-8")
        tmp.replace(config.STATE_JSON)

    def today(self) -> int:
        return self.spent.get(quota_day(), 0)

    def remaining(self) -> int:
        return max(0, config.QUOTA_PER_DAY - config.QUOTA_RESERVE - self.today())

    def charge(self, units: int) -> None:
        day = quota_day()
        self.spent[day] = self.spent.get(day, 0) + units


class YouTube:
    """Thin, quota-aware wrapper over the handful of endpoints we need."""

    def __init__(self, api_key: str, ledger: Ledger | None = None) -> None:
        if not api_key:
            raise ValueError(
                "No YouTube API key. Create one at "
                "https://console.cloud.google.com/apis/credentials (enable "
                "'YouTube Data API v3'), then set YOUTUBE_API_KEY in .env."
            )
        self.api_key = api_key
        self.ledger = ledger or Ledger.load()
        self.session = requests.Session()
        self.session.headers["User-Agent"] = config.USER_AGENT
        self.calls = 0

    # --- core ---------------------------------------------------------------
    def _get(self, endpoint: str, params: dict[str, Any], cost: int) -> dict[str, Any]:
        if self.ledger.remaining() < cost:
            raise QuotaExhausted(
                f"{self.ledger.today()} units spent today; "
                f"{self.ledger.remaining()} left, {cost} needed. "
                "Re-run after the Pacific-midnight reset - progress is saved."
            )

        url = f"{config.API_BASE}/{endpoint}"
        payload = {**params, "key": self.api_key}

        last_error: Exception | None = None
        for attempt in range(config.HTTP_RETRIES):
            try:
                res = self.session.get(url, params=payload, timeout=config.HTTP_TIMEOUT)
            except requests.RequestException as err:
                last_error = err
                time.sleep(2**attempt)
                continue

            # A 403 is either "quota gone" or "key/permission wrong". They need
            # opposite responses, so the reason is read rather than guessed.
            if res.status_code == 403:
                reason = _error_reason(res)
                # Charge it: the request reached Google and counted against the
                # key even though it failed, so the local ledger must agree.
                self.ledger.charge(cost)
                self.ledger.save()
                if reason in {"quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"}:
                    raise QuotaExhausted(f"API reports {reason}. Resume after the reset.")
                raise ApiError(f"403 {reason}: {res.text[:400]}")

            if res.status_code == 404:
                # A deleted channel or private playlist. Not retryable, not fatal.
                self.ledger.charge(cost)
                self.ledger.save()
                raise ApiError(f"404 for {endpoint} {params}")

            if res.status_code >= 500 or res.status_code == 429:
                last_error = ApiError(f"{res.status_code}: {res.text[:200]}")
                time.sleep(2**attempt)
                continue

            if not res.ok:
                self.ledger.charge(cost)
                self.ledger.save()
                raise ApiError(f"{res.status_code}: {res.text[:400]}")

            self.ledger.charge(cost)
            self.calls += 1
            # Saved every call rather than at exit: the process may be killed by
            # a closed laptop lid, and an under-counted ledger is what produces
            # the 403 this class exists to avoid.
            self.ledger.save()
            return res.json()

        raise ApiError(f"{endpoint} failed after {config.HTTP_RETRIES} attempts: {last_error}")

    # --- endpoints ----------------------------------------------------------
    def search_channels(self, query: str, page_token: str | None = None) -> dict[str, Any]:
        """Discover channels for a topic. 100 units - the expensive one."""
        params = {
            "part": "snippet",
            "type": "channel",
            "q": query,
            "maxResults": 50,
            "regionCode": "US",
            "relevanceLanguage": "en",
        }
        if page_token:
            params["pageToken"] = page_token
        return self._get("search", params, config.COST_SEARCH)

    def channels(self, ids: Iterable[str]) -> dict[str, Any]:
        """Statistics + the uploads playlist id for up to 50 channels. 1 unit."""
        ids = list(ids)[:50]
        return self._get(
            "channels",
            {
                "part": "snippet,statistics,contentDetails,topicDetails,brandingSettings",
                "id": ",".join(ids),
                "maxResults": 50,
            },
            config.COST_LIST,
        )

    def playlist_items(self, playlist_id: str, page_token: str | None = None) -> dict[str, Any]:
        """Walk a playlist 50 ids at a time. 1 unit - the cheap workhorse."""
        params = {
            "part": "contentDetails",
            "playlistId": playlist_id,
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token
        return self._get("playlistItems", params, config.COST_LIST)

    def videos(self, ids: Iterable[str]) -> dict[str, Any]:
        """Everything we train on, for up to 50 videos at a time. 1 unit."""
        ids = list(ids)[:50]
        return self._get(
            "videos",
            {
                # snippet:        title, description, tags, categoryId, publishedAt, thumbnails
                # statistics:     views, likes, comments
                # contentDetails: duration, definition, caption, licensedContent
                # status:         madeForKids, license, privacy
                # topicDetails:   Freebase topic ids (a coarse second opinion on category)
                "part": "snippet,statistics,contentDetails,status,topicDetails",
                "id": ",".join(ids),
                "maxResults": 50,
            },
            config.COST_LIST,
        )


def _error_reason(res: requests.Response) -> str:
    try:
        body = res.json()
        return body["error"]["errors"][0].get("reason", "unknown")
    except Exception:
        return "unknown"
