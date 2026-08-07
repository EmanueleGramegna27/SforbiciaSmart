import { onUserCreated } from "firebase-functions/v2/identity";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";

admin.initializeApp();

/**
 * Cloud Function activated on user creation in Firebase Auth.
 * Automatically sends a polished, responsive welcome email to the newly registered user.
 * Reads SMTP credentials securely via Firebase secrets.
 */
export const sendWelcomeEmail = onUserCreated({
  secrets: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"],
}, async (event) => {
  const user = event.data;
  if (!user) {
    console.error("No user data found in the trigger event.");
    return;
  }

  const { email, displayName, uid, metadata, providerData } = user;

  if (!email) {
    console.log(`User ${uid} registered without an email address. Skipping email sending.`);
    return;
  }

  // Safe fallback for user's display name
  const name = displayName || email.split("@")[0] || "Nuovo Utente";

  // Formatta la data di creazione in italiano
  const creationTime = metadata.creationTime 
    ? new Date(metadata.creationTime).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : new Date().toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });

  // Rilevamento sicuro del provider di autenticazione principale
  let providerName = "Email e Password";
  if (providerData && providerData.length > 0) {
    const primaryProvider = providerData[0].providerId;
    if (primaryProvider === "google.com") {
      providerName = "Google Account";
    } else if (primaryProvider === "facebook.com") {
      providerName = "Facebook";
    } else if (primaryProvider === "apple.com") {
      providerName = "Apple Sign-In";
    }
  }

  // Estrazione sicura dei secrets SMTP dall'ambiente Firebase
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error("Missing SMTP configuration. Please configure SMTP_HOST, SMTP_USER, and SMTP_PASS secrets in Firebase.");
    return;
  }

  // Configurazione del trasportatore Nodemailer
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true per porta SMTPS 465, false per altre (es. 587)
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  // Template Email HTML Responsivo e Professionale
  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Benvenuto su SforbiciaSmart</title>
    <style>
      body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        background-color: #f8fafc;
        margin: 0;
        padding: 0;
        -webkit-font-smoothing: antialiased;
      }
      .wrapper {
        width: 100%;
        table-layout: fixed;
        background-color: #f8fafc;
        padding-bottom: 40px;
        padding-top: 40px;
      }
      .container {
        max-width: 600px;
        background-color: #ffffff;
        margin: 0 auto;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        border: 1px solid #e2e8f0;
      }
      .header {
        background-color: #1a3a8f;
        padding: 40px 30px;
        text-align: center;
      }
      .header h1 {
        color: #ffffff;
        font-size: 26px;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.5px;
      }
      .header p {
        color: #93c5fd;
        font-size: 14px;
        margin: 8px 0 0 0;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        font-weight: 600;
      }
      .content {
        padding: 40px 30px;
        color: #334155;
      }
      .greeting {
        font-size: 20px;
        font-weight: 700;
        margin-top: 0;
        margin-bottom: 16px;
        color: #0f172a;
      }
      .lead {
        font-size: 16px;
        line-height: 1.6;
        margin-bottom: 24px;
        color: #475569;
      }
      .card {
        background-color: #f1f5f9;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 28px;
        border: 1px solid #e2e8f0;
      }
      .card-title {
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        color: #475569;
        margin-top: 0;
        margin-bottom: 16px;
        letter-spacing: 0.5px;
      }
      .info-row {
        margin-bottom: 12px;
        font-size: 14px;
      }
      .info-row:last-child {
        margin-bottom: 0;
      }
      .info-label {
        font-weight: 600;
        color: #64748b;
      }
      .info-value {
        font-weight: 700;
        color: #0f172a;
        float: right;
      }
      .btn-container {
        text-align: center;
        margin-top: 32px;
        margin-bottom: 32px;
      }
      .btn {
        background-color: #1a3a8f;
        color: #ffffff !important;
        text-decoration: none;
        padding: 14px 32px;
        font-size: 15px;
        font-weight: 700;
        border-radius: 8px;
        display: inline-block;
        box-shadow: 0 4px 6px rgba(26, 58, 143, 0.15);
      }
      .btn:hover {
        background-color: #11265e;
      }
      .divider {
        height: 1px;
        background-color: #e2e8f0;
        margin: 32px 0;
      }
      .footer {
        text-align: center;
        padding: 0 30px 40px 30px;
        font-size: 12px;
        color: #94a3b8;
        line-height: 1.5;
      }
      .footer a {
        color: #1a3a8f;
        text-decoration: none;
        font-weight: 600;
      }
      .clearfix::after {
        content: "";
        clear: both;
        display: table;
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <!-- Intestazione -->
        <div class="header">
          <h1>Benvenuto su SforbiciaSmart</h1>
          <p>La Rivoluzione per il Tuo Salone</p>
        </div>
        
        <!-- Contenuto Principale -->
        <div class="content">
          <p class="greeting">Ciao ${name},</p>
          <p class="lead">
            Grazie per esserti registrato su <strong>SforbiciaSmart</strong>! Il tuo account è stato creato con successo ed è ora attivo. Siamo entusiasti di darti il benvenuto e di aiutarti ad automatizzare, ottimizzare e far crescere il tuo salone.
          </p>
          
          <!-- Box Riassuntivo Account -->
          <div class="card">
            <h3 class="card-title">Riepilogo Registrazione</h3>
            
            <div class="info-row clearfix">
              <span class="info-label">ID Utente:</span>
              <span class="info-value" style="font-family: monospace; font-size: 12px;">${uid}</span>
            </div>
            
            <div class="info-row clearfix">
              <span class="info-label">Email di Accesso:</span>
              <span class="info-value">${email}</span>
            </div>
            
            <div class="info-row clearfix">
              <span class="info-label">Tipo di Accesso:</span>
              <span class="info-value">${providerName}</span>
            </div>
            
            <div class="info-row clearfix">
              <span class="info-label">Data Registrazione:</span>
              <span class="info-value">${creationTime}</span>
            </div>
          </div>
          
          <p class="lead">
            Ora puoi accedere subito alla tua dashboard personale per configurare i tuoi collaboratori, inserire i listini servizi e iniziare a gestire le tue prenotazioni digitali.
          </p>
          
          <div class="btn-container">
            <a href="https://ais-pre-p3schwzwekb3zcajuq3has-107401571867.europe-west2.run.app" class="btn" target="_blank">Accedi alla Dashboard</a>
          </div>
          
          <div class="divider"></div>
          
          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
            Se non hai avviato tu questa procedura di registrazione, contatta immediatamente il nostro dipartimento di sicurezza. Per qualsiasi domanda o necessità tecnica, il nostro team è sempre pronto ad aiutarti.
          </p>
        </div>
        
        <!-- Piè di Pagina -->
        <div class="footer">
          <p>
            &copy; ${new Date().getFullYear()} SforbiciaSmart. Tutti i diritti riservati.<br>
            Questa è un'email automatica del sistema gestionale. Si prega di non rispondere direttamente.
          </p>
          <p>
            Hai bisogno di supporto? <a href="mailto:supporto@salonflow.it">Contatta l'Assistenza</a>
          </p>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  const mailOptions = {
    from: `"SforbiciaSmart Support" <${smtpUser}>`,
    to: email,
    subject: "Benvenuto su SforbiciaSmart! Registrazione completata",
    html: emailHtml,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Success] Welcome email sent successfully to ${email}. MessageId: ${info.messageId}`);
  } catch (error) {
    console.error(`[Error] Failed to send welcome email to ${email}:`, error);
  }
});

/**
 * Cloud Function to securely handle Paddle Billing v2 webhooks.
 * Validates the HMAC signature and updates subscription status in Firestore.
 */
export const paddleWebhook = onRequest({
  secrets: ["PADDLE_WEBHOOK_SECRET"],
}, async (req, res) => {
  const signature = req.headers["paddle-signature"] as string;
  const rawBody = req.rawBody ? req.rawBody.toString() : "";

  console.log("[Paddle Webhook Cloud Function] Received event from Paddle...");

  const secret = process.env.PADDLE_WEBHOOK_SECRET || "";

  if (secret) {
    if (!signature) {
      console.warn("[Paddle Webhook] Webhook request received without 'paddle-signature' header.");
      res.status(401).send("Firma mancante.");
      return;
    }
    const isVerified = verifyPaddleSignature(rawBody, signature, secret);
    if (!isVerified) {
      console.error("[Paddle Webhook] Signature verification failed!");
      res.status(401).send("Firma non valida.");
      return;
    }
    console.log("[Paddle Webhook] Signature verified successfully.");
  } else {
    console.warn("[Paddle Webhook] PADDLE_WEBHOOK_SECRET is not configured. Skipping signature verification (unsafe for production).");
  }

  try {
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      console.error("[Paddle Webhook] Failed to parse request raw body as JSON:", err);
      res.status(400).send("JSON non valido.");
      return;
    }

    const eventType = payload.event_type;
    const data = payload.data;

    console.log(`[Paddle Webhook] Event type: ${eventType}`);

    if (!data) {
      res.status(200).send("Ricevuto webhook senza dati.");
      return;
    }

    const subscriptionId = data.id;
    const customerId = data.customer_id;
    const status = data.status; // 'active', 'trialing', 'past_due', 'paused', 'canceled'
    const customData = data.custom_data || {};
    const ownerId = customData.ownerId;
    const planKey = customData.planKey;

    const databaseId = "ai-studio-f76dbc15-f4c4-49cd-b80a-d935bbe6042d";
    const db = getFirestore(undefined, databaseId);

    if (eventType === "subscription.activated" || eventType === "subscription.created" || eventType === "subscription.updated") {
      if (!ownerId || !planKey) {
        console.warn("[Paddle Webhook] Subscription event received but ownerId or planKey is missing in custom_data:", customData);
        res.status(200).send("Evento ignorato: custom_data non completi.");
        return;
      }

      const docRef = db.collection("business_settings").doc(ownerId);
      const docSnap = await docRef.get();
      const existingData = docSnap.exists ? docSnap.data() : {};

      const updatedPayload = {
        ...existingData,
        ownerId,
        userPlan: planKey,
        subscriptionStatus: status === "active" || status === "trialing" ? "active" : status,
        paddleCustomerId: customerId,
        paddleSubscriptionId: subscriptionId,
        updatedAt: new Date().toISOString(),
        // Replace/Delete Stripe fields
        stripeCustomerId: FieldValue.delete(),
        stripeSubscriptionId: FieldValue.delete(),
      };

      await docRef.set(updatedPayload, { merge: true });
      console.log(`[Paddle Webhook] Subscription updated to ${status} (plan: ${planKey}) for ownerId: ${ownerId}`);
    } 
    else if (eventType === "subscription.canceled") {
      if (ownerId) {
        const docRef = db.collection("business_settings").doc(ownerId);
        const docSnap = await docRef.get();
        const existingData = docSnap.exists ? docSnap.data() : {};

        const updatedPayload = {
          ...existingData,
          subscriptionStatus: "cancelled",
          userPlan: "none",
          updatedAt: new Date().toISOString(),
          // Ensure cleanup of Stripe fields
          stripeCustomerId: FieldValue.delete(),
          stripeSubscriptionId: FieldValue.delete(),
        };

        await docRef.set(updatedPayload, { merge: true });
        console.log(`[Paddle Webhook] Subscription cancelled in Firestore for ownerId: ${ownerId}`);
      } else {
        console.warn("[Paddle Webhook] subscription.canceled event without ownerId in custom_data.");
      }
    }

    res.status(200).send("Evento elaborato con successo.");
  } catch (err: any) {
    console.error("[Paddle Webhook Error] Critical error processing webhook:", err.message || err);
    res.status(500).send(`Errore interno: ${err.message}`);
  }
});

/**
 * Manually validates the Paddle Billing signature.
 */
function verifyPaddleSignature(rawBody: string, signatureHeader: string, secretKey: string): boolean {
  if (!signatureHeader || !secretKey) return false;

  const parts = signatureHeader.split(";");
  let ts = "";
  let h1 = "";

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "ts") ts = value;
    if (key === "h1") h1 = value;
  }

  if (!ts || !h1) return false;

  const payload = `${ts}:${rawBody}`;
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, "utf-8"),
      Buffer.from(h1, "utf-8")
    );
  } catch (err) {
    return computedHash === h1;
  }
}
