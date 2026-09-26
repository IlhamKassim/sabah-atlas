"use client";

import { Fragment, type ReactNode, useState } from "react";

export interface Citation {
  id: string;
  type: "data" | "document";
  label?: string;
  source_id?: string | null;
  vintage?: string | null;
  kind?: string;
  model_version?: string | null;
  title?: string;
  publisher?: string;
  page?: number | null;
  url?: string;
  excerpt?: string;
}

function Chip({ c, id }: { c?: Citation; id: string }) {
  const [open, setOpen] = useState(false);
  const doc = c?.type === "document";
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-expanded={open}
        className={`mx-0.5 rounded-sm px-1 align-baseline font-mono text-[0.68rem] ${c ? (doc ? "bg-kunyit/25 text-[#6b4a0c]" : "bg-laut/12 text-laut") : "bg-mogah/15 text-mogah"} hover:underline`}
      >
        {id}
      </button>
      {open && c && (
        <span role="tooltip" className="absolute left-0 top-6 z-40 block w-[min(88vw,380px)] border border-granite bg-pasir p-2.5 text-left text-xs font-normal leading-snug text-granite shadow-xl">
          {doc ? (
            <>
              <span className="block font-semibold">{c.title}</span>
              <span className="block text-muted">{c.publisher}{c.page ? ` · p. ${c.page}` : ""}</span>
              {c.excerpt && <span className="mt-1 block italic text-muted">“{c.excerpt}…”</span>}
              {c.url && <a className="mt-1 block text-laut underline" href={c.url} target="_blank" rel="noreferrer">Open source document ↗</a>}
            </>
          ) : (
            <>
              <span className="block">{c.label}</span>
              <span className="mt-1 block font-mono text-[0.62rem] text-muted">
                {c.kind === "analytics" ? `Atlas model ${c.model_version ?? ""}` : `Source ${c.source_id}`}
                {c.vintage ? ` · updated ${c.vintage}` : ""}
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

function inline(text: string, cites: Record<string, Citation>, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[(?:D|R)\d+\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${key}-b${i}`}>{tok.slice(2, -2)}</strong>);
    else {
      const id = tok.slice(1, -1);
      out.push(<Chip key={`${key}-c${i}`} id={id} c={cites[id]} />);
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal Markdown (headings, bullets, bold, paragraphs) with interactive citation chips. */
export function CitedMarkdown({ text, citations }: { text: string; citations: Citation[] }) {
  const cites = Object.fromEntries(citations.map((c) => [c.id, c]));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      blocks.push(<ul key={`ul${k}`} className="my-2 list-disc space-y-1 pl-5">{list.map((l, i) => <li key={i}>{inline(l, cites, `l${k}-${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  text.split("\n").forEach((raw, k) => {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flush(k);
    if (!line.trim()) return;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(<h3 key={k} className="mb-1 mt-4 font-serif text-lg font-semibold text-laut-deep">{h[2]}</h3>);
      return;
    }
    blocks.push(<p key={k} className="my-2 leading-relaxed">{inline(line, cites, `p${k}`)}</p>);
  });
  flush(-1);
  return <Fragment>{blocks}</Fragment>;
}
