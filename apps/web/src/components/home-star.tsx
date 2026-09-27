"use client";

import { setHomeDistrict, useHomeDistrict } from "@/lib/home-district";

/** "Set as my district": optional, remembered in this browser only. */
export function HomeStar({ slug, name, compact = false }: { slug: string; name: string; compact?: boolean }) {
  const home = useHomeDistrict();
  const on = home?.slug === slug;
  return (
    <button
      type="button"
      onClick={() => setHomeDistrict(on ? null : { slug, name })}
      aria-pressed={on}
      title={on ? "Your district (click to unset)" : `Set ${name} as my district`}
      className={`inline-flex items-center gap-1.5 rounded-md border font-mono uppercase tracking-wider transition-colors ${
        compact ? "h-6 px-1.5 text-[0.6rem]" : "px-2.5 py-1 text-[0.68rem]"
      } ${on ? "border-kunyit/60 bg-kunyit/15 text-kunyit" : "border-line text-muted hover:border-kunyit hover:text-kunyit"}`}
    >
      <span aria-hidden>{on ? "★" : "☆"}</span>
      {on ? "My district" : compact ? "Mine" : "Set as my district"}
    </button>
  );
}
