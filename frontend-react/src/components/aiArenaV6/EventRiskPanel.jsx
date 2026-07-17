import React from "react";

const riskTone = {
 low: {
 label: "Low",
 badge: "border-profit/20 bg-profit/10 text-profit",
 accent: "text-profit",
 },
 elevated: {
 label: "Elevated",
 badge: "border-amber-300/20 bg-amber-300/10 text-amber-200",
 accent: "text-amber-200",
 },
 high: {
 label: "High",
 badge: "border-red-400/20 bg-red-400/10 text-loss",
 accent: "text-loss",
 },
 unavailable: {
 label: "Unavailable",
 badge: "border-ink/10 bg-ink/5 text-text-primary/40",
 accent: "text-text-primary/40",
 },
};

const statusTone = {
 fresh: "text-profit",
 stale: "text-amber-200",
 unavailable: "text-loss",
};

function formatAge(seconds) {
 const value = Number(seconds);
 if (!Number.isFinite(value)) return "age unknown";
 if (value < 60) return `${Math.round(value)}s ago`;
 if (value < 3600) return `${Math.round(value / 60)}m ago`;
 return `${(value / 3600).toFixed(1)}h ago`;
}

function formatCountdown(hours) {
 const value = Number(hours);
 if (!Number.isFinite(value)) return "time unavailable";
 if (value <= 1) return "within 1h";
 if (value < 24) return `in ${Math.round(value)}h`;
 return `in ${(value / 24).toFixed(1)}d`;
}

function formatDate(value) {
 if (!value) return "Schedule unavailable";
 return new Date(value).toLocaleString([], {
 month: "short",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 });
}

function SourceCard({ label, source }) {
 const status = source?.status || "unavailable";
 const count = source?.article_count ?? source?.event_count ?? 0;
 return (
 <div className="rounded-xl border border-ink/5 bg-scrim/10 p-3.5">
 <div className="flex items-center justify-between gap-3">
 <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
 {label}
 </span>
 <span className={`text-[10px] font-mono uppercase ${statusTone[status] || statusTone.unavailable}`}>
 {status}
 </span>
 </div>
 <div className="mt-2 text-lg font-mono text-text-primary/85">{count}</div>
 <div className="text-[10px] text-text-primary/35">
 records · {formatAge(source?.age_seconds)}
 </div>
 </div>
 );
}

function ImpactBadge({ impact }) {
 const value = (impact || "low").toLowerCase();
 const tone = {
 high: "border-red-400/20 bg-red-400/10 text-loss",
 medium: "border-amber-300/20 bg-amber-300/10 text-amber-200",
 low: "border-ink/10 bg-ink/5 text-text-primary/40",
 }[value] || "border-ink/10 bg-ink/5 text-text-primary/40";
 return (
 <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${tone}`}>
 {value}
 </span>
 );
}

export default function EventRiskPanel({ data }) {
 if (!data) {
 return (
 <section className="rounded-xl border border-ink/5 bg-ink/[0.02] p-5">
 <p className="text-sm text-text-primary/50">
 News and event-risk context is temporarily unavailable.
 </p>
 </section>
 );
 }

 const tone = riskTone[data.risk_level] || riskTone.unavailable;
 const sources = data.source_health || {};
 const windows = data.windows || {};
 const events = data.upcoming_events || [];
 const headlines = data.headlines || [];
 const topics = data.topics || [];
 const penalty = data.confidence_adjustment?.penalty_points || 0;

 return (
 <section className="rounded-2xl border border-ink/5 bg-ink/[0.015] p-5 md:p-6">
 <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
 <div>
 <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-sky-300/70 mb-1">
 Phase 3 · Context layer
 </div>
 <h2 className="text-xl text-text-primary/90 font-medium">
 News and Event Risk
 </h2>
 <p className="text-xs text-text-primary/45 mt-1 max-w-2xl">
 Headlines and scheduled releases may lower confidence or raise a
 warning. They cannot create or reverse the market direction.
 </p>
 </div>
 <span className={`rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider ${tone.badge}`}>
 {tone.label} risk
 </span>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
 <SourceCard label="News source" source={sources.news} />
 <SourceCard label="Calendar source" source={sources.calendar} />
 <div className="rounded-xl border border-ink/5 bg-scrim/10 p-3.5">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
 Next 24 hours
 </div>
 <div className="mt-2 text-lg font-mono text-text-primary/85">
 {windows.next_24h?.event_count || 0}
 </div>
 <div className="text-[10px] text-text-primary/35">
 {windows.next_24h?.high_impact_count || 0} high impact
 </div>
 </div>
 <div className="rounded-xl border border-ink/5 bg-scrim/10 p-3.5">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
 Confidence guardrail
 </div>
 <div className={`mt-2 text-lg font-mono ${tone.accent}`}>
 {penalty ? `-${penalty} pts` : "No penalty"}
 </div>
 <div className="text-[10px] text-text-primary/35">direction unchanged</div>
 </div>
 </div>

 <div className={`rounded-xl border px-4 py-3 mb-5 ${tone.badge}`}>
 <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">
 Current warning
 </div>
 <div className="mt-1 text-sm">{data.summary}</div>
 </div>

 {topics.length > 0 && (
 <div className="flex flex-wrap gap-2 mb-5">
 {topics.slice(0, 6).map((topic) => (
 <span
 key={topic.topic}
 className="rounded-full border border-ink/5 bg-ink/[0.025] px-2.5 py-1 text-[10px] text-text-primary/55"
 >
 {topic.label} · {topic.article_count}
 </span>
 ))}
 </div>
 )}

 <div className="grid lg:grid-cols-2 gap-4">
 <div className="rounded-xl border border-ink/5 bg-scrim/10 overflow-hidden">
 <div className="px-4 py-3 border-b border-ink/5">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
 Upcoming economic events
 </div>
 </div>
 {events.length ? (
 <div className="divide-y divide-ink/5">
 {events.slice(0, 5).map((event, index) => (
 <div
 key={`${event.title}-${event.scheduled_at}-${index}`}
 className="px-4 py-3"
 >
 <div className="flex items-start justify-between gap-3">
 <div>
 <div className="text-sm text-text-primary/80">{event.title}</div>
 <div className="mt-1 text-[10px] font-mono text-text-primary/35">
 {event.country || "Global"} · {formatDate(event.scheduled_at)}
 </div>
 </div>
 <ImpactBadge impact={event.impact} />
 </div>
 <div className="mt-2 text-[10px] font-mono text-sky-200/70">
 {formatCountdown(event.hours_until)}
 {event.forecast ? ` · forecast ${event.forecast}` : ""}
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="px-4 py-6 text-sm text-text-primary/40">
 No BTC-relevant scheduled event found in the next seven days.
 </div>
 )}
 </div>

 <div className="rounded-xl border border-ink/5 bg-scrim/10 overflow-hidden">
 <div className="px-4 py-3 border-b border-ink/5">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
 Relevant headlines
 </div>
 </div>
 {headlines.length ? (
 <div className="divide-y divide-ink/5">
 {headlines.slice(0, 6).map((headline, index) => {
 const content = (
 <>
 <div className="flex items-start justify-between gap-3">
 <div className="text-sm text-text-primary/80 group-hover:text-text-primary transition-colors">
 {headline.title}
 </div>
 <ImpactBadge impact={headline.impact} />
 </div>
 <div className="mt-1 text-[10px] font-mono text-text-primary/35">
 {headline.source} · {formatAge(headline.age_seconds)} · {headline.topic_label}
 </div>
 </>
 );
 return headline.url ? (
 <a
 key={`${headline.title}-${index}`}
 href={headline.url}
 target="_blank"
 rel="noreferrer"
 className="group block px-4 py-3 hover:bg-ink/[0.02] transition-colors"
 >
 {content}
 </a>
 ) : (
 <div key={`${headline.title}-${index}`} className="px-4 py-3">
 {content}
 </div>
 );
 })}
 </div>
 ) : (
 <div className="px-4 py-6 text-sm text-text-primary/40">
 No relevant headline is available from the current source window.
 </div>
 )}
 </div>
 </div>
 </section>
 );
}
