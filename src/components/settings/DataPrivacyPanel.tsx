'use client';

/**
 * Data & privacy controls.
 *
 * `scheduledFor` is seeded from the database by the settings page so a pending
 * deletion survives a reload — it used to live only in React state, which meant
 * a user who refreshed saw no sign that their account was queued for erasure.
 */

import React, { useState } from 'react';
import { Download, Trash2, Cookie, ExternalLink, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

export const DataPrivacyPanel: React.FC<{ scheduledFor?: string | null }> = ({
  scheduledFor: initialScheduledFor = null,
}) => {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [scheduledFor, setScheduledFor] = useState<string | null>(initialScheduledFor);
  const [deleteError, setDeleteError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          res.status === 429
            ? 'Export limit reached. Try again in an hour.'
            : data.error || 'Export failed.',
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `publish-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Export failed. Try again or email privacy@genapps.online.',
      );
    } finally {
      setExporting(false);
    }
  };

  const handleScheduleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.scheduledFor) {
        throw new Error(data.error || 'Could not schedule deletion.');
      }
      setScheduledFor(data.scheduledFor);
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Could not schedule deletion. Contact privacy@genapps.online.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDelete = async () => {
    setCancelling(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not cancel the deletion.');
      setScheduledFor(null);
      setDeleteReason('');
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Could not cancel the deletion. Contact privacy@genapps.online.',
      );
    } finally {
      setCancelling(false);
    }
  };

  const openCookiePrefs = () => {
    try { localStorage.removeItem('publish_cookie_consent'); } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-ink-900">Export your data</h3>
              <Badge variant="outline" size="sm">GDPR Art. 20</Badge>
            </div>
            <p className="text-[13px] text-ink-600 mt-1.5 max-w-lg leading-relaxed">
              Download everything we hold about you — account, projects, reports, comments —
              as a portable JSON file. Limit: 5 exports per hour.
            </p>
            {exportError && (
              <p className="text-[12px] text-crimson-700 font-medium mt-2">{exportError}</p>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={handleExport}
            isLoading={exporting}
            leftIcon={exporting ? undefined : <Download className="w-3.5 h-3.5" />}
          >
            {exporting ? 'Preparing…' : 'Export data'}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-semibold text-ink-900">Cookie preferences</h3>
            <p className="text-[13px] text-ink-600 mt-1.5 max-w-lg leading-relaxed">
              Change which optional cookies you allow. Read our{' '}
              <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-ink-900">
                cookie policy
              </Link>.
            </p>
          </div>
          <Button variant="secondary" onClick={openCookiePrefs} leftIcon={<Cookie className="w-3.5 h-3.5" />}>
            Manage cookies
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-semibold text-ink-900">Manage subscription</h3>
            <p className="text-[13px] text-ink-600 mt-1.5 max-w-lg leading-relaxed">
              Update your card, change plan, cancel, or download invoices in the Lemon Squeezy
              customer portal. Cancelling stops future charges; you keep access until the period ends.
            </p>
          </div>
          {/* prefetch={false}: an API route that calls Lemon Squeezy on GET and
              spends a rate-limit slot. A prefetch on scroll would burn it. */}
          <Link href="/api/billing/portal" prefetch={false}>
            <Button variant="secondary" leftIcon={<ExternalLink className="w-3.5 h-3.5" />}>
              Open portal
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="border-crimson-200 bg-crimson-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-ink-900">Delete account</h3>
              <Badge variant="outline" size="sm">GDPR Art. 17</Badge>
            </div>
            <p className="text-[13px] text-ink-600 mt-1.5 max-w-lg leading-relaxed">
              Permanently delete your account and all associated data. Deletion is scheduled 30 days
              out and you can cancel it from this page at any point before then. Any active
              subscription is cancelled immediately. Billing invoices are retained for 7 years to
              satisfy tax law, with personal details removed.
            </p>
          </div>
          {!showDeleteConfirm && !scheduledFor && (
            <Button
              variant="secondary"
              className="border-crimson-300 text-crimson-700 hover:bg-crimson-50"
              onClick={() => setShowDeleteConfirm(true)}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete account
            </Button>
          )}
        </div>

        {showDeleteConfirm && !scheduledFor && (
          <div className="mt-5 pt-5 border-t border-crimson-200 space-y-3">
            <div className="flex items-start gap-2.5 rounded-lg bg-crimson-50 border border-crimson-200 p-3.5">
              <AlertTriangle className="w-4 h-4 text-crimson-700 shrink-0 mt-0.5" />
              <div className="text-[12px] text-ink-700 leading-relaxed">
                <strong className="text-ink-900">This is not immediate.</strong> Deletion is scheduled
                30 days out. Your subscription is cancelled straight away, so you will not be charged
                again. Come back to this page any time before the date to keep your account.
              </div>
            </div>
            <label className="block">
              <span className="text-[12px] font-medium text-ink-600">Reason (optional)</span>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="What could we have done better?"
                className="mt-1.5 w-full bg-surface-panel border border-ink-300 rounded-lg px-3 py-2.5 text-[13px] focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 resize-none"
              />
            </label>
            {deleteError && (
              <p className="text-[12px] text-crimson-700 font-medium">{deleteError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Never mind</Button>
              <Button variant="danger" onClick={handleScheduleDelete} isLoading={deleting}>
                Schedule deletion
              </Button>
            </div>
          </div>
        )}

        {scheduledFor && (
          <div className="mt-5 pt-5 border-t border-crimson-200">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3.5">
              <div className="text-[13px] font-semibold text-ink-900">
                Deletion scheduled for {formatDate(scheduledFor)}
              </div>
              <p className="text-[12px] text-ink-600 mt-1.5 leading-relaxed">
                On that date your account, reports, projects, and uploads are erased and cannot be
                recovered. Until then nothing is lost — press the button below to keep your account.
              </p>
              {deleteError && (
                <p className="text-[12px] text-crimson-700 font-medium mt-2">{deleteError}</p>
              )}
              <div className="mt-3">
                <Button onClick={handleCancelDelete} isLoading={cancelling}>
                  Keep my account
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
