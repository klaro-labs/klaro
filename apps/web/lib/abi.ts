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
