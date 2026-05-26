import { SkeletonCard } from "@/components/klaro/Skeleton";
export default function HostedInvoiceLoading() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <header className="h-14 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)]" />
      <section className="mx-auto w-full max-w-3xl px-6 py-12">
        <SkeletonCard rows={6} />
      </section>
    </main>
  );
}
