import { SkeletonCard } from "@/components/klaro/Skeleton";

export default function VendorLoading() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 h-16 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)]" />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <SkeletonCard rows={5} />
          <SkeletonCard rows={5} />
        </div>
      </section>
    </main>
  );
}
