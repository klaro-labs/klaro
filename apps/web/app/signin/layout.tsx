import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Klaro",
  description: "Sign in to Klaro with a Google account or email magic link.",
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
