import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Klaro",
  description: "Sign in to Klaro with email magic link, passkey, or wallet.",
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
