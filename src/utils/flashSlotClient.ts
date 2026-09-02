import { 
  Firestore, 
  doc, 
  setDoc, 
  getDoc, 
  runTransaction, 
  collection, 
  getDocs, 
  query, 
  where 
} from "firebase/firestore";

/**
 * Helper to identify if an appointment was booked via Flash Slot / Magic Link
 */
export function isFlashSlotAppointment(appt?: {
  isFlashSlot?: boolean;
  source?: string;
  flashSlotId?: string;
  serviceName?: string;
  notes?: string;
  price?: number;
} | null): boolean {
  if (!appt) return false;
  return Boolean(
    appt.isFlashSlot ||
    appt.source === "flash_slot" ||
    Boolean(appt.flashSlotId) ||
    (appt.notes && (appt.notes.includes("Flash Slot") || appt.notes.includes("Magic Link"))) ||
    (appt.serviceName && appt.serviceName.toLowerCase().includes("trattamento a scelta"))
  );
}

export interface TargetSlotInputClient {
  salonId: string;
  salonName: string;
  salonPhone?: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration?: number;
  serviceId?: string;
  serviceName?: string;
  staffName?: string;
  originalPrice?: number;
  discountPrice?: number;
  discountPercent?: number;
  customMessage?: string;
  expirationHours?: number;
  excludedCustomerId?: string;
}

export interface CustomerEligibilityResultClient {
  totalCustomers: number;
  eligibleCount: number;
  ineligibleRecentCount: number;
  ineligibleFutureBookingCount: number;
  ineligibleNoPhoneCount: number;
  eligibleCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    lastVisitDate?: string;
    daysSinceLastVisit?: number;
  }>;
}

/**
 * Calculates customer eligibility for a specific salon's Flash Slot
 * strictly isolating data per salonId and ownerId.
 */
export async function calculateFlashSlotEligibilityClient(
  db: Firestore,
  salonId: string,
  ownerId: string,
  targetDate: string,
  excludedCustomerId?: string
): Promise<CustomerEligibilityResultClient> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().slice(0, 10);

  // 1. Query customers of this salon
  const custQuery = query(
    collection(db, "customers"),
    where("ownerId", "==", ownerId),
    where("salonId", "==", salonId)
  );
  const customersSnap = await getDocs(custQuery);
  const customers = customersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  // 2. Query appointments of this salon
  const apptQuery = query(
    collection(db, "appointments"),
    where("ownerId", "==", ownerId),
    where("salonId", "==", salonId)
  );
  const appointmentsSnap = await getDocs(apptQuery);
  const appointments = appointmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  // 3. Map customer appointment history
  const customerHistoryMap = new Map<
    string,
    {
      hasFutureBooking: boolean;
      lastVisitDate: string | null;
      appointmentsCount: number;
    }
  >();

  appointments.forEach((appt) => {
    if (!appt.customerId) return;
    if (appt.status === "cancelled") return;

    const existing = customerHistoryMap.get(appt.customerId) || {
      hasFutureBooking: false,
      lastVisitDate: null,
      appointmentsCount: 0,
    };

    existing.appointmentsCount += 1;

    // Check future appointments (from today onwards)
    if (appt.date && appt.date >= todayStr) {
      existing.hasFutureBooking = true;
    }

    // Check past appointments
    if (appt.date && appt.date < todayStr) {
      if (!existing.lastVisitDate || appt.date > existing.lastVisitDate) {
        existing.lastVisitDate = appt.date;
      }
    }

    customerHistoryMap.set(appt.customerId, existing);
  });

  // 4. Apply strict filtering rules
  let eligibleCount = 0;
  let ineligibleRecentCount = 0;
  let ineligibleFutureBookingCount = 0;
  let ineligibleNoPhoneCount = 0;
  const eligibleCustomers: CustomerEligibilityResultClient["eligibleCustomers"] = [];

  customers.forEach((cust) => {
    // Rule 0: Exclude explicitly the customer whose appointment was cancelled/freed
    if (excludedCustomerId && (cust.id === excludedCustomerId || cust.id === String(excludedCustomerId).trim())) {
      return;
    }

    const phone = cust.phone ? String(cust.phone).trim() : "";
    if (!phone || phone.length < 6) {
      ineligibleNoPhoneCount++;
      return;
    }

    const history = customerHistoryMap.get(cust.id);

    // Rule 1: Exclude customers with upcoming appointment
    if (history && history.hasFutureBooking) {
      ineligibleFutureBookingCount++;
      return;
    }

    // Rule 2: Exclude customers with recent visit in last 14 days
    if (history && history.lastVisitDate && history.lastVisitDate >= fourteenDaysAgoStr) {
      ineligibleRecentCount++;
      return;
    }

    // ELIGIBLE
    let daysSinceLastVisit: number | undefined = undefined;
    if (history && history.lastVisitDate) {
      const diffMs = new Date().getTime() - new Date(history.lastVisitDate).getTime();
      daysSinceLastVisit = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    eligibleCount++;
    eligibleCustomers.push({
      id: cust.id,
      name: cust.name || "Cliente",
      phone: cust.phone,
      lastVisitDate: history?.lastVisitDate || undefined,
      daysSinceLastVisit,
    });
  });

  // Prioritize dormant clients (who haven't visited for the longest time)
  eligibleCustomers.sort((a, b) => (b.daysSinceLastVisit ?? 999) - (a.daysSinceLastVisit ?? 999));

  return {
    totalCustomers: customers.length,
    eligibleCount,
    ineligibleRecentCount,
    ineligibleFutureBookingCount,
    ineligibleNoPhoneCount,
    eligibleCustomers,
  };
}

// SpinTax message variations for Anti-Ban Fingerprint prevention
export function generateAntiBanMessage(
  recipientIndex: number,
  firstName: string,
  salonName: string,
  date: string,
  time: string,
  serviceName: string,
  staffName: string,
  originalPrice: number,
  discountPrice: number,
  discountPercent: number,
  magicLink: string,
  customTemplate?: string
): string {
  if (customTemplate) {
    let msg = customTemplate
      .replace(/\[Nome\]/g, firstName)
      .replace(/\[Link\]/g, magicLink)
      .replace(/\[Data\]/g, date)
      .replace(/\[Orario\]/g, time)
      .replace(/\[Servizio\]/g, serviceName)
      .replace(/\[Prezzo\]/g, `€${discountPrice}`);
    if (!msg.includes(magicLink)) {
      msg += `\n\n👉 *Prenota subito il posto qui:*\n${magicLink}`;
    }
    return msg;
  }

  const greetings = [
    `Ciao *${firstName}*, data la tua affidabilità e fedeltà come cliente di *${salonName}*, ti abbiamo riservato l'accesso prioritario a uno slot che si è appena liberato.`,
    `Ciao *${firstName}*, per ringraziarti della tua continuità e fiducia in *${salonName}*, ti avvisiamo in anteprima che abbiamo una poltrona disponibile.`,
    `Ciao *${firstName}*, sei tra i nostri clienti più fidati di *${salonName}* e volevamo offrirti la priorità su un appuntamento liberatosi all'ultimo momento.`,
    `Ciao *${firstName}*, data la tua speciale fedeltà a *${salonName}*, hai la precedenza su uno slot orario che si è appena reso disponibile.`,
    `Ciao *${firstName}*, un caro saluto da *${salonName}*! Visto il tuo rapporto di fiducia con noi, ti riserviamo l'accesso esclusivo a questo spazio libero.`,
  ];

  const urgencies = [
    "⚠️ *Disponibilità immediata:* Questo avviso è stato inviato in anteprima esclusiva a pochissimi clienti selezionati: *il posto verrà assegnato in tempo reale al primo che confermerà tramite il link*.",
    "⚠️ *Posto unico in tempo reale:* Abbiamo informato solo una cerchia ristretta di clienti selezionati: *la poltrona andrà al primo che completerà la conferma da questo link*.",
    "⚠️ *Priorità a tempo:* Per massima trasparenza, lo slot è condiviso solo con pochissimi contatti fidati e *verrà bloccato all'istante dal primo click confermato*.",
    "⚠️ *Slot last-minute:* L'accesso è riservato a te e ad altri pochissimi clienti selezionati: *chi conferma per primo tramite il link si aggiudica la poltrona*.",
    "⚠️ *Conferma istantanea:* Avviso inviato in anteprima: *il primo cliente che preme sul link bloccherà definitivamente l'appuntamento in agenda*.",
  ];

  const ctas = [
    "👉 *Blocca la tua poltrona con 1 click qui:*",
    "👉 *Fai tap qui per confermare il tuo posto riservato:*",
    "👉 *Riserva subito il tuo trattamento in tempo reale:*",
    "👉 *Accedi al link per bloccare l'orario prioritario:*",
    "👉 *Conferma la tua presenza con 1 click qui:*",
  ];

  const closings = [
    "_Grazie di cuore per la tua continua fiducia e a presto in salone! ✨_",
    "_Ti ringraziamo per la tua preziosa fiducia e ti aspettiamo con piacere! ✂️✨_",
    "_Un grande ringraziamento per la tua fedeltà. A prestissimo in salone! ✨_",
    "_Grazie per sceglierci sempre con fiducia, a presto! 💇‍♀️✨_",
    "_Grazie di cuore per la tua affidabilità. Un caro saluto da tutto lo staff! ✨_",
  ];

  const g = greetings[recipientIndex % greetings.length];
  const u = urgencies[recipientIndex % urgencies.length];
  const c = ctas[recipientIndex % ctas.length];
  const cl = closings[recipientIndex % closings.length];

  const priceLine = (discountPercent && discountPercent > 0)
    ? (originalPrice && originalPrice > 0 && discountPrice && discountPrice > 0)
      ? `💰 *Tariffa Esclusiva:* ~€${originalPrice.toFixed(0)}~ ➔ *€${discountPrice.toFixed(0)}* (-${discountPercent}%)`
      : `💰 *Vantaggio Riservato:* Sconto speciale del *${discountPercent}%* sul trattamento!`
    : `💰 *Tariffa:* Standard di listino`;

  const serviceLine = (serviceName && serviceName !== "Trattamento a scelta")
    ? `✂️ *Trattamento:* ${serviceName} con ${staffName || "Staff"}`
    : `✂️ *Operatore:* ${staffName || "Staff del Salone"}`;

  return `${g}\n\n📅 *Data:* ${date}\n⏰ *Orario:* ${time}\n${serviceLine}\n${priceLine}\n\n${u}\n\n${c}\n${magicLink}\n\n${cl}`;
}

/**
 * Dispatches Flash Slot alarm to all eligible customers (capped to max 5 for anti-ban safety)
 */
export async function launchFlashSlotAlarmClient(
  db: Firestore,
  input: TargetSlotInputClient,
  baseUrl: string
): Promise<{
  success: boolean;
  flashSlotId: string;
  totalNotified: number;
  recipients: any[];
  error?: string;
}> {
  const eligibility = await calculateFlashSlotEligibilityClient(
    db,
    input.salonId,
    input.ownerId,
    input.date,
    input.excludedCustomerId
  );

  if (eligibility.eligibleCustomers.length === 0) {
    return {
      success: false,
      flashSlotId: "",
      totalNotified: 0,
      recipients: [],
      error: "Nessun cliente idoneo trovato per questa sede (tutti i clienti hanno visite recenti o prenotazioni future).",
    };
  }

  // Cap at top 5 most eligible clients for Anti-Ban Protection
  const targetEligible = eligibility.eligibleCustomers.slice(0, 5);

  const discountPercent = input.discountPercent !== undefined ? input.discountPercent : 20;
  const discountPrice =
    input.discountPrice !== undefined
      ? input.discountPrice
      : Math.round(input.originalPrice * (1 - discountPercent / 100));

  const flashSlotId = `fs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const expirationHours = input.expirationHours || 4;
  const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

  const recipientsPayload = targetEligible.map((cust, idx) => {
    const magicLink = `${baseUrl.replace(/\/$/, "")}/?flash=${flashSlotId}&cid=${cust.id}`;
    const firstName = cust.name ? cust.name.split(" ")[0] : "Cliente";

    const messageBody = generateAntiBanMessage(
      idx,
      firstName,
      input.salonName,
      input.date,
      input.time,
      input.serviceName,
      input.staffName,
      input.originalPrice,
      discountPrice,
      discountPercent,
      magicLink,
      input.customMessage
    );

    // Prepare direct Click-to-Chat WhatsApp URL for 100% 0-risk manual assist option
    const cleanPhone = (cust.phone || "").replace(/[^0-9]/g, "");
    const fullPhone = cleanPhone.length === 10 && cleanPhone.startsWith("3") ? `39${cleanPhone}` : cleanPhone;
    const directWhatsAppUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(messageBody)}`;

    return {
      id: cust.id,
      name: cust.name,
      phone: cust.phone,
      lastVisitDate: cust.lastVisitDate || null,
      messageBody,
      directWhatsAppUrl,
      magicLink,
    };
  });

  // 1. Save Flash Slot document to Firestore using authenticated client
  const flashSlotDocRef = doc(collection(db, "flash_slots"), flashSlotId);
  const flashSlotData = {
    id: flashSlotId,
    salonId: input.salonId,
    salonName: input.salonName,
    salonPhone: input.salonPhone || "",
    ownerId: input.ownerId,
    date: input.date,
    time: input.time,
    duration: input.duration || 45,
    serviceId: input.serviceId || "",
    serviceName: input.serviceName,
    staffName: input.staffName || "Qualsiasi",
    originalPrice: input.originalPrice,
    discountPrice,
    discountPercent,
    status: "open",
    claimedBy: null,
    expiresAt,
    createdAt: new Date().toISOString(),
    totalNotified: recipientsPayload.length,
    recipients: recipientsPayload.map((r) => ({
      customerId: r.id,
      customerName: r.name,
      phone: r.phone,
      lastVisitDate: r.lastVisitDate,
      directWhatsAppUrl: r.directWhatsAppUrl,
      magicLink: r.magicLink,
      status: "queued",
      sentAt: new Date().toISOString(),
    })),
    customMessage: input.customMessage || null,
  };

  await setDoc(flashSlotDocRef, flashSlotData);

  // 2. Dispatch messages via WhatsApp server endpoint (uses anti-ban slow queue with typing simulation)
  fetch("/api/whatsapp/send-flash-alarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      salonId: input.salonId,
      recipients: recipientsPayload,
    }),
  }).catch((e) => console.warn("[Flash Slot WhatsApp Dispatch Warn]:", e));

  return {
    success: true,
    flashSlotId,
    totalNotified: recipientsPayload.length,
    recipients: flashSlotData.recipients,
  };
}

/**
 * Claim Flash Slot atomically using Firestore transaction
 */
export async function claimFlashSlotClient(
  db: Firestore,
  slotId: string,
  claimingUser: {
    customerId: string;
    customerName: string;
    customerPhone: string;
  }
): Promise<{
  success: boolean;
  appointmentId?: string;
  error?: "already_claimed" | "expired" | "not_found" | "internal_error";
  claimedBy?: any;
  slotDetails?: any;
}> {
  const slotRef = doc(collection(db, "flash_slots"), slotId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const slotDoc = await transaction.get(slotRef);

      if (!slotDoc.exists()) {
        return { success: false, error: "not_found" as const };
      }

      const slotData = slotDoc.data()!;

      // 1. Check if already claimed
      if (slotData.status === "claimed" || slotData.claimedBy) {
        return {
          success: false,
          error: "already_claimed" as const,
          claimedBy: slotData.claimedBy,
          slotDetails: slotData,
        };
      }

      // 2. Check if expired
      const now = new Date().toISOString();
      if (slotData.expiresAt && slotData.expiresAt < now) {
        return {
          success: false,
          error: "expired" as const,
          slotDetails: slotData,
        };
      }

      // 3. Mark slot as claimed
      const claimedAt = new Date().toISOString();
      const newApptRef = doc(collection(db, "appointments"));
      const appointmentId = newApptRef.id;

      const claimedByInfo = {
        customerId: claimingUser.customerId || "guest",
        customerName: claimingUser.customerName || "Cliente WhatsApp",
        customerPhone: claimingUser.customerPhone || "",
        claimedAt,
        appointmentId,
      };

      transaction.update(slotRef, {
        status: "claimed",
        claimedBy: claimedByInfo,
        updatedAt: claimedAt,
      });

      // 4. Create the new appointment in appointments collection
      const newAppointmentData = {
        id: appointmentId,
        customerId: claimingUser.customerId || "guest",
        customerName: claimingUser.customerName || "Cliente WhatsApp",
        customerPhone: claimingUser.customerPhone || "",
        serviceId: slotData.serviceId || "",
        serviceName: (slotData.serviceName && slotData.serviceName !== "Servizio Flash") ? slotData.serviceName : "Trattamento a scelta",
        salonId: slotData.salonId,
        staffName: slotData.staffName || "Qualsiasi",
        date: slotData.date,
        time: slotData.time,
        duration: slotData.duration || 45,
        price: 0,
        status: "confirmed",
        ownerId: slotData.ownerId,
        isFlashSlot: true,
        source: "flash_slot",
        flashSlotId: slotId,
        notes: `⚡ Prenotato tramite Magic Link WhatsApp (Flash Slot #${slotId})`,
        createdAt: claimedAt,
      };

      transaction.set(newApptRef, newAppointmentData);

      return {
        success: true,
        appointmentId,
        slotDetails: { ...slotData, claimedBy: claimedByInfo },
      };
    });

    // Notify server to send WhatsApp confirmation if winner provided phone
    if (result.success && claimingUser.customerPhone && result.slotDetails) {
      const details = result.slotDetails as any;
      fetch("/api/flash-slot/notify-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          appointmentId: result.appointmentId,
          salonId: details.salonId,
          salonName: details.salonName,
          customerName: claimingUser.customerName,
          customerPhone: claimingUser.customerPhone,
          date: details.date,
          time: details.time,
          serviceName: details.serviceName,
          discountPrice: details.discountPrice,
        }),
      }).catch((e) => console.warn("[WA Confirm Post Err]:", e));
    }

    return result;
  } catch (txErr: any) {
    console.error("[Flash Slot Transaction Error]:", txErr);
    return { success: false, error: "internal_error", claimedBy: null };
  }
}
