import { Web3Provider } from "@/components/providers/Web3Provider";

/**
 * Wallet route group layout. Scopes the wagmi/viem/WalletConnect stack to the
 * routes that actually connect a wallet (/vendor, /pay, /i) instead of shipping
 * it in the root layout's shared bundle to every marketing page. Route groups
 * are URL-transparent, so paths are unchanged (/vendor/..., /pay/..., /i/...).
 *
 * Only routes whose tree renders a wagmi component live here — verified by
 * `pnpm build` (a statically-rendered page that used a wallet hook without this
 * provider would fail the build).
 */
export default function WalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Web3Provider>{children}</Web3Provider>;
}
