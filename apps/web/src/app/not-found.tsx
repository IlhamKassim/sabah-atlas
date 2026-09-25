import Link from "next/link";

import { Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-24">
      <p className="kicker">404</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">Not on the map</h1>
      <div className="mogah-rule mt-2" aria-hidden />
      <p className="mt-4 max-w-lg text-muted">
        That page or district is not in the atlas. Sabah&apos;s 27 districts are listed on the{" "}
        <Link className="underline" href="/explore">map</Link>.
      </p>
    </Container>
  );
}
