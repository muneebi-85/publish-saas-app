'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Printer-friendly export for a finished report. Opens the print dialog —
 * browsers offer "Save as PDF" there, so the report exports exactly as the
 * help center describes: scores and issue list included, no app chrome.
 */
export function ExportReportButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<Printer className="w-3.5 h-3.5" />}
      onClick={() => window.print()}
      aria-label="Export this report as a printer-friendly PDF"
    >
      Export PDF
    </Button>
  );
}
