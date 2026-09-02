/**
 * S3 object deletion for the erasure sweep — the storage half of GDPR Art. 17.
 *
 * The DB cascade in the purge route removes every row, but the media a deleted
 * account uploaded (videos, voiceovers, thumbnails, frame sheets) lives in
 * object storage under `uploads/<clerkId>/…` and survives the account. This
 * module removes that prefix when the app is configured for storage.
 *
 * Same hand-rolled SigV4 approach as `upload/post-policy.ts` (no AWS SDK in the
 * dependency tree): a signed DELETE per object, discovered by listing the
 * prefix. R2/MinIO deployments use the same S3 ListObjectsV2 + DeleteObject
 * surface through their S3-compatible endpoint.
 */

import { createHash, createHmac } from 'node:crypto';
import { env } from '@/lib/env';

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

interface Scope {
  amzDate: string;
  dateStamp: string;
  region: string;
}

function amzScope(now: Date, region: string): Scope {
  const iso = now.toISOString();
  const dateStamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
  const amzDate = `${dateStamp}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { amzDate, dateStamp, region };
}

/** Host the request goes to: explicit endpoint (R2/MinIO) or virtual-hosted AWS. */
function host(bucket: string, region: string, endpoint: string | undefined): string {
  if (endpoint) {
    try {
      return new URL(endpoint).host;
    } catch {
      return endpoint;
    }
  }
  return `${bucket}.s3.${region}.amazonaws.com`;
}

/** Base URL for object operations (path-style for endpoint deployments). */
function objectUrl(bucket: string, region: string, endpoint: string | undefined, key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  if (endpoint) {
    return `${endpoint.replace(/\/+$/, '')}/${bucket}/${encoded}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${encoded}`;
}

/**
 * One signed request against object storage. Builds the canonical request per
 * the SigV4 REST spec and returns the fetch-ready headers.
 */
async function signedFetch(
  method: 'GET' | 'DELETE',
  url: string,
  hostHeader: string,
  now: Date,
): Promise<Response> {
  const { amzDate, dateStamp, region } = amzScope(now, env.S3_REGION || 'auto');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;

  const parsed = new URL(url);
  // Canonical query: URLSearchParams sorts by insertion, so rebuild sorted.
  const canonicalQuery = [...parsed.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // Path-style endpoints: /<bucket>/<key>; virtual-hosted: /<key>.
  const canonicalUri = parsed.pathname || '/';

  const canonicalHeaders = `host:${hostHeader}\nx-amz-content-sha256:${sha256Hex('')}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    sha256Hex(''),
  ].join('\n');

  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${env.S3_SECRET_ACCESS_KEY}`, dateStamp), region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return fetch(url, {
    method,
    headers: {
      Host: hostHeader,
      'x-amz-content-sha256': sha256Hex(''),
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
}

export interface PurgeObjectsResult {
  /** Objects enumerated under the prefix. */
  listed: number;
  /** Delete requests that returned 2xx or 404 (already gone). */
  deleted: number;
  /** Failures — the sweep logs them; they do not block the account erasure. */
  failed: number;
}

/**
 * Delete every object under `uploads/<clerkId>/`. Bounded per call the same way
 * the DB batch is; a prefix with thousands of objects is drained over multiple
 * sweeps. Storage unconfigured → { skipped } with zero network work.
 */
export async function purgeUserObjects(
  clerkId: string,
  /** Injectable for tests. */
  now: Date = new Date(),
): Promise<PurgeObjectsResult & { skipped?: boolean }> {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return { listed: 0, deleted: 0, failed: 0, skipped: true };
  }

  const region = env.S3_REGION || 'auto';
  const endpoint = env.S3_ENDPOINT || undefined;
  const hostHeader = host(env.S3_BUCKET, region, endpoint);
  const prefix = `uploads/${clerkId}/`;
  const result: PurgeObjectsResult = { listed: 0, deleted: 0, failed: 0 };

  let continuationToken: string | undefined;
  do {
    const listUrl = new URL(
      endpoint
        ? `${endpoint.replace(/\/+$/, '')}/${env.S3_BUCKET}`
        : `https://${host(env.S3_BUCKET, region, endpoint)}`,
    );
    listUrl.searchParams.set('list-type', '2');
    listUrl.searchParams.set('prefix', prefix);
    listUrl.searchParams.set('max-keys', '500');
    if (continuationToken) listUrl.searchParams.set('continuation-token', continuationToken);

    const res = await signedFetch('GET', listUrl.toString(), hostHeader, now);
    if (!res.ok) {
      throw new Error(`S3 list ${prefix} failed: ${res.status}`);
    }
    const xml = await res.text();

    // Minimal parse of the two fields the sweep needs. A full XML parser for a
    // flat list is weight the route does not need.
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) =>
      m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
    );
    continuationToken =
      xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? undefined;

    result.listed += keys.length;

    for (const key of keys) {
      try {
        const del = await signedFetch(
          'DELETE',
          objectUrl(env.S3_BUCKET, region, endpoint, key),
          hostHeader,
          now,
        );
        if (del.ok || del.status === 404) {
          result.deleted += 1;
        } else {
          result.failed += 1;
          console.error(`[s3-purge] DELETE ${key} -> ${del.status}`);
        }
      } catch (e) {
        result.failed += 1;
        console.error(`[s3-purge] DELETE ${key} threw`, e);
      }
    }
  } while (continuationToken);

  return result;
}
