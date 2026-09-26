import { redirect } from "next/navigation";

// The map moved to the home page; keep old links (and their indicator/year/division) working.
export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["indicator", "year", "division"]) {
    const v = sp[k];
    if (typeof v === "string") q.set(k, v);
  }
  redirect(q.size ? `/?${q}` : "/");
}
