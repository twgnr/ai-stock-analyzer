import webpush from "web-push";
import { connectDB } from "./mongodb";
import { PushSubscription } from "./models/PushSubscription";
import type { Types } from "mongoose";

/**
 * VAPID-Setup. Schlüssel werden einmalig vom Admin generiert
 * (`npx web-push generate-vapid-keys`) und als Env-Var hinterlegt:
 *   VAPID_PUBLIC_KEY=<base64url-encoded uncompressed public key>
 *   VAPID_PRIVATE_KEY=<base64url-encoded private key>
 *   VAPID_SUBJECT=mailto:admin@beispiel.de
 *
 * Der Public-Key wird auch dem Frontend ausgeliefert, damit
 * `pushManager.subscribe()` ihn als `applicationServerKey` mitgibt.
 */

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

export function getPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-Link beim Click. Default: Dashboard. */
  url?: string;
  /** Optionaler Tag — gleiche Tags ersetzen sich gegenseitig im OS. */
  tag?: string;
}

/**
 * Sendet einen Push an alle Subscriptions eines Users. Subscriptions, die
 * vom Push-Service als „gone" (404/410) gemeldet werden, werden automatisch
 * aus der DB entfernt — sonst sammelt sich Müll an.
 */
export async function sendPushToUser(
  userId: Types.ObjectId | string,
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  if (!ensureConfigured()) return { sent: 0, removed: 0 };
  await connectDB();
  const subs = await PushSubscription.find({ userId }).lean();
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
          },
          body
        );
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
          removed += 1;
        } else {
          console.error(
            "[push]",
            s.endpoint.slice(0, 60),
            e instanceof Error ? e.message : e
          );
        }
      }
    })
  );
  return { sent, removed };
}
