import { makeWebhookReceiver, logInboundEvent } from "@/lib/webhookReceiver";
import { GATEWAY_WEBHOOK_SECRET } from "@/lib/env";

export const POST = makeWebhookReceiver({
  provider: "gateway",
  headerName: "klaro-signature",
  secret: GATEWAY_WEBHOOK_SECRET,
  onVerified: logInboundEvent("gateway"),
});
