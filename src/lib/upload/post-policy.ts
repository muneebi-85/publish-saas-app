/**
 * Presigned POST for one upload slot — the enforcement the presigned PUT could
 * not provide.
 *
 * WHY POST, NOT PUT
 * ─────────────────
 * `getSignedUrl(PutObjectCommand)` signs the request but the SDK deliberately
 * marks `content-type` unsignable (`S3RequestPresigner.prepareRequest` adds it
 * to `unsignableHeaders`), and `ContentLength` is not covered either. So a URL
 * issued for `image/png` could be used to PUT a `text/html` object — served
 * from our own public storage origin with the attacker-chosen type — and the
 * per-slot size ceilings were advisory only.
 *
 * A presigned POST is different: the policy document is part of the signature,
 * and the PROVIDER enforces its conditions on the wire:
 *
 *   - `['eq', '$Content-Type', type]`       → a POST carrying any other
 *                                             Content-Type form field is
 *                                             rejected with 403.
 *   - `['content-length-range', 1, max]`    → a body outside the range is
 *                                             rejected (EntityTooLarge /
 *                                             EntityTooSmall) before it is
 *                                             stored.
 *
 * This module builds and signs that policy. It is pure and dependency-free
 * beyond `node:crypto`, so the signature construction is pinned by unit tests
 * against an independent implementation of the same spec.
 */

import { createHash, createHmac } from 'node:crypto';

export interface PostPolicyParams {
  bucket: string;
  /** Exact object key. The policy pins it, so a form cannot retarget the write. */
  key: string;
  /** The single Content-Type the POST may carry. */
  contentType: string;
  minBytes: number;
  maxBytes: number;
  /** Seconds the POST form stays usable. */
  expiresInSeconds: number;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Object-storage endpoint (R2/MinIO); empty for AWS virtual-hosted S3. */
  endpoint?: string;
  /** Caller's own namespace tag, stored as object metadata. */
  owner: string;
  slot: string;
}

export interface PostPolicyResult {
  /** The URL the browser POSTs the multipart form to. */
  url: string;
  /** Form fields, in the order they must appear (file appended last). */
  fields: Record<string, string>;
  /** The base64 policy document, for tests and debugging. */
  policyB64: string;
}

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function utcAmzDate(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString();
  // "2026-08-30T09:00:00.000Z" → date 20260830, amzDate 20260830T090000Z
  const dateStamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
  const amzDate = `${dateStamp}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { amzDate, dateStamp };
}

/**
 * The URL the POST goes to. Mirrors the S3Client addressing the app already
 * uses: explicit endpoint + path style for R2/MinIO, virtual-hosted otherwise.
 */
function postUrl(params: Pick<PostPolicyParams, 'bucket' | 'region' | 'endpoint'>): string {
  if (params.endpoint) {
    return `${params.endpoint.replace(/\/+$/, '')}/${params.bucket}`;
  }
  return `https://${params.bucket}.s3.${params.region}.amazonaws.com`;
}

export function buildPresignedPost(
  params: PostPolicyParams,
  /** Injectable clock for tests; defaults to now. */
  now: Date = new Date(),
): PostPolicyResult {
  const { amzDate, dateStamp } = utcAmzDate(now);
  const scope = `${dateStamp}/${params.region}/s3/aws4_request`;
  const expiration = new Date(now.getTime() + params.expiresInSeconds * 1000).toISOString();

  // Exact-key match (not starts-with): the key was server-generated and the
  // form may not write anywhere else. content-length-range is the size ceiling
  // the provider enforces.
  const policy = {
    expiration,
    conditions: [
      { bucket: params.bucket },
      { key: params.key },
      ['eq', '$Content-Type', params.contentType],
      ['content-length-range', params.minBytes, params.maxBytes],
      // Every x-amz-meta-* form field needs a matching condition or the whole
      // POST is rejected as carrying fields the policy does not know about.
      ['starts-with', '$x-amz-meta-slot', ''],
      ['starts-with', '$x-amz-meta-owner', ''],
    ],
  };

  const policyB64 = Buffer.from(JSON.stringify(policy), 'utf8').toString('base64');

  // SigV4 POST-policy string-to-sign: the final line is the SHA-256 of the
  // BASE64 POLICY itself (not of a canonical request — POST object signing is
  // its own documented flow).
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(policyB64)}`;

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${params.secretAccessKey}`, dateStamp), params.region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const fields: Record<string, string> = {
    key: params.key,
    'x-amz-meta-slot': params.slot,
    'x-amz-meta-owner': params.owner,
    // Sets the STORED object's content type and is what the policy matches on.
    'Content-Type': params.contentType,
    policy: policyB64,
    'x-amz-algorithm': 'AWS4-HMAC-SHA256',
    'x-amz-credential': `${params.accessKeyId}/${scope}`,
    'x-amz-date': amzDate,
    'x-amz-signature': signature,
  };

  return {
    url: postUrl(params),
    fields,
    policyB64,
  };
}
