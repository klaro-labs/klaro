"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { arcTestnet, base, mainnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Web3 providers: wagmi + viem + react-query.
 *
 * Connectors:
 *   - `injected()` covers MetaMask, Phantom, Rabby, Coinbase, Brave, OKX
 *     via the EIP-1193 standard. Works for browser-extension wallets.
 *   - `walletConnect()` brings in mobile wallets (Trust, mobile MetaMask,
 *     Rainbow, 1inch, etc.) via QR / deep-link. Disabled when the project
 *     id env is unset so local development doesn't fetch the relay key.
 *
 * Chains:
 *   - arcTestnet (primary settlement)
 *   - base, mainnet (source chains for cross-chain pay-in)
 *
 * SSR-safe: QueryClient is created in `useState` so the server and client
 * render don't share state across requests.
 */

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected(),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          metadata: {
            name: "Klaro",
            description: "USDC invoicing on Arc",
            url:
              process.env.NEXT_PUBLIC_PUBLIC_ORIGIN ??
              "https://klaro-peach.vercel.app",
            icons: [
              `${process.env.NEXT_PUBLIC_PUBLIC_ORIGIN ?? "https://klaro-peach.vercel.app"}/icon.png`,
            ],
          },
        }),
      ]
    : []),
];

const config = createConfig({
  chains: [arcTestnet, base, mainnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
    [base.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
