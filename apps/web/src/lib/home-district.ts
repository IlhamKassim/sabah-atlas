"use client";

import { useSyncExternalStore } from "react";

// The reader's own district, kept in this browser only ("slug|Name").
const KEY = "sabahku-home";
const EVENT = "sabahku:home";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}
function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useHomeDistrict(): { slug: string; name: string } | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  if (!raw) return null;
  const [slug, name] = raw.split("|");
  return { slug, name: name ?? slug };
}

export function setHomeDistrict(d: { slug: string; name: string } | null) {
  try {
    if (d) localStorage.setItem(KEY, `${d.slug}|${d.name}`);
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
