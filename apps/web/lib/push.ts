/**
 * Web Push client helpers.
 * Flow:
 * 1. User opts in on settings → `subscribePush()`.
 * 2. Browser asks Push API for a PushSubscription via the active service worker.
 * 3. We POST `{ endpoint, p256dh, auth, userAgentHash }` to `/api/v1/push/subscriptions`.
 * 4. Daemon's NotificationWorker fans out on InvoicePaid / CashoutReady / DisputeOpened.
 * In dev (no VAPID key) we no-op gracefully — never throws.
 */
"use client";

export interface PushSupportState {
  supported: boolean;
  permission: NotificationPermission;
}

export function pushSupportState(): PushSupportState {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { supported: false, permission: "default" };
  }
  return { supported: true, permission: Notification.permission };
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Returns the new subscription on success, null when user declined / not supported. */
export async function subscribePush(
  vapidPublicKey: string | undefined,
): Promise<PushSubscription | null> {
  const state = pushSupportState();
  if (!state.supported) return null;
  if (!vapidPublicKey) {
    console.warn("[push] VAPID public key missing — skipping subscribe");
    return null;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // PushManager wants ArrayBuffer / BufferSource — slice off SharedArrayBuffer overlap.
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      .buffer as ArrayBuffer,
  });

  await fetch("/api/v1/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  }).catch(() => undefined);

  return sub;
}

export async function unsubscribePush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  const endpoint = sub.endpoint;
  const ok = await sub.unsubscribe();
  if (ok) {
    await fetch("/api/v1/push/subscriptions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  }
  return ok;
}
