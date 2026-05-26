import { SkeletonCard } from "@/components/klaro/Skeleton";
export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 h-16 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)]" />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} rows={1} />
          ))}
        </div>
      </section>
    </main>
  );
}
