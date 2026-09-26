"use client";

import { useState } from "react";

import { type Citation, CitedMarkdown } from "./cited-markdown";

interface Result {
  text: string;
  citations: Citation[];
  validation: { citations_total: number; citations_valid: number; citation_validity: number; stripped: { sentence: string; reason: string }[] };
  model: string;
  label: string;
}

const TOOL_LABEL: Record<string, string> = {
  get_district_profile: "Reading district profile",
  get_scorecard: "Checking the scorecard",
  get_peers: "Finding structural peers",
  get_forecast: "Reading forecasts",
  get_shift_share: "Decomposing GDP growth",
  get_drivers: "Reading driver analysis",
  compare_districts: "Comparing districts",
  rank_districts: "Ranking districts",
  search_documents: "Searching policy documents",
};

const EXAMPLES = [
  "What is working and what is holding Pitas back?",
  "Which Sabah district's median income grew fastest since 2019?",
  "How has Kota Kinabalu's GDP likely changed since 2020?",
  "Who are Tongod's structural peers, and which improved faster?",
];

export function AnalystChat({ apiUrl, districts, initialDistrict, available }: {
  apiUrl: string;
  districts: { slug: string; name: string }[];
  initialDistrict?: string;
  available: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [district, setDistrict] = useState(initialDistrict ?? "");
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setSteps([]);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/v1/ask`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ question: q, district: district || null }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split(/\r?\n\r?\n/);
        buf = events.pop() ?? "";
        for (const ev of events) {
          const name = ev.match(/^event: (.*)$/m)?.[1];
          const data = ev.match(/^data: (.*)$/m)?.[1];
          if (!name || !data) continue;
          const payload = JSON.parse(data);
          if (name === "tool") setSteps((s) => [...s, `${TOOL_LABEL[payload.name] ?? payload.name}${payload.arguments?.district ? ` · ${payload.arguments.district}` : ""}`]);
          if (name === "status" && payload.stage === "validating") setSteps((s) => [...s, "Checking every citation against the database"]);
          if (name === "status" && payload.stage === "repairing") setSteps((s) => [...s, `Rewriting ${payload.stripped} unsupported sentence(s)`]);
          if (name === "answer") setResult(payload);
          if (name === "error") setError(payload.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(question); }}
        className="dastar p-4"
      >
        <label className="block">
          <span className="kicker text-muted">Your question</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            maxLength={800}
            disabled={!available}
            placeholder={available ? "e.g. Why is poverty in Kota Marudu higher than in its peers?" : "The Analyst is not configured on this server yet."}
            className="mt-1 w-full resize-y border border-pasir-3 bg-white/70 p-2 text-sm"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className="border border-pasir-3 bg-white/70 px-2 py-1 text-sm" aria-label="District context">
            <option value="">No district context</option>
            {districts.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
          <button type="submit" disabled={!available || busy || !question.trim()} className="bg-granite px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-pasir hover:bg-laut disabled:opacity-40">
            {busy ? "Working…" : "Ask"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" disabled={!available || busy} onClick={() => { setQuestion(ex); submit(ex); }}
              className="border border-pasir-3 px-2 py-0.5 text-left text-xs text-muted hover:border-laut hover:text-laut disabled:opacity-40">
              {ex}
            </button>
          ))}
        </div>
      </form>

      {(steps.length > 0 || busy) && (
        <ol className="mt-4 space-y-0.5 font-mono text-[0.7rem] text-muted" aria-live="polite">
          {steps.map((s, i) => <li key={i}>✓ {s}</li>)}
          {busy && <li className="flex items-center gap-2"><span className="rungus-dots" aria-hidden><span /><span /><span /><span /></span>working</li>}
        </ol>
      )}
      {error && <p role="alert" className="mt-4 border-l-4 border-mogah bg-mogah/10 p-3 text-sm">{error}</p>}
      {result && (
        <article className="mt-4 border-t-4 border-laut bg-white/50 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-sm border border-dashed border-granite/40 px-1.5 py-0.5 font-mono text-[0.62rem] uppercase tracking-wide">{result.label}</span>
            <span className="font-mono text-[0.62rem] text-muted">
              {result.validation.citations_valid}/{result.validation.citations_total} citations verified
              {result.validation.stripped.length ? ` · ${result.validation.stripped.length} unsupported sentence(s) removed` : ""} · {result.model}
            </span>
          </div>
          <div className="text-[0.95rem]"><CitedMarkdown text={result.text} citations={result.citations} /></div>
          <p className="source-note mt-3">Click a citation to see its source. [D#] = atlas data (value, source, year); [R#] = document passage.</p>
        </article>
      )}
    </div>
  );
}
