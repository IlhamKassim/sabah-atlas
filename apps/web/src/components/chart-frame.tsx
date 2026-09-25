"use client";

import { type ReactNode, useRef } from "react";

type Row = Record<string, string | number | boolean | null | undefined>;

function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function inlineSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Resolve CSS variables so the exported file stands alone.
  const cs = getComputedStyle(document.documentElement);
  let s = new XMLSerializer().serializeToString(clone);
  s = s.replace(/var\((--[a-z0-9-]+)\)/gi, (_, v) => cs.getPropertyValue(v).trim() || "#000");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${s}`;
}

/** Wraps a chart with a title, caption/source line and SVG / PNG / CSV downloads. */
export function ChartFrame({
  title, caption, filename, rows, children, className = "", controls,
}: {
  title?: string;
  controls?: ReactNode;
  caption?: ReactNode;
  filename: string;
  rows?: Row[];
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const svg = () => ref.current?.querySelector("svg") as SVGSVGElement | null;

  const asSvg = () => {
    const el = svg();
    if (el) download(`${filename}.svg`, new Blob([inlineSvg(el)], { type: "image/svg+xml" }));
  };
  const asPng = () => {
    const el = svg();
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width * 2;
      c.height = height * 2;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#f3ede1";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => b && download(`${filename}.png`, b), "image/png");
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(inlineSvg(el))}`;
  };
  const asCsv = () => rows && download(`${filename}.csv`, new Blob([toCsv(rows)], { type: "text/csv" }));

  return (
    <figure className={className}>
      {title && <figcaption className="mb-2 font-serif text-[1.02rem] font-semibold text-granite">{title}</figcaption>}
      {controls}
      <div ref={ref}>{children}</div>
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
        <div className="source-note max-w-2xl">{caption}</div>
        <div className="no-print flex gap-1 font-mono text-[0.62rem] uppercase tracking-wide">
          <button type="button" onClick={asSvg} className="border border-pasir-3 px-1.5 py-0.5 text-muted hover:border-laut hover:text-laut">SVG</button>
          <button type="button" onClick={asPng} className="border border-pasir-3 px-1.5 py-0.5 text-muted hover:border-laut hover:text-laut">PNG</button>
          {rows && (
            <button type="button" onClick={asCsv} className="border border-pasir-3 px-1.5 py-0.5 text-muted hover:border-laut hover:text-laut">CSV</button>
          )}
        </div>
      </div>
    </figure>
  );
}
