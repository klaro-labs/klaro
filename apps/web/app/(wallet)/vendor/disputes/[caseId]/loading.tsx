import { SkeletonCard } from "@/components/klaro/Skeleton";

export default function DisputeDetailLoading() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 h-16 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)]" />
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <SkeletonCard rows={3} />
        <div className="mt-8">
          <SkeletonCard rows={5} />
        </div>
      </section>
    </main>
  );
}
