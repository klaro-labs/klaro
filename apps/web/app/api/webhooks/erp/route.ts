import { makeWebhookReceiver } from "@/lib/webhookReceiver";
import { ERP_WEBHOOK_SECRET } from "@/lib/env";

export const POST = makeWebhookReceiver({
  provider: "erp",
  headerName: "klaro-signature",
  secret: ERP_WEBHOOK_SECRET,
});
