'use client';

import React, { useState } from 'react';
import { Download, Trash2, Cookie, ExternalLink, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';

export const DataPrivacyPanel: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `publish-data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Export failed. Try again or email privacy@genapps.online.');
    } finally {
      setExporting(false);
    }
  };

  const handleScheduleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason }),
      });
      const data = await res.json();
      if (res.ok && data.scheduledFor) {
        setScheduledFor(new Date(data.scheduledFor).toLocaleDateString());
      } else {
        throw new Error(data.error || 'Failed');
      }
    } catch (err) {
      alert('Could not schedule deletion. Contact privacy@genapps.online.');
      console.error(err);
    } finally {
      setDeleting(false);
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
            <p className="text-[13px] text-ink-500 mt-1.5 max-w-lg leading-relaxed">
              Download everything we hold about you — account, projects, reports, support history —
              as a portable JSON file. Limit: 3 exports per hour.
            </p>
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
            <p className="text-[13px] text-ink-500 mt-1.5 max-w-lg leading-relaxed">
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
            <p className="text-[13px] text-ink-500 mt-1.5 max-w-lg leading-relaxed">
              Update your card, change plan, cancel, or download invoices in the Lemon Squeezy
              customer portal. Cancelling stops future charges; you keep access until the period ends.
            </p>
          </div>
          <Link href="/api/billing/portal">
            <Button variant="secondary" leftIcon={<ExternalLink className="w-3.5 h-3.5" />}>
              Open portal
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="border-crimson-500/20 bg-crimson-50/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-ink-900">Delete account</h3>
              <Badge variant="outline" size="sm">GDPR Art. 17</Badge>
            </div>
            <p className="text-[13px] text-ink-600 mt-1.5 max-w-lg leading-relaxed">
              Permanently delete your account and all associated data. You&apos;ll have 30 days to
              change your mind. Billing invoices are retained for 7 years (tax law) but anonymized.
            </p>
          </div>
          {!showDeleteConfirm && !scheduledFor && (
            <Button
              variant="secondary"
              className="border-crimson-500/30 text-crimson-700 hover:bg-crimson-50"
              onClick={() => setShowDeleteConfirm(true)}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete account
            </Button>
          )}
        </div>

        {showDeleteConfirm && !scheduledFor && (
          <div className="mt-5 pt-5 border-t border-crimson-500/15 space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl bg-white border border-crimson-500/20 p-3">
              <AlertTriangle className="w-4 h-4 text-crimson-600 shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-ink-700 leading-relaxed">
                <strong className="text-ink-900">This is not immediate.</strong> Deletion is scheduled
                30 days out. You&apos;ll get a confirmation email with a &ldquo;cancel deletion&rdquo; link.
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
                className="mt-1.5 w-full bg-white border border-ink-200 rounded-xl px-3 py-2 text-[13px] focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 resize-none"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Never mind</Button>
              <Button onClick={handleScheduleDelete} isLoading={deleting} className="bg-crimson-600 hover:bg-crimson-700">
                Schedule deletion
              </Button>
            </div>
          </div>
        )}

        {scheduledFor && (
          <div className="mt-5 pt-5 border-t border-crimson-500/15 rounded-xl bg-white border-l-4 border-l-amber-500 p-4">
            <div className="text-[13px] font-semibold text-ink-900">Deletion scheduled for {scheduledFor}</div>
            <p className="text-[12.5px] text-ink-600 mt-1.5 leading-relaxed">
              Check your email for a confirmation link. Use the &ldquo;cancel deletion&rdquo; link to undo.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
