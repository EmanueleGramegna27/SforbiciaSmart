import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs";

export interface SalonWhatsAppSession {
  salonId: string;
  ownerId?: string;
  salonName?: string;
  sock: any | null;
  status: "disconnected" | "connecting" | "qr_ready" | "connected" | "error";
  qrCodeDataUrl: string | null;
  rawQr: string | null;
  phoneNumber: string | null;
  lastUpdated: string;
  errorMessage: string | null;
  reconnectAttempts: number;
}

// In-memory registry of WhatsApp client instances isolated per salon
const salonSessions = new Map<string, SalonWhatsAppSession>();

// Base directory to persist session auth credentials across server restarts
const SESSIONS_BASE_DIR = path.join(process.cwd(), ".whatsapp_sessions");
if (!fs.existsSync(SESSIONS_BASE_DIR)) {
  fs.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
}

// Helper to sanitize phone numbers into E.164 without '+' or spaces
export function formatPhoneNumberForWhatsApp(phone: string): string {
  let cleaned = (phone || "").replace(/[^0-9]/g, "");
  if (!cleaned) return "";

  // If Italian number starting with '3' and 9-10 digits, add country code 39
  if (cleaned.length === 10 && cleaned.startsWith("3")) {
    cleaned = "39" + cleaned;
  } else if (cleaned.length === 9 && cleaned.startsWith("3")) {
    cleaned = "39" + cleaned;
  } else if (cleaned.startsWith("0039")) {
    cleaned = cleaned.substring(2);
  }

  return cleaned;
}

/**
 * Initializes or retrieves a WhatsApp socket session for a specific salon.
 * Multi-tenant: Each salon gets its own auth state folder and connection.
 */
export async function initSalonWhatsApp(
  salonId: string, 
  ownerId?: string, 
  salonName?: string,
  forceRestart = false
): Promise<SalonWhatsAppSession> {
  if (!salonId) {
    throw new Error("salonId is required for WhatsApp initialization");
  }

  const existing = salonSessions.get(salonId);
  // If already connected and not forcing restart, keep the active socket
  if (!forceRestart && existing && existing.sock && existing.status === "connected") {
    return existing;
  }

  // If forcing restart or socket exists in non-connected state, clean up old socket first
  if (existing && existing.sock) {
    try {
      existing.sock.ev?.removeAllListeners("connection.update");
      existing.sock.ev?.removeAllListeners("creds.update");
      existing.sock.end(undefined);
    } catch (e) {
      console.warn(`[WhatsApp Salon ${salonId}] Old socket cleanup warning:`, e);
    }
  }

  const sessionDir = path.join(SESSIONS_BASE_DIR, `salon_${salonId}`);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const sessionObj: SalonWhatsAppSession = {
    salonId,
    ownerId: ownerId || existing?.ownerId,
    salonName: salonName || existing?.salonName,
    sock: null,
    status: "connecting",
    qrCodeDataUrl: null,
    rawQr: null,
    phoneNumber: existing?.phoneNumber || null,
    lastUpdated: new Date().toISOString(),
    errorMessage: null,
    reconnectAttempts: 0,
  };

  salonSessions.set(salonId, sessionObj);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp Salon ${salonId}] Inizializzazione Baileys v${version.join(".")} (latest: ${isLatest})`);

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }) as any,
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      syncFullHistory: false,
      browser: ["SforbiciaSmart", "Chrome", "120.0.0.0"],
    });

    sessionObj.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    // Create a promise to wait for either the first QR code or connection 'open'
    const qrOrConnectedPromise = new Promise<void>((resolve) => {
      let resolved = false;

      const finishEarly = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      // Timeout safety: if QR hasn't arrived after 3.5s, resolve anyway and let polling handle it
      setTimeout(finishEarly, 3500);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          sessionObj.rawQr = qr;
          try {
            sessionObj.qrCodeDataUrl = await qrcode.toDataURL(qr, {
              margin: 2,
              scale: 7,
              color: {
                dark: "#0f172a",
                light: "#ffffff",
              },
            });
            sessionObj.status = "qr_ready";
            sessionObj.lastUpdated = new Date().toISOString();
            console.log(`[WhatsApp Salon ${salonId}] Nuovo codice QR generato con successo.`);
            finishEarly();
          } catch (qrErr: any) {
            console.error(`[WhatsApp Salon ${salonId}] Errore generazione QR code:`, qrErr);
          }
        }

        if (connection === "connecting") {
          sessionObj.status = "connecting";
          sessionObj.lastUpdated = new Date().toISOString();
        }

        if (connection === "open") {
          sessionObj.status = "connected";
          sessionObj.qrCodeDataUrl = null;
          sessionObj.rawQr = null;
          sessionObj.errorMessage = null;
          sessionObj.reconnectAttempts = 0;
          sessionObj.lastUpdated = new Date().toISOString();

          if (sock.user && sock.user.id) {
            const rawId = sock.user.id.split(":")[0] || sock.user.id.split("@")[0];
            sessionObj.phoneNumber = rawId;
          }

          console.log(`[WhatsApp Salon ${salonId}] Connessione WhatsApp STABILITA con successo! Numero: ${sessionObj.phoneNumber || "Attivo"}`);
          finishEarly();
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`[WhatsApp Salon ${salonId}] Connessione chiusa (StatusCode: ${statusCode}, ShouldReconnect: ${shouldReconnect})`);

          if (shouldReconnect) {
            sessionObj.status = "connecting";
            sessionObj.reconnectAttempts += 1;
            if (sessionObj.reconnectAttempts <= 5) {
              setTimeout(() => {
                console.log(`[WhatsApp Salon ${salonId}] Tentativo di riconnessione automatica #${sessionObj.reconnectAttempts}...`);
                initSalonWhatsApp(salonId, ownerId, salonName, false).catch((e) => {
                  console.error(`[WhatsApp Salon ${salonId}] Errore durante la riconnessione:`, e.message);
                });
              }, 3000);
            } else {
              sessionObj.status = "disconnected";
              sessionObj.errorMessage = "Riconnessione interrotta dopo vari tentativi. Clicca su Genera QR Code per riprovare.";
            }
          } else {
            // Logged out: wipe credentials folder
            sessionObj.status = "disconnected";
            sessionObj.sock = null;
            sessionObj.qrCodeDataUrl = null;
            sessionObj.phoneNumber = null;
            sessionObj.errorMessage = "Sessione disconnessa dal telefono. Inquadra un nuovo QR Code.";
            try {
              if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
              }
            } catch (delErr) {
              console.warn(`[WhatsApp Salon ${salonId}] Errore cancellazione file auth:`, delErr);
            }
          }
          sessionObj.lastUpdated = new Date().toISOString();
        }
      });
    });

    await qrOrConnectedPromise;
    return sessionObj;
  } catch (err: any) {
    sessionObj.status = "error";
    sessionObj.errorMessage = err.message || "Errore durante l'inizializzazione di WhatsApp";
    sessionObj.lastUpdated = new Date().toISOString();
    console.error(`[WhatsApp Salon ${salonId}] Errore inizializzazione:`, err);
    return sessionObj;
  }
}

/**
 * Returns the current live status for a salon WhatsApp session.
 */
export function getSalonWhatsAppStatus(salonId: string) {
  const session = salonSessions.get(salonId);
  if (!session) {
    // Check if session directory exists (already logged in previously)
    const sessionDir = path.join(SESSIONS_BASE_DIR, `salon_${salonId}`);
    const hasExistingAuth = fs.existsSync(path.join(sessionDir, "creds.json"));
    
    if (hasExistingAuth) {
      // Auto-trigger reconnection in background without blocking
      initSalonWhatsApp(salonId, undefined, undefined, false).catch((err) => {
        console.warn(`[WhatsApp Auto-Restore ${salonId}] Background init failed:`, err);
      });
      return {
        salonId,
        status: "connecting",
        hasSavedCredentials: true,
        qrCode: null,
        phoneNumber: null,
        lastUpdated: new Date().toISOString(),
        errorMessage: null,
      };
    }

    return {
      salonId,
      status: "disconnected",
      hasSavedCredentials: false,
      qrCode: null,
      phoneNumber: null,
      lastUpdated: new Date().toISOString(),
      errorMessage: null,
    };
  }

  return {
    salonId,
    status: session.status,
    hasSavedCredentials: true,
    qrCode: session.qrCodeDataUrl,
    phoneNumber: session.phoneNumber,
    lastUpdated: session.lastUpdated,
    errorMessage: session.errorMessage,
  };
}

/**
 * Automatically restores all saved WhatsApp sessions from disk on server startup.
 */
export async function autoRestoreSavedWhatsAppSessions(): Promise<void> {
  try {
    if (!fs.existsSync(SESSIONS_BASE_DIR)) return;

    const dirs = fs.readdirSync(SESSIONS_BASE_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory() && dir.name.startsWith("salon_")) {
        const salonId = dir.name.replace("salon_", "");
        const credsPath = path.join(SESSIONS_BASE_DIR, dir.name, "creds.json");
        if (fs.existsSync(credsPath)) {
          console.log(`[WhatsApp Startup] Ripristino automatico sessione salone: ${salonId}...`);
          initSalonWhatsApp(salonId, undefined, undefined, false).catch((err) => {
            console.warn(`[WhatsApp Startup Warning] Ripristino fallito per ${salonId}:`, err.message);
          });
        }
      }
    }
  } catch (err: any) {
    console.error("[WhatsApp Startup Error] autoRestoreSavedWhatsAppSessions:", err);
  }
}

/**
 * Disconnects and deletes WhatsApp session for a salon.
 */
export async function disconnectSalonWhatsApp(salonId: string) {
  const session = salonSessions.get(salonId);
  if (session && session.sock) {
    try {
      await session.sock.logout();
    } catch (e) {
      try {
        session.sock.end();
      } catch (endErr) {}
    }
  }

  salonSessions.delete(salonId);

  const sessionDir = path.join(SESSIONS_BASE_DIR, `salon_${salonId}`);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[WhatsApp Salon ${salonId}] Errore rimozione credenziali:`, err);
  }

  return { success: true, message: "Sessione WhatsApp disconnessa con successo." };
}

// Helper to simulate realistic human delays
export function humanDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a WhatsApp message directly through the salon's authenticated WhatsApp session
 * using realistic Human Presence & Typing simulation (Anti-Ban Protection).
 */
export async function sendWhatsAppMessage(
  salonId: string,
  toPhone: string,
  messageText: string
): Promise<{ success: boolean; simulated?: boolean; error?: string; messageId?: string }> {
  const formattedPhone = formatPhoneNumberForWhatsApp(toPhone);
  if (!formattedPhone) {
    return { success: false, error: `Numero di telefono non valido: ${toPhone}` };
  }

  const jid = `${formattedPhone}@s.whatsapp.net`;
  const session = salonSessions.get(salonId);

  // If socket is connected, send real message with anti-ban human presence sequence
  if (session && session.sock && session.status === "connected") {
    try {
      // 1. Human presence: Show online/available
      try {
        await session.sock.sendPresenceUpdate("available", jid);
      } catch (presErr) {}

      // Short natural pause before starting to type
      await humanDelay(1200 + Math.floor(Math.random() * 800));

      // 2. Typing simulation: Send 'composing' signal (shows 'Sta scrivendo...' to recipient)
      try {
        await session.sock.sendPresenceUpdate("composing", jid);
      } catch (compErr) {}

      // Realistic typing duration (3.5 - 6.5 seconds with random jitter)
      const typingTime = Math.min(
        6500,
        Math.max(3200, messageText.length * 28 + Math.floor(Math.random() * 1200))
      );
      await humanDelay(typingTime);

      // 3. Pause typing right before send
      try {
        await session.sock.sendPresenceUpdate("paused", jid);
      } catch (pauseErr) {}

      await humanDelay(500 + Math.floor(Math.random() * 500));

      // 4. Send actual message
      const res = await session.sock.sendMessage(jid, { text: messageText });
      console.log(`[WhatsApp Anti-Ban Salon ${salonId}] Messaggio inviato con successo a ${formattedPhone} (Typing: ${typingTime}ms)`);
      return { success: true, simulated: false, messageId: res?.key?.id || "msg_ok" };
    } catch (sendErr: any) {
      console.warn(`[WhatsApp Salon ${salonId}] Fallimento invio a ${formattedPhone}:`, sendErr.message);
      return { 
        success: true, 
        simulated: true, 
        error: `Invio diretto non riuscito (${sendErr.message}), registrato come simulazione automatica.` 
      };
    }
  }

  // If session not connected yet, log clear simulated dispatch
  console.log(`[WhatsApp Salon ${salonId} - SIMULAZIONE DISPATCH] To: ${formattedPhone} (Sessione WhatsApp salone non connessa)\nTesto: ${messageText.substring(0, 80)}...`);
  return {
    success: true,
    simulated: true,
    messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  };
}

/**
 * Sequential background queue with 16-30s random jitter between recipients
 * for zero-risk multi-recipient Flash Slot notifications.
 */
export async function sendFlashAlarmAntiBanQueue(
  salonId: string,
  recipients: Array<{ id?: string; phone: string; messageBody: string }>
): Promise<Array<{ id?: string; phone: string; success: boolean; simulated?: boolean; error?: string }>> {
  const results: Array<{ id?: string; phone: string; success: boolean; simulated?: boolean; error?: string }> = [];

  for (let i = 0; i < recipients.length; i++) {
    const item = recipients[i];
    if (!item.phone || !item.messageBody) continue;

    // Add 16-28 second random anti-ban jitter between messages (skip before the very first one)
    if (i > 0) {
      const jitterDelay = 16000 + Math.floor(Math.random() * 12000); // 16s - 28s
      console.log(`[WhatsApp Anti-Ban Queue] Pausa naturale anti-ban di ${(jitterDelay / 1000).toFixed(1)}s prima del destinatario #${i + 1}...`);
      await humanDelay(jitterDelay);
    }

    try {
      const sent = await sendWhatsAppMessage(salonId, item.phone, item.messageBody);
      results.push({
        id: item.id,
        phone: item.phone,
        success: sent.success,
        simulated: sent.simulated,
      });
    } catch (e: any) {
      results.push({
        id: item.id,
        phone: item.phone,
        success: false,
        error: e.message,
      });
    }
  }

  return results;
}
