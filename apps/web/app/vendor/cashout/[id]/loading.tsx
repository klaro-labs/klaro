import { SkeletonCard } from "@/components/klaro/Skeleton";

export default function CashoutDetailLoading() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 h-16 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)]" />
      <section className="mx-auto w-full max-w-3xl px-6 py-12">
        <SkeletonCard rows={2} />
        <div className="mt-8">
          <SkeletonCard rows={6} />
        </div>
      </section>
    </main>
  );
}
