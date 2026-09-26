"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="border border-ink px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider hover:bg-ink hover:text-bg">
      Download PDF
    </button>
  );
}
