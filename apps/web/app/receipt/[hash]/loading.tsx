import { SkeletonCard } from "@/components/klaro/Skeleton";
export default function ReceiptLoading() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <SkeletonCard rows={6} />
      </div>
    </main>
  );
}
