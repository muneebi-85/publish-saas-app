'use client';

import React, { useState } from 'react';
import { Copy, Check, Plus, Shield, Trash2, LogOut } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataPrivacyPanel } from '@/components/settings/DataPrivacyPanel';

const SECTIONS = [
  { id: 'profile',       label: 'Profile' },
  { id: 'workspace',     label: 'Workspace' },
  { id: 'api',           label: 'API keys' },
  { id: 'team',          label: 'Team' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'billing',       label: 'Billing' },
  { id: 'security',      label: 'Security' },
  { id: 'privacy',       label: 'Data & privacy' },
];

export default function SettingsPage() {
  const apiKey = 'pub_live_9f8a7b6c5d4e3f2a1b0c9d8e';
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1800);
  };

  return (
    <div className="animate-enter">
      <div className="mb-8">
        <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Account</div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">Settings</h1>
        <p className="text-sm text-ink-500 mt-2">Manage your profile, workspace, and integrations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px,1fr] gap-8">
        {/* Nav */}
        <nav className="lg:sticky lg:top-20 h-fit flex lg:flex-col overflow-x-auto lg:overflow-visible gap-0.5 border-b lg:border-b-0 lg:border-r border-ink-200 pb-2 lg:pb-0 lg:pr-6">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={`px-3 py-1.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors ${
                activeSection === s.id
                  ? 'bg-ink-100 text-ink-900'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50'
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Content */}
        <div className="space-y-6 max-w-2xl">
          {/* Profile */}
          <Card>
            <SectionHead id="profile" title="Profile" desc="How you appear inside your workspace." />
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-ink-100">
              <div className="w-12 h-12 rounded-full bg-ink-900 text-white flex items-center justify-center font-semibold text-[15px]">
                A
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-medium text-ink-900">Alex Kessler</div>
                <div className="text-[12px] text-ink-500">alex@creatoragency.co</div>
              </div>
              <Badge variant="success" dot>Pro plan</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name" defaultValue="Alex Kessler" />
              <Field label="Email" type="email" defaultValue="alex@creatoragency.co" />
              <Field label="Timezone" defaultValue="America/Los Angeles" />
              <Field label="Public handle" defaultValue="@alexk" prefix="publish.so/" />
            </div>
            <div className="flex justify-end mt-5">
              <Button size="sm">Save changes</Button>
            </div>
          </Card>

          {/* Workspace */}
          <Card>
            <SectionHead id="workspace" title="Workspace" desc="Shared branding and defaults." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Workspace name" defaultValue="Alex's Studio" />
              <Field label="Default platform" defaultValue="YouTube" as="select" options={['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn']} />
            </div>
          </Card>

          {/* API */}
          <Card>
            <SectionHead id="api" title="API keys" desc="Programmatic access to reviews and reports." />
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-surface-canvas border border-ink-200 rounded-lg px-3 h-9 flex items-center text-[13px] font-mono text-ink-700 select-all overflow-hidden">
                {apiKey}
              </div>
              <Button
                variant="secondary"
                size="md"
                onClick={copyKey}
                leftIcon={copiedKey ? <Check className="w-3.5 h-3.5 text-grass-600" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copiedKey ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-[11.5px] text-ink-500 mt-3 leading-relaxed">
              Keep this secret. Never embed in client-side code. Rotate keys anytime; old keys expire after 24h.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="ghost" size="sm">Rotate key</Button>
              <Button variant="ghost" size="sm">Read API docs</Button>
            </div>
          </Card>

          {/* Team */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <SectionHead id="team" title="Team" desc="Invite collaborators and set permissions." inline />
              <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>Invite member</Button>
            </div>
            <div className="divide-y divide-ink-100">
              {[
                { name: 'Alex Kessler (You)', email: 'alex@creatoragency.co', role: 'Owner' },
                { name: 'Sarah Reed',         email: 'sarah@creatoragency.co', role: 'Editor' },
                { name: 'Marcus L.',          email: 'marcus@creatoragency.co', role: 'Viewer' },
              ].map((m) => (
                <div key={m.email} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-ink-100 text-ink-700 font-semibold flex items-center justify-center text-[12px]">
                      {m.name[0]}
                    </div>
                    <div>
                      <div className="text-[13.5px] font-medium text-ink-900">{m.name}</div>
                      <div className="text-[11.5px] text-ink-500">{m.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{m.role}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Notifications */}
          <Card>
            <SectionHead id="notifications" title="Notifications" desc="What we email you about." />
            <div className="space-y-4">
              {[
                { label: 'Review complete',       desc: 'Notified when your audit finishes.',           on: true },
                { label: 'Policy updates',        desc: 'Platform rule changes affecting your uploads.', on: true },
                { label: 'Weekly digest',         desc: 'Every Monday. Channel health + risky drafts.',  on: false },
                { label: 'Team activity',         desc: 'When a teammate leaves a comment on a review.', on: true },
              ].map((n, i) => (
                <Toggle key={i} label={n.label} desc={n.desc} defaultOn={n.on} />
              ))}
            </div>
          </Card>

          {/* Security */}
          <Card>
            <SectionHead id="security" title="Security" desc="Multi-factor auth and session management." />
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-ink-200 bg-surface-canvas">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-grass-50 border border-grass-100 text-grass-700 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium text-ink-900">Two-factor authentication</div>
                    <div className="text-[11.5px] text-ink-500">TOTP app enrolled 3 months ago</div>
                  </div>
                </div>
                <Button variant="secondary" size="sm">Manage</Button>
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-ink-200 bg-surface-canvas">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-ink-100 text-ink-700 flex items-center justify-center">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium text-ink-900">Active sessions</div>
                    <div className="text-[11.5px] text-ink-500">2 devices signed in</div>
                  </div>
                </div>
                <Button variant="secondary" size="sm">Sign out all</Button>
              </div>
            </div>
          </Card>

          {/* Danger */}
          <Card className="border-crimson-500/20 bg-crimson-50/30">
            <SectionHead id="danger" title="Danger zone" desc="Permanent actions cannot be undone." />
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-crimson-500/15">
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4 text-crimson-600" />
                <div>
                  <div className="text-[13.5px] font-medium text-ink-900">Delete workspace</div>
                  <div className="text-[11.5px] text-ink-500">All reports, projects, and integrations will be permanently removed.</div>
                </div>
              </div>
              <Button variant="danger" size="sm">Delete</Button>
            </div>
          </Card>

          {/* Data & Privacy — GDPR/CCPA compliant self-serve */}
          <div id="privacy">
            <SectionHead id="privacy-head" title="Data & privacy" desc="Export, delete, cookies, and subscription controls." />
            <DataPrivacyPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

const SectionHead: React.FC<{ id: string; title: string; desc: string; inline?: boolean }> = ({
  id, title, desc, inline = false,
}) => (
  <div id={id} className={inline ? '' : 'mb-5'}>
    <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
    <p className="text-[12px] text-ink-500 mt-0.5">{desc}</p>
  </div>
);

interface FieldProps {
  label: string;
  defaultValue?: string;
  type?: string;
  prefix?: string;
  as?: 'input' | 'select';
  options?: string[];
}
const Field: React.FC<FieldProps> = ({ label, defaultValue, type = 'text', prefix, as = 'input', options }) => (
  <div>
    <label className="text-[11.5px] font-medium text-ink-600 block mb-1.5">{label}</label>
    <div className="flex items-stretch">
      {prefix && (
        <span className="inline-flex items-center px-3 h-9 rounded-l-lg border border-r-0 border-ink-200 bg-surface-canvas text-[12.5px] text-ink-500">
          {prefix}
        </span>
      )}
      {as === 'select' ? (
        <select
          defaultValue={defaultValue}
          className={`w-full bg-white border border-ink-200 h-9 px-3 text-[13px] focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 ${prefix ? 'rounded-r-lg' : 'rounded-lg'}`}
        >
          {options?.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          defaultValue={defaultValue}
          className={`w-full bg-white border border-ink-200 h-9 px-3 text-[13px] focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 ${prefix ? 'rounded-r-lg' : 'rounded-lg'}`}
        />
      )}
    </div>
  </div>
);

const Toggle: React.FC<{ label: string; desc: string; defaultOn: boolean }> = ({ label, desc, defaultOn }) => {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[13.5px] font-medium text-ink-900">{label}</div>
        <div className="text-[11.5px] text-ink-500 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => setOn(!on)}
        className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-ink-900' : 'bg-ink-200'}`}
        role="switch"
        aria-checked={on}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-subtle transition-all duration-200 ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
};
