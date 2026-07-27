'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search, Plus, ArrowUpRight, Clock, LayoutGrid, List, Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { SAMPLE_PROJECTS } from '@/lib/db/mock-db';

const FOLDERS = ['All', 'YouTube Documentaries', 'Shorts & Reels', 'Agency Clients', 'General'];

export default function ProjectsPage() {
  const [activeFolder, setActiveFolder] = useState('All');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const filtered = SAMPLE_PROJECTS.filter((p) => {
    const matchFolder = activeFolder === 'All' || p.folder === activeFolder;
    const matchQuery = p.title.toLowerCase().includes(query.toLowerCase());
    return matchFolder && matchQuery;
  });

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">
            All work
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">Projects</h1>
          <p className="text-sm text-ink-500 mt-2">Every review, folder, and version — searchable.</p>
        </div>
        <Link href="/upload">
          <Button leftIcon={<Plus className="w-4 h-4" />}>New review</Button>
        </Link>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white border border-ink-200 p-1">
          {FOLDERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFolder(f)}
              className={`px-2.5 h-8 rounded-lg text-[12.5px] font-medium transition-colors ${
                activeFolder === f
                  ? 'bg-ink-900 text-white'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100'
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
              placeholder="Search title, tag, folder…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white border border-ink-200 rounded-lg pl-9 pr-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 transition-colors"
            />
          </div>
          <div className="flex items-center border border-ink-200 rounded-lg p-0.5 bg-white">
            <button
              onClick={() => setView('grid')}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
                view === 'grid' ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100'
              }`}
              aria-label="Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
                view === 'list' ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100'
              }`}
              aria-label="List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button variant="secondary" size="md" leftIcon={<Filter className="w-3.5 h-3.5" />}>
            Filter
          </Button>
        </div>
      </div>

      {/* Grid / list */}
      {view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {filtered.map((project) => (
            <Link key={project.id} href={`/analysis/${project.id}`}>
              <Card hover className="group h-full flex flex-col">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-ink-100 ring-1 ring-ink-200 mb-4">
                  <img src={project.assets.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-2.5 left-2.5">
                    <Badge
                      variant={project.riskLevel === 'LOW' ? 'success' : project.riskLevel === 'MEDIUM' ? 'warning' : 'danger'}
                      dot
                    >
                      {project.riskLevel === 'LOW' ? 'Safe to publish' : `${project.riskLevel.toLowerCase()} risk`}
                    </Badge>
                  </div>
                  <div className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md bg-black/60 text-[10.5px] font-mono text-white/95 tabular-nums">
                    {project.assets.videoDuration}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[14.5px] font-semibold text-ink-900 line-clamp-2 leading-snug">
                    {project.title}
                  </h3>
                  <p className="text-xs text-ink-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {project.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-ink-100">
                  <div className="flex items-center gap-2 text-[11.5px] text-ink-500">
                    <Clock className="w-3 h-3" />
                    {new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="flex items-center gap-2">
                    <ScoreGauge score={project.scores.overall} size="sm" showLabel={false} />
                    <ArrowUpRight className="w-3.5 h-3.5 text-ink-400 group-hover:text-ink-900 transition-colors" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <div className="divide-y divide-ink-100">
            {filtered.map((project) => (
              <Link
                key={project.id}
                href={`/analysis/${project.id}`}
                className="flex items-center gap-4 p-4 hover:bg-ink-100/60 transition-colors"
              >
                <div className="w-20 h-14 rounded-lg overflow-hidden bg-ink-100 shrink-0 ring-1 ring-ink-200">
                  <img src={project.assets.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 truncate">{project.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={project.riskLevel === 'LOW' ? 'success' : 'warning'} dot>
                      {project.riskLevel}
                    </Badge>
                    <span className="text-[11.5px] text-ink-500">{project.folder}</span>
                  </div>
                </div>
                <ScoreGauge score={project.scores.overall} size="sm" showLabel={false} />
                <ArrowUpRight className="w-4 h-4 text-ink-400" />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
