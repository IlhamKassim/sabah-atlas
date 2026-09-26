"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="border border-granite px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider hover:bg-granite hover:text-pasir">
      Download PDF
    </button>
  );
}
