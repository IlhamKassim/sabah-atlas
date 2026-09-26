import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <Container className="py-8">
      <p className="kicker">About</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Numbers a planner can defend</h1>
      <div className="mogah-rule mt-3" aria-hidden />
      <div className="prose-atlas mt-6 max-w-3xl">
        <p>
          Sabah is one of Malaysia&apos;s most unequal regions internally, yet the data describing those gaps is scattered across survey reports, spreadsheets and satellite archives. SabahKu (&ldquo;my Sabah&rdquo;) brings each district&apos;s structure, trajectory and peers into one place, with the reasoning shown, for state and district planners, researchers, elected representatives&apos; offices, journalists and NGOs.
        </p>
        <h2>What it is, and is not</h2>
        <ul>
          <li>An evidence atlas built on official DOSM statistics, with transparent diagnostics and projections that show their uncertainty.</li>
          <li>Not a source of individual or household microdata: every figure is an aggregate published by DOSM or derived from one.</li>
          <li>Not political: no party or candidate content, no seat predictions, neutral language throughout.</li>
          <li>Not real-time: a slow-data atlas, updated when a new official vintage arrives.</li>
        </ul>
        <h2>Design and cultural credits</h2>
        <p>
          The colours come from Sabah&apos;s landscape: the sunset at Tanjung Aru for the West Coast, the Crocker Range rainforest for the Interior, the sand at the Tip of Borneo for Kudat, Kinabatangan orchids for Sandakan and the Semporna sea for Tawau. The mark is Mount Kinabalu&apos;s summit above the sea. The district <em>jalur</em> strips borrow the <em>structure</em> of Sabah&apos;s textiles, not their patterns: their banding follows the <strong>mogah</strong> sarongs woven by Iranun and Bajau communities, and loading states echo the ordered dots of <strong>Rungus beadwork</strong> from Kudat.
        </p>
        <p>
          These are abstracted geometries, not reproductions of specific ceremonial motifs. We credit the communities whose craft informed them, and we intend to have the motif set reviewed by a cultural practitioner or a heritage academic at Universiti Malaysia Sabah before the version 1.0 launch. If you are one, we would value your advice.
        </p>
        <h2>Data and methods</h2>
        <p>
          Official statistics come from the Department of Statistics Malaysia via OpenDOSM (CC BY 4.0) and boundaries from geoBoundaries (CC BY 3.0). How every number is produced, including model cards, backtests and known limitations, is on the <Link href="/methodology">methodology page</Link>. Everything is downloadable from the <Link href="/data">data page</Link>.
        </p>
        <h2>Corrections</h2>
        <p>
          If a number looks wrong, a district is mis-named, or a sentence is unfair, please <a href="https://github.com/IlhamKassim/sabah-atlas/issues/new">open an issue</a>. Corrections are logged publicly in the errata and the release changelog.
        </p>
        <h2>Team</h2>
        <p>Built by Ilham Kassim. Code is open source under MIT on <a href="https://github.com/IlhamKassim/sabah-atlas">GitHub</a>; contributions and external review from researchers and planners are welcome.</p>
      </div>
    </Container>
  );
}
