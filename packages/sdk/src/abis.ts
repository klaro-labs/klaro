/**
 * Hand-rolled minimal ABIs. Klaro consumers only need the function selectors
 * they call — bundling full forge-out JSON balloons the SDK by ~200kb. Pull
 * the full ABIs from `packages/contracts/abis/v1.0/*.json` if you need them.
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
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getInvoice",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "vendor", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "dueAt", type: "uint64" },
          { name: "acceptedAt", type: "uint64" },
          { name: "acceptedBy", type: "address" },
          { name: "metadataHash", type: "bytes32" },
          { name: "screeningHash", type: "bytes32" },
          { name: "splitsHash", type: "bytes32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;

export const AUDIT_RECEIPT_ABI = [
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [{ name: "receiptHash", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "anchorOf",
    stateMutability: "view",
    inputs: [{ name: "receiptHash", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "invoiceId", type: "bytes32" },
          { name: "invoiceHash", type: "bytes32" },
          { name: "acceptanceHash", type: "bytes32" },
          { name: "screeningHash", type: "bytes32" },
          { name: "settlementTx", type: "bytes32" },
          { name: "settledAt", type: "uint64" },
          { name: "sourceChainId", type: "uint256" },
          { name: "vendor", type: "address" },
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
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

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
