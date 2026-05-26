#!/usr/bin/env node
/**
 * `klaro` — Klaro command-line.
 * Subcommands:
 * klaro invoice create --to <email> --amount <usd> --due <date> [--description]
 * klaro invoice get <invoiceId>
 * klaro receipt verify <receiptHash>
 * klaro cashout list
 * klaro version
 * Connects to Arc testnet by default. ESCROW + RECEIPT addresses read from
 * env (NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS / NEXT_PUBLIC_AUDIT_RECEIPT_ADDRESS).
 * PRIVATE_KEY env required for write commands.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  KlaroClient,
  ADDRESSES,
  ARC_TESTNET_RPC_URL,
  ARC_TESTNET_CHAIN_ID,
  ARC_EXPLORER,
} from "@klaro/sdk";

const VERSION = "1.0.0-rc.1";

function usage(): never {
  console.log(`klaro ${VERSION}

Usage:
  klaro invoice create --to <email> --amount <usd> --due <yyyy-mm-dd> [--description "..."]
  klaro invoice get <invoiceId>
  klaro receipt verify <receiptHash>
  klaro cashout list
  klaro version
  klaro help

Env:
  ARC_TESTNET_RPC_URL                   default: ${ARC_TESTNET_RPC_URL}
  PRIVATE_KEY                           required for write commands
  NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS    required for invoice + receipt commands
  NEXT_PUBLIC_AUDIT_RECEIPT_ADDRESS     required for receipt verify
`);
  process.exit(0);
}

function arg(args: string[], k: string): string | undefined {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
}

async function makeClient(needsWallet: boolean): Promise<KlaroClient> {
  const escrow = process.env.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as
    | Hex
    | undefined;
  const receipt = process.env.NEXT_PUBLIC_AUDIT_RECEIPT_ADDRESS as
    | Hex
    | undefined;
  if (!escrow || !receipt) {
    console.error(
      "Set NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS + NEXT_PUBLIC_AUDIT_RECEIPT_ADDRESS first.",
    );
    process.exit(2);
  }
  const rpc = process.env.ARC_TESTNET_RPC_URL ?? ARC_TESTNET_RPC_URL;
  const chain = {
    id: ARC_TESTNET_CHAIN_ID,
    name: "Arc Testnet",
    network: "arc-testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: [rpc] }, public: { http: [rpc] } },
  } as never;
  const publicClient = createPublicClient({ chain, transport: http(rpc) });

  let walletClient: ReturnType<typeof createWalletClient> | undefined;
  if (needsWallet) {
    const pk = process.env.PRIVATE_KEY as Hex | undefined;
    if (!pk) {
      console.error("PRIVATE_KEY env required for this command.");
      process.exit(2);
    }
    const account = privateKeyToAccount(pk);
    walletClient = createWalletClient({ account, chain, transport: http(rpc) });
  }
  return new KlaroClient({ escrow, receipt, publicClient, walletClient });
}

async function main() {
  const [, , cmd, sub, ...rest] = process.argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") usage();
  if (cmd === "version") {
    console.log(VERSION);
    return;
  }

  if (cmd === "invoice" && sub === "create") {
    const to = arg(rest, "--to");
    const amount = arg(rest, "--amount");
    const due = arg(rest, "--due");
    const description = arg(rest, "--description") ?? "Klaro invoice";
    if (!to || !amount || !due) usage();
    const klaro = await makeClient(true);
    const invoiceId = keccak256(
      toBytes(`klaro/${to}/${amount}/${due}/${Date.now()}`),
    );
    const metadataHash = keccak256(
      toBytes(JSON.stringify({ to, description, amount, due })),
    );
    const dueAt = BigInt(Math.floor(new Date(due).getTime() / 1000));
    const amountMicro = BigInt(Math.round(Number(amount) * 1_000_000));
    const tx = await klaro.invoices.create({
      invoiceId,
      token: ADDRESSES.USDC as Hex,
      amount: amountMicro,
      dueAt,
      metadataHash,
    });
    console.log("Invoice:   ", invoiceId);
    console.log("Tx:        ", tx);
    console.log("Hosted URL:", `https://klaro.so/i/${invoiceId}`);
    console.log("Explorer:  ", `${ARC_EXPLORER}/tx/${tx}`);
    return;
  }
  if (cmd === "invoice" && sub === "get") {
    const id = rest[0] as Hex;
    if (!id) usage();
    const klaro = await makeClient(false);
    console.log(await klaro.invoices.get(id));
    return;
  }
  if (cmd === "receipt" && sub === "verify") {
    const hash = rest[0] as Hex;
    if (!hash) usage();
    const klaro = await makeClient(false);
    const r = await klaro.receipt.load(hash);
    console.log(r.exists ? "✓ Verified on Arc" : "✗ Not found");
    if (r.anchor)
      console.log(
        JSON.stringify(
          r.anchor,
          (_, v) => (typeof v === "bigint" ? v.toString() : v),
          2,
        ),
      );
    return;
  }
  if (cmd === "cashout" && sub === "list") {
    console.log(
      "Cashout list — wire to your indexer in M12+. SDK has primitives, no listAll() yet.",
    );
    return;
  }
  usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
