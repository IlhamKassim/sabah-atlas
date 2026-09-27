import Link from "next/link";

import { LogoStacked } from "@/components/logo";
import { Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-20 text-center">
      <LogoStacked size={88} className="text-[2rem]" />
      <p className="kicker mt-12">404</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">Not on the map</h1>
      <div className="mogah-rule mt-2" aria-hidden />
      <p className="mt-4 max-w-lg text-muted">
        That page or district is not in SabahKu. Sabah&apos;s 27 districts are listed on the{" "}
        <Link className="underline" href="/">map</Link>.
      </p>
    </Container>
  );
}
