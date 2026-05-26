import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

/**
 * Admin route gate. middleware only checked
 * for a Supabase cookie's presence — every signed-in vendor could open
 * `/admin/sanctions`, `/admin/limits`, `/admin/risk-holds`. This layout runs
 * on every request inside `/admin/**` and redirects non-operators to /signin.
 * Server actions inside admin pages keep their own `requireOperator()` call
 * for defence-in-depth; this layout just stops the page from rendering at all.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin?from=/admin");
  if (session.role !== "operator") {
    // Friendly 403 — don't bounce a vendor to /signin when they're already in.
    redirect("/vendor?error=operator_role_required");
  }
  return children;
}
