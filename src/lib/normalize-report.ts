/**
 * Normalization for persisted `AnalysisReport.report` payloads.
 *
 * The LLM occasionally returns objects inside fields typed as `string[]`
 * (e.g. a hook as `{ why, hook, expectedImpact }` instead of a string). The
 * engines now coerce these at write time via `toDisplayString`, but reports
 * persisted before that fix still contain objects — and rendering one crashes
 * React with "Objects are not valid as a React child".
 *
 * Every page that renders a stored report must pass it through here first:
 * `/analysis/[id]` always did; `/dashboard` renders the same rows and was
 * added later. Keeping one implementation in `src/lib` is what stops the two
 * consumers from disagreeing about which fields need coercion.
 */

import { toDisplayString } from '@/lib/ai/guardrails';
import type { ProjectData } from '@/lib/types';

type JsonObject = Record<string, unknown>;

/** Read an unknown value as a JSON object (never throws). */
function asJsonObject(v: unknown): JsonObject {
  return v !== null && typeof v === 'object' ? (v as JsonObject) : {};
}

export function normalizeReport(row: { report: unknown; id: string; createdAt: Date }): ProjectData {
  const raw = asJsonObject(row.report);
  const str = (v: unknown) => toDisplayString(v);
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => toDisplayString(x)) : [];
  const field = (obj: unknown, key: string): unknown => asJsonObject(obj)[key];

  const hookAnalysis = {
    ...asJsonObject(field(raw, 'hookAnalysis')),
    recommendedHooks: strArr(field(field(raw, 'hookAnalysis'), 'recommendedHooks')),
    hookDropoffReason: str(field(field(raw, 'hookAnalysis'), 'hookDropoffReason')),
  };

  const rawScriptIssues = raw.scriptIssues;
  const scriptIssues = Array.isArray(rawScriptIssues)
    ? rawScriptIssues.map((entry) => {
        const issue = asJsonObject(entry);
        return {
          ...issue,
          text: str(issue.text),
          suggestion: str(issue.suggestion),
          specific_fix: issue.specific_fix == null ? undefined : str(issue.specific_fix),
          reasoning: issue.reasoning == null ? undefined : str(issue.reasoning),
          estimatedMetricImpact:
            issue.estimatedMetricImpact == null ? undefined : str(issue.estimatedMetricImpact),
        };
      })
    : [];

  // Persisted JSON is untyped; the coercion below is intentionally structural.
  // The final cast is the contract boundary between the DB row and the typed
  // render model — after normalization the shape matches ProjectData.
  return {
    ...(raw as unknown as ProjectData),
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    hookAnalysis,
    scriptIssues,
    voiceAnalysis: {
      ...asJsonObject(field(raw, 'voiceAnalysis')),
      recommendations: strArr(field(field(raw, 'voiceAnalysis'), 'recommendations')),
    },
    videoAnalysis: {
      ...asJsonObject(field(raw, 'videoAnalysis')),
      recommendations: strArr(field(field(raw, 'videoAnalysis'), 'recommendations')),
    },
    thumbnailAnalysis: {
      ...asJsonObject(field(raw, 'thumbnailAnalysis')),
      recommendations: strArr(field(field(raw, 'thumbnailAnalysis'), 'recommendations')),
    },
    copyrightAnalysis: {
      ...asJsonObject(field(raw, 'copyrightAnalysis')),
      recommendations: strArr(field(field(raw, 'copyrightAnalysis'), 'recommendations')),
    },
    seoAnalysis: {
      ...asJsonObject(field(raw, 'seoAnalysis')),
      suggestedTags: strArr(field(field(raw, 'seoAnalysis'), 'suggestedTags')),
      suggestedHashtags: strArr(field(field(raw, 'seoAnalysis'), 'suggestedHashtags')),
      timestamps: strArr(field(field(raw, 'seoAnalysis'), 'timestamps')),
    },
    platformReports: Array.isArray(raw.platformReports)
      ? raw.platformReports.map((entry) => {
          const p = asJsonObject(entry);
          return {
            ...p,
            specificRecommendations: strArr(p.specificRecommendations),
          };
        })
      : [],
    authenticity: raw.authenticity != null
      ? {
          ...asJsonObject(raw.authenticity),
          evidence: Array.isArray(field(raw.authenticity, 'evidence'))
            ? (field(raw.authenticity, 'evidence') as unknown[]).map((entry) => {
                const e = asJsonObject(entry);
                return {
                  ...e,
                  signal: str(e.signal),
                  location: str(e.location),
                  detail: str(e.detail),
                };
              })
            : [],
          inconclusive: strArr(field(raw.authenticity, 'inconclusive')),
          falsePositiveReasons: strArr(field(raw.authenticity, 'falsePositiveReasons')),
          limitations: strArr(field(raw.authenticity, 'limitations')),
          recommendations: strArr(field(raw.authenticity, 'recommendations')),
        }
      : undefined,
    monetizationRisk: raw.monetizationRisk != null
      ? {
          ...asJsonObject(raw.monetizationRisk),
          items: Array.isArray(field(raw.monetizationRisk, 'items'))
            ? (field(raw.monetizationRisk, 'items') as unknown[]).map((entry) => {
                const item = asJsonObject(entry);
                return {
                  ...item,
                  category: str(item.category),
                  location: str(item.location),
                  why: str(item.why),
                  fix: str(item.fix),
                };
              })
            : [],
          inconclusive: strArr(field(raw.monetizationRisk, 'inconclusive')),
          limitations: strArr(field(raw.monetizationRisk, 'limitations')),
        }
      : undefined,
    scorecards: Array.isArray(raw.scorecards)
      ? raw.scorecards.map((entry) => {
          const card = asJsonObject(entry);
          return {
            ...card,
            label: str(card.label),
            evidence: strArr(card.evidence),
            inconclusive: strArr(card.inconclusive),
            recommendations: strArr(card.recommendations),
            expectedImpact: str(card.expectedImpact),
          };
        })
      : undefined,
  } as ProjectData;
}
