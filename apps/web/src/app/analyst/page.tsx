import type { Metadata } from "next";
import Link from "next/link";

import { AnalystChat } from "@/components/analyst-chat";
import { Container, Pill, SectionTitle } from "@/components/ui";
import { api, ApiError, type BriefSummary, type EvalReport, publicApiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Analyst" };

async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export default async function AnalystPage({ searchParams }: PageProps<"/analyst">) {
  const sp = await searchParams;
  const [status, ds, briefs, evalRep] = await Promise.all([
    api.analystStatus(),
    api.districts("sabah"),
    optional(api.briefs()),
    optional(api.analystEval()),
  ]);
  const districts = ds.filter((d) => d.kind === "district").map((d) => ({ slug: d.slug, name: d.name }));
  const bySlug = Object.fromEntries((briefs ?? []).map((b) => [b.slug, b])) as Record<string, BriefSummary>;
  const initial = typeof sp.district === "string" ? sp.district : undefined;

  return (
    <Container className="py-8">
      <p className="kicker">Advise</p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">AI Analyst</h1>
      <div className="mogah-rule mt-3" aria-hidden />
      <p className="mt-4 max-w-3xl text-muted">
        Ask about any Sabah district. The Analyst can only use the atlas&apos;s own data and a curated document library, through read-only tools. Every sentence that states a fact carries a citation, and a validator checks each cited number against the database before you see it. Answers here are <strong>AI-generated and unreviewed</strong>; the brief library below holds briefs that go through human review.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-label="Ask the Analyst">
          {!status.available && (
            <p className="mb-4 border-l-4 border-kunyit bg-kunyit/10 p-3 text-sm">
              The Analyst is switched off on this server (no model configured). The reviewed brief library and evaluation results remain available.
            </p>
          )}
          <AnalystChat apiUrl={publicApiUrl} districts={districts} initialDistrict={initial} available={status.available} />
        </section>

        <aside className="space-y-10">
          <section>
            <SectionTitle kicker="Evaluation" title="How well it cites" />
            {evalRep ? <EvalPanel r={evalRep} /> : <p className="text-sm text-muted">The fixed evaluation set has not been run on this server yet.</p>}
          </section>
          <section>
            <SectionTitle kicker="Brief library" title="District briefs" />
            <ul className="divide-y divide-pasir-3 border-y border-pasir-3 text-sm">
              {districts.map((d) => {
                const b = bySlug[d.slug];
                return (
                  <li key={d.slug} className="flex items-center justify-between gap-2 py-1.5">
                    {b ? <Link className="hover:text-laut hover:underline" href={`/district/${d.slug}/brief`}>{d.name}</Link> : <span className="text-muted">{d.name}</span>}
                    {b ? (
                      <Pill tone={b.status === "reviewed" ? "good" : b.status === "rejected" ? "bad" : "warn"}>{b.status === "reviewed" ? "reviewed" : b.status === "rejected" ? "withdrawn" : "draft · unreviewed"}</Pill>
                    ) : <span className="font-mono text-[0.62rem] text-faint">not generated</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </Container>
  );
}

function EvalPanel({ r }: { r: EvalReport }) {
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
  return (
    <div className="text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="dastar p-3">
          <p className="text-xs text-muted">Citation validity</p>
          <p className={`font-mono text-2xl ${r.meets_target ? "text-laut" : "text-mogah"}`}>{pct(r.citation_validity)}</p>
          <p className="source-note">target ≥ {pct(r.target_validity)} · {r.citations} citations</p>
        </div>
        <div className="dastar p-3">
          <p className="text-xs text-muted">Factual checks passed</p>
          <p className="font-mono text-2xl">{pct(r.factual_checks)}</p>
          <p className="source-note">usefulness {r.usefulness_mean ?? "—"}/5</p>
        </div>
      </div>
      <table className="mt-3 w-full text-xs">
        <thead><tr className="border-b border-granite/50 text-left font-mono text-[0.6rem] uppercase text-muted"><th className="py-1">Category</th><th className="text-right">Qs</th><th className="text-right">Checks</th></tr></thead>
        <tbody>
          {Object.entries(r.by_category).map(([k, v]) => (
            <tr key={k} className="border-b border-pasir-3/70"><td className="py-1">{k}</td><td className="text-right font-mono">{v.n}</td><td className="text-right font-mono">{v.checks_passed}/{v.checks_total}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="source-note mt-2">Run {r.run_at.slice(0, 10)} · {r.model} · data release {r.release} · {r.sentences_stripped} sentences removed by the validator. Re-run on every prompt or model change.</p>
    </div>
  );
}
