import { Skeleton, SkeletonCard } from "@/components/klaro/Skeleton";

/**
 * Layout-neutral LP loading fallback. This single file backs every /lp/* route,
 * including the ~800px form pages, so it must not flash a 4-stat dashboard grid
 * that then collapses (CLS). One centered column of generic SkeletonCards reads
 * correctly on both the dashboard and the form pages.
 */
export default function LpLoading() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <Skeleton width={180} height={12} />
        <div className="mt-3">
          <Skeleton width={280} height={28} />
        </div>
        <div className="mt-8 space-y-3">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      </section>
    </main>
  );
}
