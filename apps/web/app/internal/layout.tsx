import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

/** Internal-only — operator dashboards, KPI, ops tooling. Same gate as /admin. */
export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin?from=/internal");
  if (session.role !== "operator")
    redirect("/vendor?error=operator_role_required");
  return children;
}
