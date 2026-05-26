import { makeWebhookReceiver } from "@/lib/webhookReceiver";
import { CIRCLE_WEBHOOK_SECRET } from "@/lib/env";

export const POST = makeWebhookReceiver({
  provider: "circle",
  headerName: "circle-signature",
  format: "klaro",
  secret: CIRCLE_WEBHOOK_SECRET,
});
