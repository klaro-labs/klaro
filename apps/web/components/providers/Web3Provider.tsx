"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { arcTestnet, base, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Web3 providers — wagmi + viem + react-query.
 * Configured chains:
 * - **arcTestnet** (primary settlement chain)
 * - base, mainnet (source chains for cross-chain pay flow in M5+)
 * Connector: `injected()` covers MetaMask, Phantom, Rabby, Coinbase Wallet
 * out of the box via the EIP-1193 standard. RainbowKit / ConnectKit can
 * layer on later for prettier multi-wallet UX without changing this file.
 * SSR-safe: the QueryClient is created in `useState` so server + client
 * render don't share state across requests.
 */

const config = createConfig({
  chains: [arcTestnet, base, mainnet],
  connectors: [injected()],
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
