import { Firestore } from "firebase-admin/firestore";
import { sendWhatsAppMessage } from "./whatsappService";
import path from "path";
import fs from "fs";

export interface FeedbackRequest {
  id: string;
  salonId: string;
  salonName: string;
  ownerId: string;
  appointmentId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceName?: string;
  staffName?: string;
  googleReviewUrl?: string;
  status: "scheduled" | "sent" | "answered_positive" | "answered_negative" | "cancelled";
  scheduledFor: string; // ISO string (+40 min or immediate for test)
  sentAt?: string;
  channel: "whatsapp" | "sms";
  channelStatus?: string;
  answer?: "positive" | "negative";
  feedbackNotes?: string;
  token: string;
  createdAt: string;
  updatedAt: string;
}

const STORE_PATH = path.join(process.cwd(), ".feedback_shield_store.json");

export function loadStore(): Record<string, FeedbackRequest> {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      return JSON.parse(raw) || {};
    }
  } catch (err) {
    console.warn("[Feedback Shield Store] Error reading local store:", err);
  }
  return {};
}

export function saveStore(store: Record<string, FeedbackRequest>) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Feedback Shield Store] Error saving local store:", err);
  }
}

// List all feedback requests
export function getAllFeedbackRequests(salonId?: string, ownerId?: string): FeedbackRequest[] {
  const store = loadStore();
  let list = Object.values(store);
  if (salonId && salonId !== "all") {
    list = list.filter((item) => item.salonId === salonId);
  }
  if (ownerId) {
    list = list.filter((item) => !item.ownerId || item.ownerId === ownerId);
  }
  return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

// Resolve an alert
export function resolveFeedbackAlert(tokenOrId: string): boolean {
  const store = loadStore();
  for (const k of Object.keys(store)) {
    if (store[k].token === tokenOrId || store[k].id === tokenOrId || k === tokenOrId) {
      store[k].feedbackNotes = store[k].feedbackNotes ? `${store[k].feedbackNotes} [Gestito dal Titolare]` : "[Gestito]";
      store[k].updatedAt = new Date().toISOString();
      saveStore(store);
      return true;
    }
  }
  return false;
}

// Generate unique secure token
export function generateFeedbackToken(): string {
  return "fb_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// 1. Schedule or immediately create a Feedback Shield Request
export async function scheduleFeedbackRequest(
  db: Firestore | null,
  params: {
    salonId: string;
    salonName: string;
    ownerId: string;
    appointmentId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    serviceName?: string;
    staffName?: string;
    googleReviewUrl?: string;
    channel?: "whatsapp" | "sms";
    delayMinutes?: number; // default 40, 0 for immediate test
    baseUrl: string;
  }
) {
  const token = generateFeedbackToken();
  const id = "req_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  const delay = params.delayMinutes !== undefined ? params.delayMinutes : 40;
  
  const scheduledTime = new Date(Date.now() + delay * 60 * 1000).toISOString();
  const channel = params.channel || "whatsapp";

  const feedbackDoc: FeedbackRequest = {
    id,
    salonId: params.salonId,
    salonName: params.salonName,
    ownerId: params.ownerId,
    appointmentId: params.appointmentId,
    customerId: params.customerId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    serviceName: params.serviceName || "Servizio Salone",
    staffName: params.staffName || "Team Salone",
    googleReviewUrl: params.googleReviewUrl || "",
    status: delay === 0 ? "sent" : "scheduled",
    scheduledFor: scheduledTime,
    channel,
    token,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Save to local store
  const store = loadStore();
  store[token] = feedbackDoc;
  saveStore(store);

  // 2. Try persisting to Firestore if available (gracefully catching any permission issues)
  if (db) {
    try {
      await db.collection("feedback_shield_requests").doc(id).set(feedbackDoc);
    } catch (e: any) {
      // Permission or connection issue on Admin SDK; local store handles it
    }
  }

  const feedbackLink = `${params.baseUrl}/?feedback=${token}`;

  // If delay is 0 (test mode) or immediate, dispatch right away
  if (delay === 0) {
    const messageText = composeFeedbackMessage({
      customerName: params.customerName,
      salonName: params.salonName,
      feedbackLink,
    });

    if (channel === "whatsapp") {
      try {
        const sendResult = await sendWhatsAppMessage(params.salonId, params.customerPhone, messageText);
        feedbackDoc.sentAt = new Date().toISOString();
        feedbackDoc.channelStatus = sendResult.success ? (sendResult.simulated ? "simulated" : "sent") : "error";
        feedbackDoc.updatedAt = new Date().toISOString();
        store[token] = feedbackDoc;
        saveStore(store);

        if (db) {
          try {
            await db.collection("feedback_shield_requests").doc(id).update({
              sentAt: feedbackDoc.sentAt,
              channelStatus: feedbackDoc.channelStatus,
              updatedAt: feedbackDoc.updatedAt,
            });
          } catch (e) {
            // Ignore
          }
        }
      } catch (e: any) {
        console.error("[Feedback Shield] WhatsApp dispatch error:", e.message || e);
      }
    } else {
      // SMS Simulated dispatch
      feedbackDoc.sentAt = new Date().toISOString();
      feedbackDoc.channelStatus = "simulated_sms";
      feedbackDoc.updatedAt = new Date().toISOString();
      store[token] = feedbackDoc;
      saveStore(store);
    }
  }

  return {
    success: true,
    id,
    token,
    feedbackLink,
    scheduledFor: scheduledTime,
    status: delay === 0 ? "sent" : "scheduled",
  };
}

// 2. Retrieve feedback request by token
export async function getFeedbackByToken(db: Firestore | null, token: string): Promise<FeedbackRequest | null> {
  const store = loadStore();
  if (store[token]) {
    return store[token];
  }

  if (db) {
    try {
      const snap = await db.collection("feedback_shield_requests").where("token", "==", token).limit(1).get();
      if (!snap.empty) {
        return snap.docs[0].data() as FeedbackRequest;
      }
    } catch (e) {
      // Ignore
    }
  }

  return null;
}

// 3. Submit Customer Feedback response
export async function submitFeedbackAnswer(
  db: Firestore | null,
  token: string,
  answer: "positive" | "negative",
  notes?: string
): Promise<{ success: boolean; data?: FeedbackRequest }> {
  const store = loadStore();
  let item = store[token];
  const isPositive = answer === "positive";

  if (!item) {
    for (const k of Object.keys(store)) {
      if (store[k].token === token || store[k].id === token) {
        item = store[k];
        break;
      }
    }
  }

  if (item) {
    item.status = isPositive ? "answered_positive" : "answered_negative";
    item.answer = answer;
    item.feedbackNotes = notes || "";
    item.updatedAt = new Date().toISOString();
    store[item.token] = item;
    if (item.id) store[item.id] = item;
    saveStore(store);
  }

  if (db && item) {
    try {
      await db.collection("feedback_shield_requests").doc(item.id).set(item, { merge: true });

      if (!isPositive) {
        await db.collection("internal_notifications").add({
          salonId: item.salonId,
          ownerId: item.ownerId,
          type: "negative_feedback_alert",
          title: `⚠️ Alert Filtro Verità: ${item.customerName}`,
          message: `Il cliente ${item.customerName} (${item.customerPhone}) ha indicato un'esperienza non soddisfacente: "${notes || "Nessun dettaglio specificato"}"`,
          customerId: item.customerId,
          appointmentId: item.appointmentId,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      // Ignore admin SDK error
    }
  }

  return { success: true, data: item };
}

// 4. Compose natural message
export function composeFeedbackMessage(params: {
  customerName: string;
  salonName: string;
  feedbackLink: string;
}): string {
  const firstName = params.customerName.split(" ")[0] || "Gentile Cliente";
  return `Ciao ${firstName}! ✨ Grazie per essere stat${firstName.endsWith("a") ? "a" : "o"} da *${params.salonName}* oggi.\n\n` +
    `Per noi la tua opinione è preziosa al 100%. Come è andata la tua esperienza?\n\n` +
    `👉 Clicca qui per dircelo in 2 secondi:\n${params.feedbackLink}\n\n` +
    `A presto! ❤️`;
}

// 5. Process the background scheduled queue (for 40 min timers)
export async function processScheduledFeedbackQueue(db: Firestore | null, baseUrl: string) {
  try {
    const store = loadStore();
    const nowIso = new Date().toISOString();
    let hasChanges = false;

    for (const [token, item] of Object.entries(store)) {
      if (item.status === "scheduled" && item.scheduledFor <= nowIso) {
        const feedbackLink = `${baseUrl}/?feedback=${token}`;
        const messageText = composeFeedbackMessage({
          customerName: item.customerName,
          salonName: item.salonName,
          feedbackLink,
        });

        try {
          if (item.channel === "whatsapp") {
            const res = await sendWhatsAppMessage(item.salonId, item.customerPhone, messageText);
            item.status = "sent";
            item.sentAt = new Date().toISOString();
            item.channelStatus = res.success ? (res.simulated ? "simulated" : "sent") : "error";
            item.updatedAt = new Date().toISOString();
          } else {
            item.status = "sent";
            item.sentAt = new Date().toISOString();
            item.channelStatus = "simulated_sms";
            item.updatedAt = new Date().toISOString();
          }
          hasChanges = true;

          if (db) {
            try {
              await db.collection("feedback_shield_requests").doc(item.id).set(item, { merge: true });
            } catch (e) {
              // Ignore
            }
          }
        } catch (err: any) {
          console.error(`[Feedback Shield Queue] Error sending to ${item.customerPhone}:`, err.message || err);
          item.status = "sent";
          item.channelStatus = "error: " + (err.message || "send_failed");
          item.updatedAt = new Date().toISOString();
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      saveStore(store);
    }
  } catch (error: any) {
    console.error("[Feedback Shield Queue] Processing error:", error.message || error);
  }
}

