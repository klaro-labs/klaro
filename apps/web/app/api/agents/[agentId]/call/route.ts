import { NextRequest } from "next/server";
import { mockGetAgent } from "@/lib/mockData";
import { requirePayment } from "@/lib/x402";
import { x402Live } from "@/lib/env";

/**
 * x402-gated agent call endpoint. Demo / template that real agent providers
 * fork for their own resource servers.
 * 1. POST without `Payment-Signature` header → 402 with payment options
 * 2. POST with valid signature → returns the agent's response
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  // in live x402 mode this endpoint would charge the
  // caller real USDC via the Circle facilitator and return a stub
  // string ("Stub response — wire to real agent backend in M11"). That
  // is a money-loss + misleading-claim violation of . The
  // route is a demo template; real agent providers fork it for their
  // own resource servers (KlaroAgent SDK pattern). Refuse to settle
  // payment until a real agent backend is wired here.
  if (x402Live()) {
    return Response.json(
      {
        error: "agent_call_stub_not_live",
        detail:
          "This endpoint is a demo template. Fork it and wire to a real agent backend before enabling x402 live mode, otherwise callers would be charged USDC for a stub response.",
      },
      { status: 503 },
    );
  }
  const agent = await mockGetAgent(agentId);
  if (!agent) return Response.json({ error: "unknown agent" }, { status: 404 });

  const result = await requirePayment(req, {
    priceUsdc: agent.pricePerCallUsdc,
    resource: `klaro://agents/${agentId}/call`,
    description: `One call to ${agent.displayName}`,
  });

  // requirePayment returns a 402 Response when payment missing
  if (result instanceof Response) return result;

  // Payment verified → return the agent's actual response.
  return Response.json({
    agent: agent.displayName,
    mode: result.mode,
    paidAmountUsdc: result.paidAmountUsdc?.toString() ?? "0",
    authHash: result.txOrAuthHash,
    response: {
      simulated: true,
      message: `[${agent.displayName}] Stub response — wire to real agent backend in M11.`,
      receivedAt: new Date().toISOString(),
    },
  });
}
