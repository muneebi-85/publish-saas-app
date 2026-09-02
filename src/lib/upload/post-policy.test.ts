/**
 * Presigned POST policy construction.
 *
 * The security property under test is not "the signature is a valid SigV4
 * signature" (that would just re-run the code under test) — it is that the
 * policy document the provider enforces actually contains the constraints the
 * presign route claims: exact key, exact Content-Type, and the size window.
 * A policy missing any of those is the stored-XSS / storage-DoS hole the
 * presigned PUT had.
 *
 * The signature is verified structurally: deterministic for identical inputs,
 * and changing ANY signing input (key material, region, scope, policy body)
 * changes the signature.
 */

import { describe, it, expect } from 'vitest';
import { buildPresignedPost } from './post-policy';

const BASE: Parameters<typeof buildPresignedPost>[0] = {
  bucket: 'publish-uploads',
  key: 'uploads/user_2AbC/video/1730000000-clip.mp4',
  contentType: 'video/mp4',
  minBytes: 1,
  maxBytes: 4 * 1024 * 1024 * 1024,
  expiresInSeconds: 900,
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMIexamplekey',
  region: 'us-east-1',
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  owner: 'user_2AbC',
  slot: 'video',
};

describe('buildPresignedPost policy document', () => {
  it('pins the exact bucket and key', () => {
    const { policyB64 } = buildPresignedPost(BASE);
    const policy = JSON.parse(Buffer.from(policyB64, 'base64').toString('utf8'));
    expect(policy.conditions).toContainEqual({ bucket: BASE.bucket });
    expect(policy.conditions).toContainEqual({ key: BASE.key });
  });

  it('pins the exact Content-Type the slot allowlist approved', () => {
    for (const type of ['image/png', 'video/mp4', 'image/jpeg', 'text/plain']) {
      const { policyB64 } = buildPresignedPost({ ...BASE, contentType: type });
      const policy = JSON.parse(Buffer.from(policyB64, 'base64').toString('utf8'));
      expect(policy.conditions).toContainEqual(['eq', '$Content-Type', type]);
    }
  });

  it('enforces the size window the route validated', () => {
    const { policyB64 } = buildPresignedPost({
      ...BASE,
      minBytes: 1,
      maxBytes: 15 * 1024 * 1024,
    });
    const policy = JSON.parse(Buffer.from(policyB64, 'base64').toString('utf8'));
    expect(policy.conditions).toContainEqual(['content-length-range', 1, 15 * 1024 * 1024]);
  });

  it('expires at the requested deadline, not later', () => {
    const { policyB64 } = buildPresignedPost(BASE);
    const policy = JSON.parse(Buffer.from(policyB64, 'base64').toString('utf8'));
    const expires = Date.parse(policy.expiration);
    expect(expires).toBeGreaterThan(Date.now());
    // ~15 minutes from now, with slack for how long the call took.
    expect(expires).toBeLessThanOrEqual(Date.now() + 901_000);
  });

  it('admits the metadata fields the form will carry', () => {
    const { policyB64 } = buildPresignedPost(BASE);
    const policy = JSON.parse(Buffer.from(policyB64, 'base64').toString('utf8'));
    expect(policy.conditions).toContainEqual(['starts-with', '$x-amz-meta-slot', '']);
    expect(policy.conditions).toContainEqual(['starts-with', '$x-amz-meta-owner', '']);
  });
});

describe('buildPresignedPost form fields', () => {
  it('carries the policy and its SigV4 verification fields', () => {
    const { fields, policyB64 } = buildPresignedPost(BASE);
    expect(fields.policy).toBe(policyB64);
    expect(fields['x-amz-algorithm']).toBe('AWS4-HMAC-SHA256');
    expect(fields['x-amz-signature']).toMatch(/^[0-9a-f]{64}$/);
    // Credential is <key>/<date>/<region>/s3/aws4_request.
    expect(fields['x-amz-credential']).toMatch(
      /^AKIAEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request$/,
    );
    expect(fields['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(fields.key).toBe(BASE.key);
    expect(fields['Content-Type']).toBe(BASE.contentType);
    expect(fields['x-amz-meta-owner']).toBe(BASE.owner);
  });

  it('posts to the explicit endpoint path-style for R2', () => {
    expect(buildPresignedPost(BASE).url).toBe(
      'https://acct.r2.cloudflarestorage.com/publish-uploads',
    );
  });

  it('posts to the virtual-hosted regional URL when no endpoint is set (AWS S3)', () => {
    const r = buildPresignedPost({ ...BASE, endpoint: '' });
    expect(r.url).toBe('https://publish-uploads.s3.us-east-1.amazonaws.com');
  });
});

describe('signature sensitivity', () => {
  // Same injected clock → byte-identical result; the second argument freezes
  // time so determinism is not confused with "called within the same second".
  const frozen = new Date('2026-08-30T12:00:00.000Z');

  it('is deterministic for identical inputs and clock', () => {
    const a = buildPresignedPost(BASE, frozen);
    const b = buildPresignedPost(BASE, frozen);
    expect(a.fields['x-amz-signature']).toBe(b.fields['x-amz-signature']);
    expect(a.policyB64).toBe(b.policyB64);
    expect(a.url).toBe(b.url);
  });

  it('rounds the frozen clock into a valid amz date and credential', () => {
    const { fields } = buildPresignedPost(BASE, frozen);
    expect(fields['x-amz-date']).toBe('20260830T120000Z');
    expect(fields['x-amz-credential']).toMatch(
      /^AKIAEXAMPLE\/20260830\/us-east-1\/s3\/aws4_request$/,
    );
  });

  it.each([
    ['key', { key: 'uploads/other/other.mp4' }],
    ['content type', { contentType: 'text/html' }],
    ['size ceiling', { maxBytes: 15 }],
    ['secret', { secretAccessKey: 'different' }],
    ['region', { region: 'eu-west-1' }],
  ] as const)('changes when %s changes', (_label, patch) => {
    const base = buildPresignedPost(BASE).fields['x-amz-signature'];
    const moved = buildPresignedPost({ ...BASE, ...patch }).fields['x-amz-signature'];
    expect(moved).not.toBe(base);
  });
});
