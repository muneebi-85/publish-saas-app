'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Search, Plus, ArrowUpRight, Clock, LayoutGrid, List, Filter, UploadCloud,
  Pencil, Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Tooltip } from '@/components/ui/Tooltip';

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  folder: string;
  riskLevel: string;
  scores: { overall: number; monetization: number };
  assets: { thumbnailUrl?: string; videoDuration?: string };
  createdAt: string;
}

/**
 * Thumbnail slot.
 *
 * Reviews are frequently script-only, so a missing thumbnail is the normal case,
 * not an error. It renders as a neutral tile with the project's initial rather
 * than a stock photo: a borrowed image implies this is what the creator uploaded,
 * and `next/image` only loads hosts named in `remotePatterns` anyway, so an
 * off-allowlist stand-in would surface as a broken image.
 */
function Thumb({ url, title, className }: { url?: string; title: string; className?: string }) {
  if (url) {
    return <Image src={url} alt="" fill className={className ?? 'object-cover'} />;
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink-100">
      <span aria-hidden="true" className="font-display font-semibold text-ink-400 text-[1.25em]">
        {title.trim().charAt(0).toUpperCase() || '•'}
      </span>
    </div>
  );
}

export default function ProjectsClient({ initialProjects }: { initialProjects: ProjectItem[] }) {
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [activeFolder, setActiveFolder] = useState('All');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // The dashboard Topbar (in the layout) already mounts the app's single
  // CommandMenu and owns the ⌘K binding. A second instance here meant one
  // keypress opened two stacked palettes fighting for focus. Opening it from
  // this page goes through the same window event the footer's cookie-settings
  // link uses, so there is still exactly one palette.
  const openCommandMenu = () =>
    window.dispatchEvent(new CustomEvent('publish:command-menu-open'));

  // Folder tabs are derived from the reports' real folders, so a filter can
  // never advertise a folder nothing lives in.
  const folders = useMemo(() => {
    const seen = new Set<string>();
    projects.forEach((p) => seen.add(p.folder || 'General'));
    return ['All', ...Array.from(seen).sort()];
  }, [projects]);

  const filtered = projects.filter((p) => {
    const matchFolder = activeFolder === 'All' || p.folder === activeFolder;
    // The placeholder promises title AND folder search — the folder facet is
    // what "find the thing I filed under Finance" needs; matching the title
    // alone silently failed that query.
    const q = query.toLowerCase();
    const matchQuery =
      p.title.toLowerCase().includes(q) ||
      (p.folder || '').toLowerCase().includes(q);
    return matchFolder && matchQuery;
  });

  const handleRename = async (project: ProjectItem) => {
    const next = prompt('Rename project', project.title);
    if (next === null) return;
    const title = next.trim();
    if (!title || title === project.title) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not rename the project.');
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, title } : p)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not rename the project.');
    }
  };

  const handleDelete = async (project: ProjectItem) => {
    if (!confirm(`Delete "${project.title}" permanently? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete the project.');
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete the project.');
    }
  };

  return (
    <div className="animate-enter">
      <PageHeader
        title="Projects"
        subtitle="Every analysis, folder, and version — searchable."
        showUtility
        actions={
          <Link href="/upload">
            <Button leftIcon={<Plus className="w-4 h-4" />}>New review</Button>
          </Link>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-ink-100 p-0.5">
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFolder(f)}
              className={`px-2.5 h-7 rounded-md text-[12px] font-medium transition-colors ${
                activeFolder === f
                  ? 'bg-surface-panel text-ink-900 shadow-xs'
                  : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              placeholder="Search title or folder…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-surface-panel border border-ink-300 rounded-lg pl-9 pr-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-lg p-0.5 bg-ink-100">
            <Tooltip content="Grid view">
              <button
                onClick={() => setView('grid')}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors focus-ring outline-none ${
                  view === 'grid' ? 'bg-surface-panel text-ink-900 shadow-xs' : 'text-ink-500 hover:text-ink-900'
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="List view">
              <button
                onClick={() => setView('list')}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors focus-ring outline-none ${
                  view === 'list' ? 'bg-surface-panel text-ink-900 shadow-xs' : 'text-ink-500 hover:text-ink-900'
                }`}
                aria-label="List view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<Filter className="w-3.5 h-3.5" />}
            title="Search & Filter (Cmd+K)"
            onClick={() => openCommandMenu()}
            className="hidden lg:flex"
          >
            Filter
            <kbd className="ml-2 inline-flex h-5 items-center gap-1 rounded-md border border-ink-200 bg-ink-100 px-1.5 font-mono text-[11px] font-medium text-ink-500">
              <span className="text-[12px]">⌘</span>K
            </kbd>
          </Button>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<Filter className="w-3.5 h-3.5" />}
            title="Filter projects"
            onClick={() => openCommandMenu()}
            className="lg:hidden"
          >
            Filter
          </Button>
        </div>
      </div>

      {/* Grid / list */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-11 h-11 rounded-xl bg-ink-100 text-ink-500 flex items-center justify-center mb-4">
            <UploadCloud className="w-5 h-5" />
          </div>
          <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
            {initialProjects.length === 0 ? 'Upload your first video' : 'No projects found'}
          </h3>
          <p className="text-[13px] leading-relaxed text-ink-600 mt-2 mb-6 max-w-sm mx-auto">
            {initialProjects.length === 0 
              ? "Drag and drop a video file to run a comprehensive safety and hook analysis." 
              : "We couldn't find any projects matching your filters. Try adjusting your search."}
          </p>
          {initialProjects.length === 0 ? (
            <Link href="/upload">
              <Button leftIcon={<Plus className="w-4 h-4" />}>New analysis</Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => { setQuery(''); setActiveFolder('All'); }}>
              Clear filters
            </Button>
          )}
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {filtered.map((project) => (
            <Card key={project.id} hover className="group h-full flex flex-col">
              <Link href={`/analysis/${project.id}`} prefetch={true} className="flex-1 flex flex-col min-w-0">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-ink-100 ring-1 ring-ink-200 mb-4">
                  <Thumb url={project.assets?.thumbnailUrl} title={project.title} />
                  <div className="absolute top-2.5 left-2.5">
                    <Badge
                      variant={project.riskLevel === 'LOW' ? 'success' : project.riskLevel === 'MEDIUM' ? 'warning' : 'danger'}
                      dot
                    >
                      {project.riskLevel === 'LOW' ? 'Safe to publish' : `${project.riskLevel.toLowerCase()} risk`}
                    </Badge>
                  </div>
                  {/* Only rendered when the review actually recorded a duration —
                      a hardcoded 0:00 reads as a real measurement of an empty video. */}
                  {project.assets?.videoDuration && (
                    <div className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md bg-black/60 text-[11px] font-mono text-white/95 tabular-nums">
                      {project.assets.videoDuration}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold text-ink-900 line-clamp-2 leading-snug">
                    {project.title}
                  </h3>
                  <p className="text-[12px] text-ink-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {project.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-ink-200">
                  <div className="flex items-center gap-2 text-[12px] text-ink-500">
                    <Clock className="w-3 h-3" />
                    {new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                  </div>
                  <div className="flex items-center gap-2">
                    <ScoreGauge score={project.scores?.overall || 0} size="sm" showLabel={false} />
                    <ArrowUpRight className="w-3.5 h-3.5 text-ink-400 group-hover:text-ink-900 transition-colors" />
                  </div>
                </div>
              </Link>

              <div className="mt-3 pt-3 border-t border-ink-200 flex items-center justify-between">
                <span className="text-[11px] text-ink-500 capitalize">{project.folder}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleRename(project)}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition-colors"
                    aria-label={`Rename ${project.title}`}
                  >
                    <Pencil className="w-3 h-3" /> Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(project)}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-medium text-crimson-700 hover:text-crimson-700 hover:bg-crimson-50 transition-colors"
                    aria-label={`Delete ${project.title}`}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <div className="divide-y divide-ink-200">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-4 p-4 hover:bg-ink-50 transition-colors"
              >
                <Link
                  href={`/analysis/${project.id}`}
                  prefetch={true}
                  className="flex-1 flex items-center gap-4 min-w-0"
                >
                  <div className="relative w-20 h-14 rounded-lg overflow-hidden bg-ink-100 shrink-0 ring-1 ring-ink-200">
                    <Thumb url={project.assets?.thumbnailUrl} title={project.title} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-ink-900 truncate">{project.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={project.riskLevel === 'LOW' ? 'success' : project.riskLevel === 'MEDIUM' ? 'warning' : 'danger'} dot>
                        {project.riskLevel}
                      </Badge>
                      <span className="text-[12px] text-ink-500 capitalize">{project.folder}</span>
                    </div>
                  </div>
                  <ScoreGauge score={project.scores?.overall || 0} size="sm" showLabel={false} />
                  <ArrowUpRight className="w-4 h-4 text-ink-400" />
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRename(project)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors"
                    aria-label={`Rename ${project.title}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(project)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-crimson-600 hover:text-crimson-700 hover:bg-crimson-50 transition-colors"
                    aria-label={`Delete ${project.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
