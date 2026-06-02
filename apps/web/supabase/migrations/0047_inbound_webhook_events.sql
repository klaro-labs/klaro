-- #12 (build pass 2026-06-02): give verified inbound webhooks a real effect.
-- The cctp/gateway/circle receivers verified the HMAC signature and then did
-- NOTHING — a valid signed delivery was a no-op. They now record the event here
-- (lib/webhookReceiver.ts logInboundEvent), keyed by (provider, event_id) so a
-- duplicate delivery is idempotent. The actual cross-chain SETTLE path is the
-- CCTP poller (#5); this is the durable audit/idempotency layer.
create table if not exists inbound_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text,
  payload jsonb,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
alter table inbound_webhook_events enable row level security;
-- Service-role only (the receiver writes via service-role; no user reads).
revoke all on inbound_webhook_events from authenticated, anon;
