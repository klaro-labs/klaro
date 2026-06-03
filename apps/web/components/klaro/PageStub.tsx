import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Nav } from "./Nav";

/**
 * PageStub — interim placeholder for routes whose pages haven't been built
 * yet but need to exist so the typed-routes type-system is happy + nav links
 * don't 404. Each future page replaces its stub with real content; this
 * component is intentionally bare so it's obvious nothing real is shipped yet.
 * (no overclaiming): every stub shows a clear "in progress"
 * label and a date target, never pretends to be the finished page.
 */
export function PageStub({ title, eta }: { title: string; eta: string }) {
  return (
    <main>
      <Nav />
      <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] pt-24 pb-24">
        <Eyebrow className="mb-3">In progress</Eyebrow>
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-4 max-w-prose text-[var(--color-ink-muted)]">
          This page hasn&rsquo;t shipped yet. Target: <strong>{eta}</strong>.
          See the full landing for what&rsquo;s live today.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/"
            className="text-sm text-[var(--color-brand)] hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
