import { SkeletonCard } from "@/components/klaro/Skeleton";

/**
 * Vendor route skeleton. The route is wrapped by AppShell (sidebar + topbar +
 * 240px grid), so this renders content-only inside the same wrapper the real
 * pages use — no outer <main> or fake topbar, which would double the chrome
 * and drop the sidebar gutter on every navigation.
 */
export default function VendorLoading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-10">
      <div className="grid gap-4 md:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <SkeletonCard rows={5} />
        <SkeletonCard rows={5} />
      </div>
    </div>
  );
}
