import { makeWebhookReceiver, logInboundEvent } from "@/lib/webhookReceiver";
import { CCTP_WEBHOOK_SECRET } from "@/lib/env";

export const POST = makeWebhookReceiver({
  provider: "cctp",
  headerName: "klaro-signature",
  secret: CCTP_WEBHOOK_SECRET,
  onVerified: logInboundEvent("cctp"),
});
