/**
 * ABI fragments for client-side viem reads/writes. Hand-rolled (not
 * abigen'd) so the bundle ships only the slices we actually use.
 */

export const INVOICE_ESCROW_ABI = [
  {
    type: "function",
    name: "ACCEPTANCE_TYPEHASH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "domainSeparator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "acceptAndPay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "buyerSignature", type: "bytes" },
      { name: "buyer", type: "address" },
    ],
    outputs: [],
  },
  // QA-020: vendor publishes the invoice on-chain from their own wallet.
  // `vendor` is set to msg.sender inside the contract, so the connected
  // wallet MUST be the invoice's payout wallet (enforced in the UI).
  {
    type: "function",
    name: "createInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "dueAt", type: "uint64" },
      { name: "metadataHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

// LF-3: vendor-signed cashout request. `requestAndLock` sets
// `vendor = msg.sender` + pulls USDC into escrow, so the connected wallet MUST
// be the vendor's payout wallet (enforced in the UI, mirrors createInvoice).
export const CASHOUT_ORDER_PROCESSOR_ABI = [
  {
    type: "function",
    name: "requestAndLock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cashoutId", type: "bytes32" },
      { name: "usdcAmount", type: "uint256" },
      { name: "inrAmount", type: "uint256" },
      { name: "corridor", type: "bytes32" },
      { name: "quoteExpiresAt", type: "uint64" },
      { name: "quoteHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getOrder",
    stateMutability: "view",
    inputs: [{ name: "cashoutId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "vendor", type: "address" },
          { name: "token", type: "address" },
          { name: "usdcAmount", type: "uint256" },
          { name: "inrAmount", type: "uint256" },
          { name: "lpId", type: "bytes32" },
          { name: "lpWallet", type: "address" },
          { name: "corridor", type: "bytes32" },
          { name: "requestedAt", type: "uint64" },
          { name: "quoteExpiresAt", type: "uint64" },
          { name: "quoteHash", type: "bytes32" },
          { name: "proofHash", type: "bytes32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** EIP-712 typed-data for InvoiceAcceptance — must match
 * `InvoiceEscrow.ACCEPTANCE_TYPEHASH`. M7 adds `splitsHash` so buyers
 * cryptographically commit to the payout split (sole-vendor invoices
 * use `0x00...` so the schema is uniform). */
export const ACCEPTANCE_EIP712_TYPES = {
  InvoiceAcceptance: [
    { name: "invoiceId", type: "bytes32" },
    { name: "vendor", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "dueAt", type: "uint64" },
    { name: "metadataHash", type: "bytes32" },
    { name: "splitsHash", type: "bytes32" },
  ],
} as const;

// Klaro Link: the vendor signs this once at link creation; the relayer presents
// it to InvoiceEscrow.createInvoiceFor at each pay. Field order + types MUST
// match LINK_INVOICE_AUTH_TYPEHASH in InvoiceEscrow.sol, or on-chain
// verification reverts BadVendorAuth. Shared by the vendor's LinkForm (client
// signer) and createLinkAction (server verifier).
export const LINK_AUTH_EIP712_TYPES = {
  LinkInvoiceAuthorization: [
    { name: "vendor", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "linkId", type: "bytes32" },
    { name: "authDeadline", type: "uint64" },
  ],
} as const;

/** Arc system USDC (6-dec) — fixed precompile address, same on every Arc env. */
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;
