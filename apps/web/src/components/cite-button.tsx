"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** "Cite this view": APA + BibTeX with the data release version and a permalink. */
export function CiteButton({ title, release }: { title: string; release?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [version, setVersion] = useState(release ?? "");
  const path = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    if (release) return;
    fetch("/data/releases/latest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => m && setVersion(m.version))
      .catch(() => {});
  }, [release]);

  const url = typeof window !== "undefined" ? `${window.location.origin}${path}${sp.size ? `?${sp}` : ""}` : path;
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const apa = `Kassim, I. (${year}). ${title} [Data view]. Atlas Ekonomi Sabah, data release ${version || "latest"}. ${url} (accessed ${today})`;
  const key = `atlasekonomisabah${year}${title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16)}`;
  const bib = `@misc{${key},
  author = {Kassim, Ilham},
  title = {{${title}}},
  howpublished = {Atlas Ekonomi Sabah, data release ${version || "latest"}},
  year = {${year}},
  url = {${url}},
  note = {Accessed ${today}}
}`;

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="no-print relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="border border-granite px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider hover:bg-granite hover:text-pasir"
      >
        Cite this view
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,520px)] border border-granite bg-pasir p-3 text-xs shadow-xl">
          <p className="kicker text-muted">APA</p>
          <p className="mt-1 select-all leading-relaxed">{apa}</p>
          <button type="button" onClick={() => copy("apa", apa)} className="mt-1 font-mono text-[0.65rem] uppercase text-laut hover:underline">
            {copied === "apa" ? "Copied" : "Copy APA"}
          </button>
          <p className="kicker mt-3 text-muted">BibTeX</p>
          <pre className="mt-1 overflow-x-auto bg-pasir-2 p-2 font-mono text-[0.66rem] leading-snug">{bib}</pre>
          <button type="button" onClick={() => copy("bib", bib)} className="mt-1 font-mono text-[0.65rem] uppercase text-laut hover:underline">
            {copied === "bib" ? "Copied" : "Copy BibTeX"}
          </button>
        </div>
      )}
    </div>
  );
}
