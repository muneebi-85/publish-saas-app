/**
 * The hero product shot.
 *
 * Built in markup rather than shipped as an image: it stays sharp on any DPR,
 * costs no image bytes, and the numbers stay editable. It is decorative — the
 * whole block is aria-hidden and the hero's headline carries the real meaning.
 *
 * Geometry note: this is a scale drawing at the comp's own resolution. Every
 * number below is "local" px inside a fixed 1012x743 box, which the hero scales
 * by 0.6887 to land the 697x512 panel the comp shows bleeding off the right
 * edge of the viewport. Sizes are therefore fixed, not responsive, and the
 * parent does the clipping.
 *
 * Layout, per the comp: sidebar (202) | main. Main stacks a topbar and a
 * full-width KPI row, then a rule opens a two-column region — a 579px column
 * holding the chart above its own rule with Recent Content below, beside a
 * 231px rail holding the tall Publish Score card.
 */
import React from 'react';

const KPIS = [
  { label: 'Views', value: '2.4M', delta: '32%', icon: ViewsIcon },
  { label: 'CTR', value: '6.8%', delta: '18%', icon: CtrIcon },
  { label: 'Watch Time', value: '186.2K', delta: '24%', icon: ClockIcon },
  { label: 'Revenue', value: '$3,820', delta: '28%', icon: RevenueIcon },
];

const NAV_MAIN = [
  ['Overview', HomeIcon],
  ['Projects', FolderIcon],
  ['AI Coach', SparkIcon],
  ['SEO Studio', SeoIcon],
  ['Brand Kit', BrandIcon],
  ['Templates', TemplateIcon],
  ['Reports', ReportIcon],
  ['Connected Channels', ChannelsIcon],
] as const;

const NAV_FOOT = [
  ['Settings', SettingsIcon],
  ['Billing', BillingIcon],
  ['Help Center', HelpIcon],
] as const;

const ROWS = [
  { title: '5 AI Tools Every Creator', title2: 'Should Know', meta: 'Video · 10:06', score: 91, status: 'Published', date: 'May 14, 2024', thumb: '/images/landing/thumb-1.webp' },
  { title: 'How I Grew to 100K', title2: 'Subscribers', meta: 'Video · 4:22', score: 89, status: 'Published', date: 'May 13, 2024', thumb: '/images/landing/thumb-2.webp' },
  { title: 'My Studio Tour & Setup', title2: '', meta: 'Video · 12:06', score: 97, status: 'Draft', date: 'May 11, 2024', thumb: '/images/landing/thumb-3.webp' },
];

/** Weekly view counts behind the area chart, in millions. Axis tops out at 3M. */
const SERIES = [0.62, 0.75, 0.72, 0.95, 1.02, 1.12, 1.22, 1.45, 1.72, 1.78, 1.75, 1.98, 2.02];

const DAYS = ['May 8', 'May 9', 'May 10', 'May 11', 'May 12', 'May 13', 'May 14'];

export function HeroMockup() {
  return (
    <div
      aria-hidden="true"
      className="lp-float relative flex h-[743px] w-[1012px] shrink-0 overflow-hidden rounded-[18px] border border-[#EAEDEB] bg-white"
      style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}
    >
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col border-l border-[#EFF1F0]">
        <Topbar />
        <KpiRow />

        {/* The rule under the KPIs opens the split: chart + table | score rail. */}
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[579px] flex-col border-t border-[#EFF1F0]">
            <ChartCard />
            <RecentContent />
          </div>
          <div className="min-w-0 flex-1 pl-[17px] pr-[18px] pt-[24px]">
            <ScoreCard />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── sidebar ─────────────────────────── */

function Sidebar() {
  return (
    <div className="flex w-[202px] shrink-0 flex-col px-[18px] pt-[15px]">
      <div className="px-[11px] text-[25px] font-extrabold leading-[26px] tracking-[-0.04em] text-[#0A0D12]">
        Publish<span className="text-[var(--lp-green)]">.</span>
      </div>

      <nav className="mt-[29px] space-y-[7px]">
        {NAV_MAIN.map(([label, Icon], i) => (
          <NavItem key={label} label={label} Icon={Icon} active={i === 0} />
        ))}
      </nav>

      <div className="my-[15px] h-px bg-[#EFF1F0]" />

      <nav className="space-y-[7px]">
        {NAV_FOOT.map(([label, Icon]) => (
          <NavItem key={label} label={label} Icon={Icon} />
        ))}
      </nav>

      <PlanCard />
    </div>
  );
}

function NavItem({ label, Icon, active }: { label: string; Icon: React.FC; active?: boolean }) {
  return (
    <div
      className={`flex h-[28px] items-center gap-[14px] rounded-[9px] px-[11px] text-[14px] ${
        active ? 'bg-[#E7F5EC] font-semibold text-[#12693C]' : 'font-medium text-[#4A5158]'
      }`}
    >
      <span className={active ? 'text-[#158048]' : 'text-[#6D757D]'}>
        <Icon />
      </span>
      <span className="tracking-[-0.01em]">{label}</span>
    </div>
  );
}

function PlanCard() {
  return (
    <div className="mt-[31px] rounded-[12px] border border-[#EAEDEB] px-[14px] pb-[15px] pt-[14px]">
      <div className="text-[13.5px] font-medium text-[#7C848E]">Pro Plan</div>
      <div className="mt-[8px] text-[15px] font-extrabold tracking-[-0.02em] text-[#0A0D12]">
        12,450 <span className="text-[12.5px] font-medium text-[#9AA1AA]">/ 20,000 credits</span>
      </div>
      <div className="mt-[12px] h-[8px] overflow-hidden rounded-full bg-[#EDF0EE]">
        <div className="h-full w-[62%] rounded-full bg-[#1A9757]" />
      </div>
      <div className="mt-[18px] rounded-[9px] border border-[#E2E6E4] py-[10px] text-center text-[14px] font-bold text-[#0A0D12]">
        Upgrade plan
      </div>
    </div>
  );
}

/* ─────────────────────────── top bar ─────────────────────────── */

function Topbar() {
  return (
    <div className="flex items-start justify-between pl-[20px] pr-[28px] pt-[26px]">
      <div>
        <div className="text-[21px] font-extrabold tracking-[-0.03em] text-[#0A0D12]">
          Welcome back, Sarah <span className="text-[18px]">👋</span>
        </div>
        <div className="mt-[6px] text-[16px] font-medium text-[#7C848E]">
          Here&apos;s how your content is performing.
        </div>
      </div>
      <div className="flex h-[33px] items-center gap-[10px] rounded-[10px] border border-[#E5E9E7] px-[14px]">
        <CalendarIcon />
        <span className="text-[14.5px] font-semibold text-[#3E454C]">May 8 – May 14, 2024</span>
        <ChevronIcon />
      </div>
    </div>
  );
}

/* ─────────────────────────── KPIs ─────────────────────────── */

function KpiRow() {
  return (
    <div className="mt-[26px] grid grid-cols-4 gap-[17px] px-[20px] pb-[19px]">
      {KPIS.map(({ label, value, delta, icon: Icon }) => (
        <div key={label} className="rounded-[13px] border border-[#EAEDEB] px-[19px] pb-[19px] pt-[17px]">
          <div className="flex items-center gap-[9px]">
            <span className="text-[#1A9757]">
              <Icon />
            </span>
            <span className="text-[13.5px] font-semibold text-[#6D757D]">{label}</span>
          </div>
          <div className="mt-[13px] text-[36px] font-extrabold leading-none tracking-[-0.045em] text-[#0A0D12]">
            {value}
          </div>
          <div className="mt-[16px] flex items-center gap-[5px] text-[13.5px] font-semibold text-[#1A9757]">
            <ArrowUpIcon />
            {delta} <span className="font-medium text-[#8A9199]">vs last 7 days</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── chart ─────────────────────────── */

function ChartCard() {
  const W = 505;   // plot width, local px
  const H = 121.5; // plot height — the 0..3M span
  const max = 3;
  const pts = SERIES.map((v, i) => [
    (i / (SERIES.length - 1)) * W,
    H - (v / max) * H,
  ] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  // Over-estimate of the polyline length: `lp-draw` only needs a dash long
  // enough to hide the whole path at offset = --len.
  const len = W * 1.25;

  return (
    <div className="relative h-[177px] pl-[33px] pr-[14px] pt-[16px]">
      <div className="flex gap-[8px]">
        <div
          className="flex w-[20px] flex-col justify-between text-right text-[12px] font-semibold leading-none text-[#A3AAB1]"
          style={{ height: H, marginTop: -5 }}
        >
          <span>3M</span><span>2M</span><span>1M</span><span>0</span>
        </div>

        <div className="relative flex-1">
          {/* gridlines */}
          <div className="absolute inset-x-0 top-0" style={{ height: H }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="absolute inset-x-0 h-px bg-[#F0F2F1]" style={{ top: `${(i / 3) * 100}%` }} />
            ))}
          </div>

          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="relative block">
            <defs>
              <linearGradient id="lpArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1A9757" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#1A9757" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#lpArea)" className="lp-late" />
            <path
              d={line} fill="none" stroke="#1A9757" strokeWidth="2.4"
              strokeLinecap="round" vectorEffect="non-scaling-stroke"
              className="lp-draw" strokeDasharray={len} style={{ ['--len' as string]: len }}
            />
          </svg>

          {/* data dots — placed in % so they track the stretched viewBox.
              `--i` walks them in behind the line rather than all at once. */}
          {pts.map(([x, y], i) => (
            <span
              key={i}
              className="lp-late absolute h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1A9757]"
              style={{ left: `${(x / W) * 100}%`, top: `${y}px`, ['--i' as string]: i * 0.34 }}
            />
          ))}

          <div className="mt-[12px] flex justify-between text-[12px] font-semibold leading-none text-[#A3AAB1]">
            {DAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
      </div>

      {/* callout */}
      <div className="lp-late absolute right-[33px] top-[5px] w-[112px] rounded-[11px] bg-[#1A9757] px-[14px] py-[10px] text-center leading-none text-white" style={{ ['--i' as string]: 5 }}>
        <div className="text-[21px] font-extrabold tracking-[-0.03em]">+32%</div>
        <div className="mt-[6px] text-[11px] font-semibold text-[#BFE9D1]">vs previous week</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── publish score ─────────────────────────── */

function ScoreCard() {
  const SIZE = 136;
  const SW = 17.5;                       // ring thickness
  const R = (SIZE - SW) / 2;
  const C = 2 * Math.PI * R;
  const arc = 0.72;                      // sweep — the comp leaves the bottom open
  const filled = 0.94 * arc;             // 94 / 100

  return (
    <div className="h-[445px] rounded-[13px] border border-[#EAEDEB] px-[18px] pt-[17px]">
      <div className="text-[19px] font-extrabold leading-[24px] tracking-[-0.03em] text-[#0A0D12]">
        Publish Score
      </div>

      <div className="relative mx-auto mt-[15px]" style={{ height: SIZE, width: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-[140deg]">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#EDF0EE" strokeWidth={SW} strokeLinecap="round"
            strokeDasharray={`${C * arc} ${C}`} />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1A9757" strokeWidth={SW} strokeLinecap="round"
            strokeDasharray={`${C * filled} ${C}`}
            className="lp-draw" style={{ ['--len' as string]: C * filled }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-[4px]">
          <div className="text-[54px] font-extrabold leading-none tracking-[-0.05em] text-[#0A0D12]">94</div>
          <div className="mt-[6px] text-[19px] font-bold text-[#4A5158]">/100</div>
        </div>
      </div>

      <div className="mt-[27px] text-center text-[24px] font-extrabold leading-[28px] tracking-[-0.03em] text-[#1A9757]">
        Excellent
      </div>
      <p className="mt-[19px] text-center text-[15px] font-medium leading-[22px] text-[#7C848E]">
        Your content is optimized for reach, engagement and monetization.
      </p>
      <div className="mt-[32px] flex items-center justify-center gap-[9px] text-[15.5px] font-bold text-[#0A0D12]">
        View full analysis <ArrowRightIcon />
      </div>
    </div>
  );
}

/* ─────────────────────────── recent content ─────────────────────────── */

const COLS = 'grid-cols-[1fr_50px_92px_70px_78px_14px]';

function RecentContent() {
  return (
    <div className="min-h-0 flex-1 border-t border-[#EFF1F0] px-[20px] pt-[15px]">
      <div className="flex items-center justify-between">
        <div className="text-[20px] font-extrabold tracking-[-0.03em] text-[#0A0D12]">Recent Content</div>
        <div className="flex h-[29px] items-center gap-[8px] rounded-[9px] border border-[#E5E9E7] px-[13px] text-[13.5px] font-bold text-[#0A0D12]">
          View all <ArrowRightIcon />
        </div>
      </div>

      <div className={`mt-[9px] grid ${COLS} h-[18px] items-center text-[13px] font-semibold text-[#9AA1AA]`}>
        <span>Content</span><span className="text-center">Score</span><span className="text-center">Status</span>
        <span className="text-center">Platform</span><span>Date</span><span />
      </div>

      {ROWS.map((r) => (
        <div key={r.title} className={`grid ${COLS} items-center border-t border-[#F3F5F4] py-[6px]`}>
          <div className="flex items-center gap-[15px]">
            <Thumb src={r.thumb} />
            <div className="min-w-0">
              <div className="text-[14.5px] font-bold leading-[20px] tracking-[-0.02em] text-[#0A0D12]">
                {r.title}
                {r.title2 && <><br />{r.title2}</>}
              </div>
              <div className="mt-[4px] text-[13px] font-medium text-[#9AA1AA]">{r.meta}</div>
            </div>
          </div>

          <div className="flex justify-center">
            <span className="flex h-[35px] w-[35px] items-center justify-center rounded-full border-[2px] border-[#1A9757] text-[14px] font-extrabold text-[#12693C]">
              {r.score}
            </span>
          </div>

          <div className="flex justify-center">
            <span
              className={`rounded-[7px] px-[11px] py-[5px] text-[12.5px] font-bold ${
                r.status === 'Published' ? 'bg-[#E3F4E9] text-[#12693C]' : 'bg-[#F0F2F1] text-[#6D757D]'
              }`}
            >
              {r.status}
            </span>
          </div>

          <div className="flex justify-center">
            <span className="flex h-[19px] w-[27px] items-center justify-center rounded-[6px] bg-[#FF0000]">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#fff" aria-hidden="true"><path d="M0 0l10 5-10 5z" /></svg>
            </span>
          </div>

          <span className="text-[13px] font-medium text-[#6D757D]">{r.date}</span>
          <DotsIcon />
        </div>
      ))}
    </div>
  );
}

/**
 * Video thumbnail. The frames are AI-generated stills in /public/images/landing;
 * the dark tile underneath shows through if one is missing, so the row keeps its
 * shape instead of collapsing to a broken image.
 */
function Thumb({ src }: { src: string }) {
  return (
    <span className="relative h-[55px] w-[82px] shrink-0 overflow-hidden rounded-[8px] bg-[#2A2F35]">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size decorative tile inside an aria-hidden mockup */}
      <img src={src} alt="" width={82} height={55} className="h-full w-full object-cover" />
    </span>
  );
}

/* ─────────────────────────── icons ─────────────────────────── */
/* Sized to the comp's local grid: 19px in the sidebar, 18px on the KPI cards. */

const S = { width: 19, height: 19, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function HomeIcon() { return <svg {...S}><path d="M3 8.2 10 3l7 5.2V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.2Z" /></svg>; }
function FolderIcon() { return <svg {...S}><path d="M2.6 6a1.4 1.4 0 0 1 1.4-1.4h3l1.6 1.9h6.4A1.4 1.4 0 0 1 16.4 8v6.4a1.4 1.4 0 0 1-1.4 1.4H4a1.4 1.4 0 0 1-1.4-1.4V6Z" /></svg>; }
function SparkIcon() { return <svg {...S}><path d="M6 3.5 7 6.2l2.7 1L7 8.3 6 11 5 8.3 2.3 7.2 5 6.2 6 3.5Z" /><path d="M13.4 9.6l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" /></svg>; }
function SeoIcon() { return <svg {...S}><path d="M10 2.8 4 7v9h12V7l-6-4.2Z" /><path d="M7.2 11.4 10 9l2.8 2.4" /><path d="M7.2 14 10 11.6l2.8 2.4" /></svg>; }
function BrandIcon() { return <svg {...S}><rect x="3" y="3" width="14" height="14" rx="3" /><circle cx="10" cy="10" r="2.4" /></svg>; }
function TemplateIcon() { return <svg {...S}><rect x="3.2" y="3.2" width="13.6" height="13.6" rx="2.4" /><path d="M3.2 7.4h13.6M8.2 7.4v9.4" /></svg>; }
function ReportIcon() { return <svg {...S}><path d="M10 3v5" /><rect x="4" y="8" width="12" height="4" rx="1.4" /><path d="M6.4 12v2.2M13.6 12v2.2M4 16.6h12" /></svg>; }
function ChannelsIcon() { return <svg {...S}><circle cx="10" cy="5.2" r="2.2" /><circle cx="5.4" cy="13.6" r="2.2" /><circle cx="14.6" cy="13.6" r="2.2" /><path d="M8.4 7 6.7 11.6M11.6 7l1.7 4.6" /></svg>; }
function SettingsIcon() { return <svg {...S}><circle cx="10" cy="10" r="2.5" /><path d="M10 2.6v2M10 15.4v2M3.9 6.4l1.7 1M14.4 12.6l1.7 1M3.9 13.6l1.7-1M14.4 7.4l1.7-1" /></svg>; }
function BillingIcon() { return <svg {...S}><rect x="2.8" y="5" width="14.4" height="10" rx="2.2" /><path d="M2.8 8.6h14.4" /></svg>; }
function HelpIcon() { return <svg {...S}><circle cx="10" cy="10" r="7.2" /><path d="M8.2 8a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.7-.8 1.2v.4" /><circle cx="10" cy="13.6" r=".7" fill="currentColor" stroke="none" /></svg>; }

const K = { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function ViewsIcon() { return <svg {...K}><circle cx="6" cy="6" r="2.1" /><circle cx="13.6" cy="7.4" r="2.1" /><circle cx="8.6" cy="13.4" r="2.1" /></svg>; }
function CtrIcon() { return <svg {...K}><path d="M10 3.2a6.8 6.8 0 1 1-4.8 2" /><path d="M4.6 2.4v3.2h3.2" /><path d="M7.6 10.2 9.4 12l3.2-3.4" /></svg>; }
function ClockIcon() { return <svg {...K}><circle cx="10" cy="10" r="7" /><path d="M10 6v4.2l2.8 1.7" /></svg>; }
function RevenueIcon() { return <svg {...K}><circle cx="10" cy="12" r="4.4" /><path d="M10 9.6v4.8M8.4 12h3.2" /><path d="M7.4 5.4 10 3l2.6 2.4" /></svg>; }

function CalendarIcon() {
  return <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#6D757D" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4.4" width="14" height="12.2" rx="2.2" /><path d="M3 8h14M6.8 2.8v2.6M13.2 2.8v2.6" /></svg>;
}
function ChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#8A9199" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8" /></svg>;
}
function ArrowUpIcon() {
  return <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 16V4.5M5 9.5 10 4.5l5 5" /></svg>;
}
function ArrowRightIcon() {
  return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10h11M10.5 5.5 15 10l-4.5 4.5" /></svg>;
}
function DotsIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="#B4BAC0" aria-hidden="true"><circle cx="10" cy="4.6" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="10" cy="15.4" r="1.4" /></svg>;
}
