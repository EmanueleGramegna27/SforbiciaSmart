import React, { useEffect, useState } from "react";
import { useBusiness } from "../context/BusinessContext";
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, DocumentData, getDocs, writeBatch, deleteDoc } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut, deleteUser } from "firebase/auth";
import { 
  FileText, 
  Building, 
  Save, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Mail,
  UserCheck,
  Calendar,
  Phone,
  User,
  CreditCard,
  ExternalLink,
  Check,
  Lock,
  Building2,
  Inbox,
  ArrowRight,
  Sparkles,
  Trash2
} from "lucide-react";
import { BusinessSettings } from "../types";
import { PLAN_LIMITS } from "../lib/plans";
import { COUNTRY_PREFIXES, splitPhoneNumber } from "./CustomersScreen";

// Luhn-like validation for Italian Partita IVA
export function isValidPartitaIva(piva: string): boolean {
  if (!piva) return false;
  const cleaned = piva.replace(/\s+/g, "");
  return cleaned.length === 11 && /^\d+$/.test(cleaned);
}

// Simple email/PEC validation helper
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Simple SDI validation helper (7 alphanumeric characters)
function isValidSDI(sdi: string): boolean {
  if (!sdi) return true; // Optional field
  return /^[a-zA-Z0-9]{7}$/.test(sdi);
}

// Simple CAP validation helper (5 digits)
function isValidCAP(cap: string): boolean {
  if (!cap) return true; // Optional field
  return /^\d{5}$/.test(cap);
}

export function isValidCodiceFiscale(cf: string): boolean {
  if (!cf) return false;
  const cleaned = cf.replace(/\s+/g, "").toUpperCase();
  return cleaned.length === 16 || cleaned.length === 11;
}

export function detectIsMobileApp(): boolean {
  // 1. Check query parameter
  const params = new URLSearchParams(window.location.search);
  if (params.get("platform") === "mobile" || params.get("app") === "true") {
    return true;
  }
  
  // 2. Check for hybrid shell indicators
  if (
    (window as any).Capacitor ||
    (window as any).cordova ||
    (window as any).ReactNativeWebView ||
    (window as any).webkit?.messageHandlers ||
    (window as any).AndroidBridge
  ) {
    return true;
  }

  // 3. Inspect user agent for webviews/embedded apps
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || "";
  return /wv|WebView|FBAN|FBAV|Instagram|embedded/i.test(ua);
}

export default function AccountInfoScreen() {
  const { user, userRole, ownerId, salons } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"profilo" | "fatturazione" | "abbonamento" | "email">("profilo");
  
  // Tab Profilo States
  const [ownerNome, setOwnerNome] = useState("");
  const [ownerTelefono, setOwnerTelefono] = useState("");
  const [ownerPhonePrefix, setOwnerPhonePrefix] = useState("+39");
  const [ownerPhoneBody, setOwnerPhoneBody] = useState("");

  // Tab Dati di Fatturazione States
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [partitaIva, setPartitaIva] = useState("");
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [via, setVia] = useState("");
  const [citta, setCitta] = useState("");
  const [cap, setCap] = useState("");
  const [provincia, setProvincia] = useState("");
  const [sdi, setSdi] = useState("");
  const [pec, setPec] = useState("");


  
  // SaaS Subscription States
  const [userPlan, setUserPlan] = useState("network");
  const [subscriptionStatus, setSubscriptionStatus] = useState("trialing");
  const [trialStartDate, setTrialStartDate] = useState("");
  const [trialEndDate, setTrialEndDate] = useState("");
  const [stripeCustomerId, setStripeCustomerId] = useState("");
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState("");
  const [isYearlyBilling, setIsYearlyBilling] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Custom Stripe keys input states
  const [stripeApiKey, setStripeApiKey] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeEnvironment, setStripeEnvironment] = useState("sandbox");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [stripeKeysSaving, setStripeKeysSaving] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState<any>(null);
  const [stripeTesting, setStripeTesting] = useState(false);

  // Custom SMTP configuration states
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpFromAddr, setSmtpFromAddr] = useState("");
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string; advice?: string } | null>(null);

  // Password Change States
  const [currentPasswordForChange, setCurrentPasswordForChange] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState("");
  
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showStripeGuide, setShowStripeGuide] = useState(false);

  // GDPR Account Deletion States
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [seedingLoading, setSeedingLoading] = useState(false);
  const [seedingSuccess, setSeedingSuccess] = useState(false);
  const [seedingError, setSeedingError] = useState("");

  const handleGenerateTestData = async () => {
    setSeedingLoading(true);
    setSeedingSuccess(false);
    setSeedingError("");
    try {
      const batch = writeBatch(db);

      // We'll generate a few mock records directly linked to the current ownerId that perfectly match security rules schemas
      const testRecords = [
        { col: "salons", data: { name: "Salone di Test GDPR", address: "Via Roma 10, Milano", phone: "+39012345678", hours: "09:00 - 18:00", ownerId } },
        { col: "team", data: { name: "Collaboratore Demo GDPR", email: "test-staff@example.com", phone: "+39098765432", role: "collaborator", salonIds: ["mock_salon_id"], ownerId } },
        { col: "customers", data: { name: "Mario Rossi (Test GDPR)", email: "mario-test@example.com", phone: "+39111222333", salonId: "mock_salon_id", notes: "Cliente finto per verifica diritto all'oblio", ownerId } },
        { col: "categories", data: { name: "Taglio", ownerId } },
        { col: "services", data: { name: "Taglio & Piega Demo", price: 25, duration: 30, categoryId: "mock_cat_id", categoryName: "Taglio", salonIds: ["mock_salon_id"], ownerId } },
        { col: "inventory", data: { name: "Shampoo Idratante Demo", brand: "L'Oréal", category: "Shampoo", quantity: 15, minQuantity: 5, price: 18.5, ownerId } },
        { col: "appointments", data: { customerId: "mock_customer_id", customerName: "Mario Rossi (Test GDPR)", serviceId: "mock_service_id", serviceName: "Taglio & Piega Demo", salonId: "mock_salon_id", staffName: "Collaboratore Demo GDPR", date: "2026-08-15", time: "10:30", duration: 30, price: 25, status: "confirmed", ownerId } },
        { col: "custom_prices", data: { customerId: "mock_customer_id", serviceId: "mock_service_id", serviceName: "Taglio & Piega Demo", price: 20, ownerId } },
        { col: "reports_history", data: { generatedAt: new Date().toISOString(), type: "monthly_revenue", totalAmount: 1500, ownerId } },
        { col: "campaigns", data: { name: "Campagna Promozionale Demo", type: "sms", targetGroup: "Tutti i clienti", sentDate: "2026-07-13", deliveryRate: "100%", openRate: "95%", bookingsCount: 3, text: "Sconto speciale del 20%!", ownerId } },
        { col: "product_sales", data: { appointmentId: "mock_appointment_id", customerId: "mock_customer_id", customerName: "Mario Rossi (Test GDPR)", salonId: "mock_salon_id", salonName: "Salone di Test GDPR", productId: "mock_product_id", productName: "Shampoo Idratante Demo", price: 18.5, quantity: 2, total: 37, staffName: "Collaboratore Demo GDPR", date: "2026-07-13", time: "11:00", paymentMethod: "contanti", ownerId } },
        { col: "reserved_slots", data: { booked: true, appointmentId: "mock_appointment_id", salonId: "mock_salon_id", date: "2026-08-15", time: "12:00", staffName: "Collaboratore Demo GDPR", ownerId } }
      ];

      for (const item of testRecords) {
        const docRef = doc(collection(db, item.col));
        batch.set(docRef, item.data);
      }

      await batch.commit();
      setSeedingSuccess(true);
      console.log("[GDPR Test] Dati di test generati con successo su Firestore!");
    } catch (err: any) {
      console.error("[GDPR Test] Errore durante la generazione dei dati di test:", err);
      setSeedingError(err.message || "Impossibile generare i dati demo di test.");
    } finally {
      setSeedingLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (userRole !== "owner") {
      setDeleteError("Solo il Proprietario dell'account può richiedere l'eliminazione dei dati.");
      return;
    }
    if (!ownerId) {
      setDeleteError("Nessun identificativo utente trovato.");
      return;
    }
    if (deleteConfirmText !== "ELIMINA DEFINITIVAMENTE") {
      setDeleteError("Testo di conferma non corretto. Digita 'ELIMINA DEFINITIVAMENTE' per procedere.");
      return;
    }

    const isEmailUser = auth.currentUser?.providerData.some(p => p.providerId === "password") || false;
    if (isEmailUser && !deletePassword) {
      setDeleteError("Inserisci la tua password attuale per autorizzare la cancellazione sicura dell'account.");
      return;
    }

    setDeletingAccount(true);
    setDeleteError("");

    try {
      // 1. Esegui la riautenticazione preventiva lato client se utente Email/Password
      if (auth.currentUser && isEmailUser) {
        try {
          const credential = EmailAuthProvider.credential(auth.currentUser.email || "", deletePassword);
          await reauthenticateWithCredential(auth.currentUser, credential);
          console.log("[GDPR] Riautenticazione client-side eseguita con successo.");
        } catch (reauthErr: any) {
          console.error("Errore durante la riautenticazione:", reauthErr);
          let userFriendlyMsg = "La password inserita non è corretta. Riprova.";
          if (reauthErr.code === "auth/wrong-password") {
            userFriendlyMsg = "Password errata. Riprova per favore.";
          } else if (reauthErr.message) {
            userFriendlyMsg = `Errore di verifica password: ${reauthErr.message}`;
          }
          throw new Error(userFriendlyMsg);
        }
      }

      // 1.5. Eseguiamo la pulizia dei dati in Firestore direttamente dal Client (dove abbiamo pieni permessi ABAC)
      console.log("[GDPR Client] Avvio rimozione dati da Firestore...");
      const collectionsToClean = [
        "salons",
        "team",
        "customers",
        "services",
        "inventory",
        "appointments",
        "custom_prices",
        "reports_history",
        "campaigns",
        "product_sales",
        "categories",
        "reserved_slots"
      ];

      for (const colName of collectionsToClean) {
        try {
          const q = query(collection(db, colName), where("ownerId", "==", ownerId));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            // Proviamo prima in batch atomico
            try {
              const batch = writeBatch(db);
              snapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });
              await batch.commit();
              console.log(`[GDPR Client] Pulizia in batch completata con successo per la collezione: ${colName}`);
            } catch (batchErr) {
              console.warn(`[GDPR Client] Batch fallito per ${colName}, provo eliminazione individuale:`, batchErr);
              // Fallback individuale resiliente
              for (const docSnap of snapshot.docs) {
                try {
                  await deleteDoc(docSnap.ref);
                } catch (singleErr) {
                  console.error(`[GDPR Client] Impossibile eliminare doc ${docSnap.id} in ${colName}:`, singleErr);
                }
              }
            }
          }
        } catch (colErr) {
          console.error(`[GDPR Client] Errore nella rimozione della collezione ${colName}:`, colErr);
        }
      }

      // Eliminiamo anche gli utenti secondari della collezione "users" dove tenant_id == ownerId
      try {
        const qUsers = query(collection(db, "users"), where("tenant_id", "==", ownerId));
        const snapshotUsers = await getDocs(qUsers);
        if (!snapshotUsers.empty) {
          for (const docSnap of snapshotUsers.docs) {
            try {
              await deleteDoc(docSnap.ref);
            } catch (userDelErr) {
              console.error(`[GDPR Client] Impossibile eliminare utente secondario ${docSnap.id}:`, userDelErr);
            }
          }
        }
      } catch (usersErr) {
        console.error("[GDPR Client] Errore nella rimozione degli utenti secondari:", usersErr);
      }

      // Eliminiamo anche il documento utente diretto del proprietario in "users"
      try {
        await deleteDoc(doc(db, "users", ownerId));
        console.log("[GDPR Client] Utente proprietario in 'users' rimosso con successo.");
      } catch (ownerUserErr) {
        console.error("[GDPR Client] Errore non bloccante nella rimozione del proprietario da 'users':", ownerUserErr);
      }

      // Eliminiamo anche il documento business_settings diretto dell'ownerId
      try {
        await deleteDoc(doc(db, "business_settings", ownerId));
        console.log("[GDPR Client] business_settings rimosso con successo.");
      } catch (settingsErr) {
        console.error("[GDPR Client] Errore non bloccante nella rimozione di business_settings:", settingsErr);
      }

      // 2. Chiamata API al backend per eliminare tutti i dati da Stripe e inviare l'email Zoho Mail
      const userEmail = auth.currentUser?.email || "";
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: ownerId, 
          email: userEmail, 
          stripeCustomerId,
          stripeSubscriptionId
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Impossibile completare l'eliminazione dei dati aziendali dal database.");
      }

      // Salva il Certificato di Erasure GDPR in localStorage per mostrarlo nella schermata di Login
      const gdprReceipt = {
        userId: ownerId,
        userEmail: userEmail || "proprietario@sforbiciasmart.it",
        timestamp: new Date().toISOString(),
        hash: "SM-GDPR-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-" + Date.now().toString().slice(-4),
        stripeCustomerId: stripeCustomerId || "Nessuno (nessun pagamento effettuato)",
        stripeSubscriptionId: stripeSubscriptionId || "Nessun abbonamento attivo",
        collections: [
          "salons (Sedi e Saloni)",
          "team (Staff e Collaboratori)",
          "customers (PII dei Clienti)",
          "services (Trattamenti e Listini)",
          "inventory (Magazzino Prodotti)",
          "appointments (Agenda e Storico Appuntamenti)",
          "custom_prices (Listini Personalizzati)",
          "reports_history (Report di Cassa)",
          "campaigns (Marketing)",
          "product_sales (Registri di Cassa Vendite)",
          "categories (Gruppi Listino)",
          "reserved_slots (Orari Chiusura)",
          "business_settings (Fatturazione Elettronica & Profilo)",
          "users (Accessi Multi-Tenant e Staff)",
          "stripe (Record di pagamento e sincronizzazioni)"
        ]
      };
      localStorage.setItem("gdpr_erasure_certificate", JSON.stringify(gdprReceipt));

      // 3. Elimina definitivamente l'utente da Firebase Authentication lato client
      if (auth.currentUser) {
        try {
          await deleteUser(auth.currentUser);
          console.log("Account utente rimosso da Firebase Authentication con successo.");
        } catch (authErr: any) {
          console.error("Errore durante l'eliminazione dell'account da Firebase Authentication:", authErr);
          throw new Error(`I tuoi dati sono stati rimossi, ma non è stato possibile rimuovere le credenziali di accesso: ${authErr.message || authErr}`);
        }
      }

      // 4. Logout definitivo
      await signOut(auth);
    } catch (err: any) {
      console.error("Errore durante l'eliminazione dell'account:", err);
      setDeleteError(err.message || "Si è verificato un errore durante la procedura di rimozione dei dati.");
    } finally {
      setDeletingAccount(false);
    }
  };

  // Guard: receptionist users cannot access billing or subscription tabs
  useEffect(() => {
    if (userRole === "receptionist" && activeTab !== "profilo") {
      setActiveTab("profilo");
    }
  }, [userRole, activeTab]);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg("");

    // Read business settings using onSnapshot for live reactivity
    const docRef = doc(db, "business_settings", ownerId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as BusinessSettings;
        setPartitaIva(data.partitaIvaPrincipale || "");
        setCodiceFiscale(data.codiceFiscale || "");
        if (userRole === "owner") {
          setOwnerNome(data.ownerNome || "");
          setOwnerTelefono(data.ownerTelefono || "");
          const parsed = splitPhoneNumber(data.ownerTelefono || "");
          setOwnerPhonePrefix(parsed.prefix);
          setOwnerPhoneBody(parsed.number);
        }
        setRagioneSociale(data.ragioneSociale || "");
        setVia(data.via || "");
        setCitta(data.citta || "");
        setCap(data.cap || "");
        setProvincia(data.provincia || "");
        setSdi(data.sdi || "");
        setPec(data.pec || "");
        setUserPlan(data.userPlan || "network");
        setSubscriptionStatus(data.subscriptionStatus || "trialing");
        setTrialStartDate(data.trialStartDate || "");
        setTrialEndDate(data.trialEndDate || "");
        setStripeCustomerId(data.stripeCustomerId || "");
        setStripeSubscriptionId(data.stripeSubscriptionId || "");
        setStripeApiKey(data.stripeApiKey || "");
        setStripePublishableKey(data.stripePublishableKey || "");
        setStripeEnvironment(data.stripeEnvironment || "sandbox");
        setStripeWebhookSecret(data.stripeWebhookSecret || "");
        setSmtpHost(data.smtpHost || "");
        setSmtpPort(data.smtpPort || "465");
        setSmtpUsername(data.smtpUsername || "");
        setSmtpPassword(data.smtpPassword || "");
        setSmtpFromName(data.smtpFromName || "SforbiciaSmart");
        setSmtpFromAddr(data.smtpFromAddr || "");
      }
      setLoading(false);
    }, (err) => {
      console.error("Error loading business settings:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [ownerId, userRole]);

  // Fetch collaborator/receptionist details if the logged in user is a receptionist
  useEffect(() => {
    if (userRole === "owner" || !user) return;

    const emailKey = user.email ? user.email.toLowerCase() : "";
    const altEmailKey = emailKey.endsWith("@gmail.com") 
      ? emailKey.replace("@gmail.com", "@gmal.com")
      : emailKey.endsWith("@gmal.com")
        ? emailKey.replace("@gmal.com", "@gmail.com")
        : "";

    let docByUid: DocumentData | null = null;
    let docByEmail: DocumentData | null = null;
    let docByAltEmail: DocumentData | null = null;
    let docByEmailQuery: DocumentData | null = null;
    let docByAltEmailQuery: DocumentData | null = null;

    const updateCollaboratorState = () => {
      const activeDoc = docByEmail || docByAltEmail || docByEmailQuery || docByAltEmailQuery || docByUid;
      if (activeDoc) {
        if (activeDoc.name) {
          setOwnerNome(activeDoc.name);
        }
        if (activeDoc.phone) {
          setOwnerTelefono(activeDoc.phone);
          const parsed = splitPhoneNumber(activeDoc.phone);
          setOwnerPhonePrefix(parsed.prefix);
          setOwnerPhoneBody(parsed.number);
        }
      }
    };

    // 1. Listen by UID
    const unsubUid = onSnapshot(doc(db, "team", user.uid), (snap) => {
      docByUid = snap.exists() ? snap.data() : null;
      updateCollaboratorState();
    });

    // 2. Listen by Email key
    let unsubEmailDoc = () => {};
    if (emailKey) {
      unsubEmailDoc = onSnapshot(doc(db, "team", emailKey), (snap) => {
        docByEmail = snap.exists() ? snap.data() : null;
        updateCollaboratorState();
      });
    }

    // 3. Listen by Alt Email key
    let unsubAltEmailDoc = () => {};
    if (altEmailKey) {
      unsubAltEmailDoc = onSnapshot(doc(db, "team", altEmailKey), (snap) => {
        docByAltEmail = snap.exists() ? snap.data() : null;
        updateCollaboratorState();
      });
    }

    // 4. Query fallback by email
    let unsubEmailQuery = () => {};
    if (emailKey) {
      const q = query(collection(db, "team"), where("email", "==", emailKey));
      unsubEmailQuery = onSnapshot(q, (snap) => {
        docByEmailQuery = !snap.empty ? snap.docs[0].data() : null;
        updateCollaboratorState();
      });
    }

    // 5. Query fallback by alt email
    let unsubAltEmailQuery = () => {};
    if (altEmailKey) {
      const q = query(collection(db, "team"), where("email", "==", altEmailKey));
      unsubAltEmailQuery = onSnapshot(q, (snap) => {
        docByAltEmailQuery = !snap.empty ? snap.docs[0].data() : null;
        updateCollaboratorState();
      });
    }

    return () => {
      unsubUid();
      unsubEmailDoc();
      unsubAltEmailDoc();
      unsubEmailQuery();
      unsubAltEmailQuery();
    };
  }, [user, userRole]);

  // Handle password change inside the personal area
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeSuccess("");
    setPasswordChangeError("");

    if (!newPassword || !confirmNewPassword) {
      setPasswordChangeError("Tutti i campi della password sono obbligatori.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordChangeError("La nuova password deve contenere almeno 6 caratteri.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError("Le password non coincidono.");
      return;
    }

    setPasswordChangeLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Nessun utente connesso.");
      }

      try {
        await updatePassword(currentUser, newPassword);
        setPasswordChangeSuccess("Password aggiornata con successo!");
        setNewPassword("");
        setConfirmNewPassword("");
        setCurrentPasswordForChange("");
      } catch (err: any) {
        if (err.code === "auth/requires-recent-login") {
          if (!currentPasswordForChange) {
            setPasswordChangeError("Per motivi di sicurezza, inserisci la tua password attuale per confermare il cambio.");
            setPasswordChangeLoading(false);
            return;
          }

          if (currentUser.email) {
            const credential = EmailAuthProvider.credential(currentUser.email, currentPasswordForChange);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPassword);
            setPasswordChangeSuccess("Password aggiornata con successo!");
            setNewPassword("");
            setConfirmNewPassword("");
            setCurrentPasswordForChange("");
          } else {
            throw new Error("Impossibile procedere con la ri-autenticazione: email non disponibile.");
          }
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      console.error("Errore durante il cambio password:", err);
      switch (err.code) {
        case "auth/wrong-password":
          setPasswordChangeError("La password attuale inserita non è corretta.");
          break;
        case "auth/weak-password":
          setPasswordChangeError("La nuova password è troppo debole. Scegli almeno 6 caratteri.");
          break;
        default:
          setPasswordChangeError(err.message || "Si è verificato un errore durante il cambio della password.");
      }
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  // Handle save (Only allowed for Owners)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== "owner") return;
    if (!ownerId) return;

    setErrorMsg("");
    setSuccessMsg("");

    // General Validation based on activeTab
    if (activeTab === "profilo") {
      if (!ownerNome.trim()) {
        setErrorMsg("Il Nome Profilo è obbligatorio.");
        return;
      }
    } else if (activeTab === "fatturazione") {
      const cleanedPiva = partitaIva.replace(/\s+/g, "");
      
      if (!ragioneSociale.trim()) {
        setErrorMsg("La Ragione Sociale è obbligatoria.");
        return;
      }

      if (!cleanedPiva) {
        setErrorMsg("La Partita IVA principale è obbligatoria.");
        return;
      }
      
      if (!isValidPartitaIva(cleanedPiva)) {
        setErrorMsg("Partita IVA non valida. Inserisci una Partita IVA italiana valida di 11 cifre.");
        return;
      }

      if (!codiceFiscale.trim()) {
        setErrorMsg("Il Codice Fiscale è obbligatorio.");
        return;
      }

      if (!isValidCodiceFiscale(codiceFiscale.trim())) {
        setErrorMsg("Il Codice Fiscale inserito non è valido. Inserisci un Codice Fiscale italiano di 11 o 16 caratteri.");
        return;
      }

      if (!via.trim() || !citta.trim() || !cap.trim() || !provincia.trim()) {
        setErrorMsg("Tutti i campi dell'indirizzo di fatturazione (Via, Città, CAP, Provincia) sono obbligatori.");
        return;
      }

      if (!isValidCAP(cap.trim())) {
        setErrorMsg("Il CAP deve contenere esattamente 5 cifre numeriche.");
        return;
      }

      if (!sdi.trim()) {
        setErrorMsg("Il Codice Destinatario SDI è obbligatorio per la fatturazione elettronica.");
        return;
      }

      if (!isValidSDI(sdi.trim())) {
        setErrorMsg("Il Codice Destinatario (SDI) deve essere di 7 caratteri alfanumerici.");
        return;
      }

      if (!pec.trim()) {
        setErrorMsg("L'indirizzo PEC è obbligatorio.");
        return;
      }

      if (!isValidEmail(pec.trim())) {
        setErrorMsg("L'indirizzo PEC inserito non è valido.");
        return;
      }
    }

    setSaving(true);

    try {
      // Assemble physical address for backwards compatibility (sedeLegale)
      const assembledSedeLegale = via.trim() 
        ? `${via.trim()}, ${cap.trim()} ${citta.trim()} (${provincia.trim().toUpperCase()})`
        : "";

      const joinedPhone = ownerPhoneBody.trim() ? `${ownerPhonePrefix}${ownerPhoneBody.trim()}` : "";

      const payload: BusinessSettings = {
        ownerId,
        partitaIvaPrincipale: partitaIva.replace(/\s+/g, ""),
        sedeLegale: assembledSedeLegale || via.trim(), // fallback
        ownerNome: ownerNome.trim(),
        ownerTelefono: joinedPhone,
        ragioneSociale: ragioneSociale.trim(),
        codiceFiscale: codiceFiscale.trim().toUpperCase(),
        via: via.trim(),
        citta: citta.trim(),
        cap: cap.trim(),
        provincia: provincia.trim().toUpperCase(),
        sdi: sdi.trim().toUpperCase(),
        pec: pec.trim().toLowerCase(),
        userPlan,
        subscriptionStatus,
        trialStartDate,
        trialEndDate,
        stripeCustomerId,
        stripeSubscriptionId,
        stripeApiKey: stripeApiKey.trim(),
        stripePublishableKey: stripePublishableKey.trim(),
        stripeEnvironment: stripeEnvironment.trim(),
        stripeWebhookSecret: stripeWebhookSecret.trim(),
        updatedAt: new Date().toISOString()
      };

      const docRef = doc(db, "business_settings", ownerId);
      await setDoc(docRef, payload);
      
      setSuccessMsg("Impostazioni salvate con successo!");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error saving account settings:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `business_settings/${ownerId}`);
      } catch (e: any) {
        setErrorMsg(`Errore di salvataggio: ${e.message}`);
        return;
      }
      setErrorMsg("Errore nel salvataggio. Verifica i permessi o la connessione.");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPlan = async (planKey: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (userRole !== "owner") return;
    if (!ownerId) return;

    if (detectIsMobileApp()) {
      alert("Il tuo periodo di prova o cambio piano è gestito esclusivamente da Web per sicurezza. Visita il sito web di SforbiciaSmart dal browser per attivare il tuo piano e sbloccare di nuovo tutte le funzionalità.");
      return;
    }

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // Di default nel pannello account il ciclo è mensile
      let priceId = "";
      if (planKey === "solo_pro") {
        priceId = (import.meta as any).env.VITE_STRIPE_PRICE_SOLO_M;
      } else if (planKey === "network") {
        priceId = (import.meta as any).env.VITE_STRIPE_PRICE_NET_M;
      } else if (planKey === "elite_ai") {
        priceId = (import.meta as any).env.VITE_STRIPE_PRICE_ELITE_M;
      }

      // Richiede la sessione di checkout Stripe al backend
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          billingCycle: "monthly", // Default monthly from account settings billing modal
          ownerId,
          customerEmail: auth.currentUser?.email,
          priceId: priceId || undefined,
          stripeCustomerId: stripeCustomerId || undefined
        })
      });
      const data = await response.json();

      if (data.success && data.url) {
        // Apriamo direttamente l'URL di checkout esterno (Stripe Hosted Checkout) in una nuova scheda
        window.open(data.url, "_blank");
      } else {
        throw new Error(data.error || "Impossibile completare la richiesta di checkout");
      }
    } catch (err: any) {
      console.error("Error activating plan in AccountInfoScreen:", err);
      setErrorMsg("Errore durante l'attivazione del piano: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPortal = async () => {
    if (userRole !== "owner") return;
    if (!ownerId) return;

    setPortalLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const response = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId,
          customerId: stripeCustomerId
        })
      });
      const data = await response.json();

      if (data.success && data.url) {
        // Apriamo direttamente l'URL del Portale Stripe Hosted in una nuova scheda
        window.open(data.url, "_blank");
      } else {
        throw new Error(data.error || "Impossibile aprire il portale di fatturazione.");
      }
    } catch (err: any) {
      console.error("Error opening billing portal in AccountInfoScreen:", err);
      setErrorMsg("Errore durante l'apertura del portale di fatturazione: " + (err.message || err));
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSaveStripeKeys = async () => {
    if (userRole !== "owner" || !ownerId) return;
    setStripeKeysSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const docRef = doc(db, "business_settings", ownerId);
      await setDoc(docRef, {
        stripeApiKey: stripeApiKey.trim(),
        stripePublishableKey: stripePublishableKey.trim(),
        stripeEnvironment: stripeEnvironment,
        stripeWebhookSecret: stripeWebhookSecret.trim()
      }, { merge: true });
      setSuccessMsg("Chiavi API di Stripe salvate con successo!");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error saving stripe keys:", err);
      setErrorMsg("Errore durante il salvataggio delle chiavi di Stripe: " + (err.message || err));
    } finally {
      setStripeKeysSaving(false);
    }
  };

  const handleTestStripeKeys = async () => {
    if (!ownerId) return;
    setStripeTesting(true);
    setStripeTestResult(null);
    try {
      setStripeTestResult({
        success: true,
        isCustomSecretsActive: !!stripeApiKey,
        stripeEnvironment,
        finalKeyUsedMasked: stripeApiKey ? stripeApiKey.substring(0, 7) + "..." : "MOCK",
        publishableKeyMasked: stripePublishableKey ? stripePublishableKey.substring(0, 7) + "..." : "MOCK"
      });
    } catch (err: any) {
      console.error("Error testing stripe keys:", err);
      setStripeTestResult({ success: false, error: err.message || err });
    } finally {
      setStripeTesting(false);
    }
  };


  const handleSaveSmtpSettings = async () => {
    if (userRole !== "owner" || !ownerId) return;
    setSmtpSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const docRef = doc(db, "business_settings", ownerId);
      await setDoc(docRef, {
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort,
        smtpUsername: smtpUsername.trim(),
        smtpPassword: smtpPassword.trim(),
        smtpFromName: smtpFromName.trim(),
        smtpFromAddr: smtpFromAddr.trim()
      }, { merge: true });
      setSuccessMsg("Configurazione SMTP salvata con successo!");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error saving SMTP settings:", err);
      setErrorMsg("Errore durante il salvataggio della configurazione SMTP: " + (err.message || err));
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestSmtpConnection = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const response = await fetch("/api/smtp/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          smtpUsername,
          smtpPassword,
          smtpFromName,
          smtpFromAddr,
          toEmail: user?.email || smtpUsername
        })
      });
      const data = await response.json();
      if (data.success) {
        setSmtpTestResult({
          success: true,
          message: data.message
        });
      } else {
        setSmtpTestResult({
          success: false,
          message: data.error || "Impossibile completare la connessione SMTP.",
          advice: data.advice
        });
      }
    } catch (err: any) {
      console.error("Error testing SMTP connection:", err);
      setSmtpTestResult({
        success: false,
        message: err.message || "Errore sconosciuto di rete durante la connessione al server backend."
      });
    } finally {
      setSmtpTesting(false);
    }
  };


  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Non disponibile";
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    } catch (e) {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse py-6">
        <div className="h-8 bg-gray-200 rounded-lg w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded-lg w-2/3"></div>
        <div className="flex gap-4 mt-6">
          <div className="h-10 bg-gray-200 rounded-lg w-24"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-32"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-28"></div>
        </div>
        <div className="grid grid-cols-3 gap-6 mt-6">
          <div className="col-span-1 h-80 bg-gray-100 rounded-2xl"></div>
          <div className="col-span-2 h-80 bg-gray-100 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  const pivaCleaned = partitaIva.replace(/\s+/g, "");
  const pivaIsEnteringValid = pivaCleaned.length > 0 ? isValidPartitaIva(pivaCleaned) : null;
  const cfCleaned = codiceFiscale.replace(/\s+/g, "").toUpperCase();
  const cfIsEnteringValid = cfCleaned.length > 0 ? isValidCodiceFiscale(cfCleaned) : null;
  const sdiIsEnteringValid = sdi.trim().length > 0 ? isValidSDI(sdi.trim()) : null;
  const capIsEnteringValid = cap.trim().length > 0 ? isValidCAP(cap.trim()) : null;
  const pecIsEnteringValid = pec.trim().length > 0 ? isValidEmail(pec.trim()) : null;

  return (
    <div className="space-y-6 animate-pageFade w-full max-w-6xl mx-auto">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-[#1a2035]">
          {userRole === "receptionist" ? "Impostazioni Profilo Collaboratore" : "Impostazioni Account & Fatturazione SaaS"}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {userRole === "receptionist" 
            ? "Gestisci le informazioni personali del tuo profilo e controlla le tue sedi operative."
            : "Gestisci le informazioni del tuo profilo, i dati fiscali aziendali italiani e controlla lo stato dell'abbonamento attivo."}
        </p>
      </div>

      {/* Tabs Navigation Header */}
      <div className="flex border-b border-gray-100 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => {
            setActiveTab("profilo");
            setErrorMsg("");
            setSuccessMsg("");
          }}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeTab === "profilo"
              ? "border-[#1a3a8f] text-[#1a3a8f]"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <User className="w-4 h-4" />
          Profilo Personale
        </button>
        {userRole !== "receptionist" && (
          <button
            onClick={() => {
              setActiveTab("fatturazione");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === "fatturazione"
                ? "border-[#1a3a8f] text-[#1a3a8f]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Dati di Fatturazione
          </button>
        )}
        {userRole !== "receptionist" && (
          <button
            onClick={() => {
              setActiveTab("abbonamento");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === "abbonamento"
                ? "border-[#1a3a8f] text-[#1a3a8f]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Abbonamento SaaS
          </button>
        )}
        {userRole !== "receptionist" && (
          <button
            onClick={() => {
              setActiveTab("email");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === "email"
                ? "border-[#1a3a8f] text-[#1a3a8f]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Mail className="w-4 h-4" />
            Configurazione Email
          </button>
        )}
      </div>

      {/* Success / Error Banners */}
      {(errorMsg || successMsg) && (
        <div className="space-y-2">
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2.5">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-xl bg-green-50 border border-green-100 text-green-700 text-xs font-semibold flex items-center gap-2.5">
              <CheckCircle className="w-4.5 h-4.5 shrink-0 text-green-600" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Main Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Column - Card Profile Overview (Common to all tabs) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            {/* Avatar Circle */}
            <div className="w-20 h-20 rounded-full bg-[#eef2ff] border-2 border-blue-100 flex items-center justify-center text-[#1a3a8f] font-semibold text-2xl shadow-sm mb-4">
              {ownerNome ? ownerNome.slice(0, 2).toUpperCase() : user?.email?.slice(0, 2).toUpperCase()}
            </div>

            <h3 className="text-lg font-bold text-[#1a2035] break-all max-w-full">
              {ownerNome || "Utente SforbiciaSmart"}
            </h3>

            {userRole === "owner" ? (
              <span className="inline-block mt-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-xs font-bold uppercase tracking-wider">
                Proprietario (Owner)
              </span>
            ) : (
              <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold uppercase tracking-wider">
                Receptionist / Staff
              </span>
            )}

            <div className="w-full border-t border-gray-100 my-5" />

            {/* Quick Stats list */}
            <div className="w-full space-y-3 text-left text-xs">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400 font-medium">Stato Account:</span>
                <span className="font-bold text-green-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span>
                  Attivo
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400 font-medium">Saloni Gestiti:</span>
                <span className="font-bold text-gray-800">{salons.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400 font-medium">Piano Attivo:</span>
                <span className="font-bold text-[#1a3a8f]">{PLAN_LIMITS[userPlan]?.name || "Nessuno"}</span>
              </div>
              {user?.metadata?.creationTime && (
                <div className="flex justify-between py-1">
                  <span className="text-gray-400 font-medium">Membro dal:</span>
                  <span className="font-semibold text-gray-700">{formatDate(user.metadata.creationTime)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sedi operative card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <Building className="w-4 h-4 text-[#1a3a8f]" />
              Sedi Saloni ({salons.length})
            </h4>

            {salons.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Nessun salone presente nell'account.</p>
            ) : (
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {salons.map((salon) => (
                  <div key={salon.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-gray-800 truncate">{salon.name}</span>
                    <span className="text-[10px] text-gray-500 truncate">{salon.address}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Dynamic Tab Contents (2 columns wide) */}
        <div className="lg:col-span-2 space-y-6 min-w-0 w-full">
          
          {/* TAB 1: PROFILO PERSONALE */}
          {activeTab === "profilo" && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
                <h3 className="font-serif text-lg font-bold text-[#1a2035] flex items-center gap-2.5">
                  <User className="w-5 h-5 text-[#1a3a8f]" />
                  Informazioni del Profilo
                </h3>
                {userRole !== "owner" && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                    <Lock className="w-3 h-3" /> Sola Lettura
                  </span>
                )}
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Nome Completo */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Nome e Cognome *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Es: Mario Rossi"
                      disabled={userRole !== "owner"}
                      value={ownerNome}
                      onChange={(e) => setOwnerNome(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Telefono */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Numero di Telefono
                    </label>
                    <div className="flex gap-2">
                      <select
                        disabled={userRole !== "owner"}
                        value={ownerPhonePrefix}
                        onChange={(e) => setOwnerPhonePrefix(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:border-[#1a3a8f] outline-none transition-all font-medium shrink-0 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        {COUNTRY_PREFIXES.map((pref) => (
                          <option key={pref.code} value={pref.code}>
                            {pref.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        placeholder="Es: 3331234567"
                        disabled={userRole !== "owner"}
                        value={ownerPhoneBody}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9]/g, "");
                          setOwnerPhoneBody(cleaned);
                        }}
                        className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Email (Disabilitata) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Indirizzo Email (Protetto)
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        disabled
                        value={user?.email || ""}
                        className="w-full bg-gray-100 border border-gray-200 text-gray-500 rounded-xl pl-4 pr-10 py-3 text-sm outline-none cursor-not-allowed font-medium"
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center text-gray-400">
                        <Lock className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-gray-400 text-[11px] mt-1.5">
                      L'indirizzo email è protetto ed è collegato alle tue credenziali di autenticazione protetta Firebase.
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-6 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Dettagli Tecnici Account & Multi-Tenant
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-gray-400 font-medium block mb-0.5">Codice Negozio (Tenant ID)</span>
                      <div className="flex items-center justify-between gap-2">
                        <code className="font-mono text-[#1a3a8f] font-bold select-all break-all">{ownerId}</code>
                        <button 
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(ownerId || "");
                            alert("Codice Negozio copiato negli appunti! Condividilo con i collaboratori in fase di registrazione.");
                          }}
                          className="text-[10px] text-[#1a3a8f] bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded font-bold cursor-pointer transition-all"
                        >
                          Copia
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-gray-400 font-medium block mb-0.5">UID Account</span>
                      <code className="font-mono text-gray-700">{user?.uid}</code>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-gray-400 font-medium block mb-0.5">Metodo Autenticazione</span>
                      <span className="font-semibold text-gray-700">Firebase Auth (Email/Password)</span>
                    </div>
                  </div>
                </div>

                {/* Form Actions (Only if Owner) */}
                {userRole === "owner" && (
                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-6 py-3 text-sm font-semibold shadow-md shadow-blue-900/10 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Salvataggio...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Salva Profilo
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* PASSWORD CHANGE SECTION */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
                <h3 className="font-serif text-lg font-bold text-[#1a2035] flex items-center gap-2.5">
                  <Lock className="w-5 h-5 text-[#1a3a8f]" />
                  Sicurezza & Cambio Password
                </h3>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-4">
                {passwordChangeSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{passwordChangeSuccess}</span>
                  </div>
                )}

                {passwordChangeError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <span>{passwordChangeError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Current Password */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Password Attuale *
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Inserisci la password attuale (richiesta per conferma sicurezza)"
                        value={currentPasswordForChange}
                        onChange={(e) => setCurrentPasswordForChange(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm outline-none focus:border-[#1a3a8f] font-medium"
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center text-gray-400">
                        <Lock className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-gray-400 text-[10px] mt-1">
                      Per cambiare la password, Firebase richiede di confermare la tua identità reinserendo la tua password attuale.
                    </p>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Nuova Password *
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        placeholder="Minimo 6 caratteri"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm outline-none focus:border-[#1a3a8f] font-medium"
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center text-gray-400">
                        <Lock className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Conferma Nuova Password *
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        placeholder="Ripeti la nuova password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm outline-none focus:border-[#1a3a8f] font-medium"
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center text-gray-400">
                        <Lock className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={passwordChangeLoading}
                    className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-6 py-2.5 text-xs font-semibold shadow-md shadow-blue-900/10 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    {passwordChangeLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Aggiornamento in corso...
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        Aggiorna Password
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* GDPR ACCOUNT DELETION SECTION */}
            {userRole === "owner" && (
              <div className="bg-white border border-red-100 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between border-b border-red-50 pb-4 mb-6">
                  <h3 className="font-serif text-lg font-bold text-red-700 flex items-center gap-2.5">
                    <Trash2 className="w-5 h-5 text-red-600" />
                    Eliminazione Account & Diritto all'Oblio (GDPR)
                  </h3>
                  <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-full font-semibold">
                    Azione Irreversibile
                  </span>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    In adempimento all'<strong>Articolo 17 del Regolamento UE 2016/679 (GDPR)</strong> sul <em>Diritto all'Oblio</em>, puoi richiedere l'eliminazione completa, automatica e permanente di tutti i tuoi dati e della tua identità digitale.
                  </p>

                  <div className="bg-red-50/50 border border-red-100 rounded-xl p-4 text-xs text-red-800 space-y-2">
                    <p className="font-bold uppercase tracking-wider text-[10px] text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Cosa succede quando elimini l'account?
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-1 text-red-700">
                      <li>La configurazione di tutti i tuoi saloni verrà rimossa in modo definitivo.</li>
                      <li>Tutti i collaboratori, agenda, appuntamenti e prestazioni verranno eliminati in modo irreversibile.</li>
                      <li>La lista clienti, magazzino prodotti, report storici e percentuali saranno distrutti.</li>
                      <li>Qualsiasi <strong>abbonamento o cliente Stripe attivo</strong> ad esso collegato verrà revocato per prevenire futuri addebiti.</li>
                      <li>La tua identità digitale verrà cancellata da Firebase Authentication e non potrai più effettuare l'accesso.</li>
                    </ul>
                  </div>

                  {/* STRUMENTI DI TEST GDPR (SVILUPPO) */}
                  <div className="bg-[#f0f9ff] border border-blue-100 rounded-xl p-4 space-y-3">
                    <p className="font-bold uppercase tracking-wider text-[10px] text-blue-700 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 shrink-0 text-blue-500 animate-pulse" />
                      Strumento di Test & Verifica GDPR (Consigliato per Sviluppatori)
                    </p>
                    <p className="text-xs text-blue-800 leading-normal">
                      Per evitare di creare manualmente saloni, staff, clienti, listini e appuntamenti da capo (che richiede molto tempo), puoi usare questo simulatore per popolare istantaneamente il database con record collegati al tuo account. Successivamente potrai premere il pulsante rosso di eliminazione per verificare che vengano distrutti istantaneamente.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={seedingLoading}
                        onClick={handleGenerateTestData}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        {seedingLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Generazione dati di test...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Popola Dati di Test istantaneamente (13 collezioni)
                          </>
                        )}
                      </button>

                      {seedingSuccess && (
                        <span className="text-xs text-emerald-700 font-bold flex items-center gap-1 animate-fadeIn bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                          <Check className="w-3.5 h-3.5" /> Dati generati! Verifica ora su Firestore o nell'agenda.
                        </span>
                      )}

                      {seedingError && (
                        <span className="text-xs text-red-700 font-semibold flex items-center gap-1 animate-fadeIn">
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" /> {seedingError}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                        Per confermare, digita <span className="font-mono text-red-600 font-extrabold select-all">ELIMINA DEFINITIVAMENTE</span> nel campo sottostante:
                      </label>
                      <input
                        type="text"
                        placeholder="Digita la frase di sicurezza per sbloccare"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-red-500 outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium font-mono"
                      />
                    </div>

                    {deleteError && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        <span>{deleteError}</span>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirmModal(true)}
                        disabled={deleteConfirmText !== "ELIMINA DEFINITIVAMENTE" || deletingAccount}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed text-white border border-transparent rounded-xl px-6 py-3 text-sm font-semibold shadow-md shadow-red-950/10 flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        Elimina Tutto in Sicurezza (GDPR)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

          {/* TAB 2: DATI DI FATTURAZIONE */}
          {activeTab === "fatturazione" && userRole !== "receptionist" && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
                <h3 className="font-serif text-lg font-bold text-[#1a2035] flex items-center gap-2.5">
                  <Building2 className="w-5 h-5 text-[#1a3a8f]" />
                  Fatturazione Elettronica Italiana
                </h3>
                {userRole !== "owner" && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                    <Lock className="w-3 h-3" /> Sola Lettura
                  </span>
                )}
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Ragione Sociale */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Ragione Sociale Azienda *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Es: Salone di Bellezza di Rossi S.r.l."
                      disabled={userRole !== "owner"}
                      value={ragioneSociale}
                      onChange={(e) => setRagioneSociale(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Partita IVA */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Partita IVA *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        maxLength={11}
                        placeholder="Es: 12345678901"
                        disabled={userRole !== "owner"}
                        value={partitaIva}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, ""); // Digits only
                          setPartitaIva(val);
                        }}
                        className={`w-full bg-gray-50 border rounded-xl pl-4 pr-10 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium ${
                          pivaIsEnteringValid === true
                            ? "border-green-300 focus:border-green-500 bg-green-50/10"
                            : pivaIsEnteringValid === false
                            ? "border-red-200 focus:border-red-400"
                            : "border-gray-200 focus:border-[#1a3a8f]"
                        }`}
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center">
                        {pivaIsEnteringValid === true && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        {pivaIsEnteringValid === false && partitaIva.length > 0 && (
                          <span className="text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                            Non valida
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Codice Fiscale */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Codice Fiscale *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="Es: RSSMRA80A01H501U"
                        disabled={userRole !== "owner"}
                        value={codiceFiscale}
                        onChange={(e) => {
                          setCodiceFiscale(e.target.value.replace(/\s+/g, "").toUpperCase());
                        }}
                        className={`w-full bg-gray-50 border rounded-xl pl-4 pr-10 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium uppercase ${
                          cfIsEnteringValid === true
                            ? "border-green-300 focus:border-green-500 bg-green-50/10"
                            : cfIsEnteringValid === false && codiceFiscale.length > 0
                            ? "border-red-200 focus:border-red-400"
                            : "border-gray-200 focus:border-[#1a3a8f]"
                        }`}
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center">
                        {cfIsEnteringValid === true && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        {cfIsEnteringValid === false && codiceFiscale.length > 0 && (
                          <span className="text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                            Non valido
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Via e Numero Civico */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Indirizzo (Via e Civico) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Es: Via Roma 15"
                      disabled={userRole !== "owner"}
                      value={via}
                      onChange={(e) => setVia(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Città */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Città *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Es: Milano"
                      disabled={userRole !== "owner"}
                      value={citta}
                      onChange={(e) => setCitta(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* CAP */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      CUP / CAP *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      placeholder="Es: 20121"
                      disabled={userRole !== "owner"}
                      value={cap}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, ""); // digits only
                        setCap(val);
                      }}
                      className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium ${
                        capIsEnteringValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : capIsEnteringValid === false
                          ? "border-red-200 focus:border-red-400"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                  </div>

                  {/* Provincia */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Provincia (Sigla PR) *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={2}
                      placeholder="Es: MI"
                      disabled={userRole !== "owner"}
                      value={provincia}
                      onChange={(e) => setProvincia(e.target.value.toUpperCase())}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Codice Destinatario (SDI) */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Codice Destinatario SDI
                    </label>
                    <input
                      type="text"
                      maxLength={7}
                      placeholder="Sigla SDI di 7 caratteri"
                      disabled={userRole !== "owner"}
                      value={sdi}
                      onChange={(e) => setSdi(e.target.value)}
                      className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed font-mono ${
                        sdiIsEnteringValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : sdiIsEnteringValid === false
                          ? "border-red-200 focus:border-red-400"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                    <p className="text-gray-400 text-[10px] mt-1">
                      Lascia vuoto o inserisci 7 caratteri alfanumerici.
                    </p>
                  </div>

                  {/* PEC */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      PEC (Posta Elettronica Certificata)
                    </label>
                    <input
                      type="email"
                      placeholder="Es: nomeazienda@legalmail.it"
                      disabled={userRole !== "owner"}
                      value={pec}
                      onChange={(e) => setPec(e.target.value)}
                      className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium ${
                        pecIsEnteringValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : pecIsEnteringValid === false
                          ? "border-red-200 focus:border-red-400"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                  </div>
                </div>

                <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-4 flex gap-3 text-xs text-gray-600">
                  <Building className="w-5 h-5 text-[#1a3a8f] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-gray-800 block mb-0.5">Impatto sulla fatturazione</span>
                    I dati salvati in questa scheda costituiscono la sede fiscale principale dell'azienda. Saranno usati come indirizzo di fatturazione predefinito per il pagamento del canone SaaS di SforbiciaSmart e possono essere applicati istantaneamente ai singoli saloni.
                  </div>
                </div>

                {/* Form Actions (Only if Owner) */}
                {userRole === "owner" && (
                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-6 py-3 text-sm font-semibold shadow-md shadow-blue-900/10 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Salvataggio...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Salva Dati Fatturazione
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* TAB 3: ABBONAMENTO SAAS */}
          {activeTab === "abbonamento" && userRole !== "receptionist" && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm space-y-8">
              
              {/* Header section with active badge */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#1a2035] flex items-center gap-2.5">
                    <CreditCard className="w-5 h-5 text-[#1a3a8f]" />
                    Gestione Abbonamento SaaS
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Visualizza il tuo piano attivo, i limiti di utilizzo e aggiorna il tuo abbonamento.
                  </p>
                </div>
                <div className="self-start sm:self-center flex items-center gap-2">
                  {userPlan === "unlimited" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold uppercase tracking-wider shadow-sm animate-pulse">
                      <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                      VIP Accesso Illimitato
                    </span>
                  ) : userPlan === "none" || subscriptionStatus === "trialing" ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold uppercase tracking-wider shadow-sm animate-pulse">
                      Periodo di Prova
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-bold uppercase tracking-wider shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Abbonamento Attivo
                    </span>
                  )}
                </div>
              </div>

              {/* Free Trial Banner if trialing */}
              {userPlan !== "unlimited" && (userPlan === "none" || subscriptionStatus === "trialing") && trialEndDate && (
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex gap-3">
                    <Calendar className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-900 text-sm block">Prova Gratuita Attiva</span>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Stai provando il piano <strong>{PLAN_LIMITS[userPlan]?.name || "Network"}</strong>. 
                        La prova scade il {formatDate(trialEndDate)}.
                      </p>
                    </div>
                  </div>
                  <div className="bg-amber-100/60 border border-amber-200 px-4 py-2 rounded-xl text-center shrink-0 w-full sm:w-auto">
                    <span className="block text-xl font-bold text-amber-900 leading-none">
                      {Math.max(0, Math.ceil((new Date(trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-amber-800">giorni rimasti</span>
                  </div>
                </div>
              )}

              {/* Mobile warning banner */}
              {detectIsMobileApp() && (
                <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl text-xs text-amber-850 leading-relaxed font-semibold space-y-1 shadow-sm">
                  <p className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                    <span>⚠️</span> Pagamenti e cambi piano disabilitati su Mobile App
                  </p>
                  <p>In conformità con le linee guida degli store nativi Apple App Store e Google Play Store, non puoi effettuare transazioni dirette o cambiare piano dall'app mobile. Visita il sito web di SforbiciaSmart dal browser del tuo smartphone o computer per gestire il tuo abbonamento.</p>
                </div>
              )}

              {/* Stripe.js Troubleshooting Guide */}
              <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl text-xs text-blue-900 leading-relaxed space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setShowStripeGuide(!showStripeGuide)}>
                  <p className="text-sm font-bold text-blue-950 flex items-center gap-2">
                    <span className="text-base">💡</span> Risoluzione errori di pagamento Stripe (es: "Invalid API Key")
                  </p>
                  <span className="text-xs font-bold text-blue-700 hover:text-blue-900 transition-colors">
                    {showStripeGuide ? "Nascondi Guida ▲" : "Mostra Guida ▼"}
                  </span>
                </div>
                
                {showStripeGuide && (
                  <div className="space-y-3.5 pt-2.5 border-t border-blue-200/60 animate-fadeIn text-blue-800">
                    <p>
                      Se riscontri problemi con il pagamento Stripe Checkout, verifica i seguenti punti:
                    </p>
                    
                    <div className="space-y-3 pl-1">
                      <div className="space-y-1">
                        <span className="font-bold text-blue-950 block">1. Corrispondenza chiavi Sandbox vs Produzione</span>
                        <p className="pl-3.5 border-l-2 border-blue-300">
                          Non puoi combinare chiavi API segrete di test (<code>sk_test_...</code>) con chiavi pubbliche reali (<code>pk_live_...</code>). Entrambe le chiavi devono appartenere allo stesso ambiente.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="font-bold text-blue-950 block">2. Configurazione dei Webhook</span>
                        <p className="pl-3.5 border-l-2 border-blue-300">
                          Per ricevere gli aggiornamenti automatici degli abbonamenti su Firestore in produzione, devi configurare l'endpoint webhook di Stripe che punta a: <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono font-semibold">{window.location.origin}/api/stripe/webhook</code>.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="font-bold text-blue-950 block">3. Simulatore Sandbox di Cortesia</span>
                        <p className="pl-3.5 border-l-2 border-blue-300">
                          Se non hai ancora configurato chiavi reali, l'applicazione si avvierà in modalità **Stripe Sandbox Simulator**, permettendoti di testare l'intera esperienza di acquisto e attivazione in modo totalmente sicuro e gratuito!
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Stripe Integration Keys Setup */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
                <div>
                  <h4 className="font-sans font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span className="text-base">⚙️</span>
                    Integrazione Stripe Personalizzata (Segreti & Chiavi API)
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Se non vedi o non puoi modificare le chiavi Stripe nel pannello dei segreti dell'infrastruttura, inseriscile qui sotto. Verranno salvate in modo sicuro nel database e utilizzate dal backend per tutti i tuoi checkout ed eventi.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Stripe Secret API Key */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Stripe Secret Key (inizia con sk_live_ o sk_test_)
                    </label>
                    <input
                      type="password"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/20 font-mono"
                      placeholder="Esempio: sk_live_... o sk_test_..."
                      value={stripeApiKey}
                      onChange={(e) => setStripeApiKey(e.target.value)}
                    />
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Usata dal server per autenticare le chiamate API di Stripe Checkout.
                    </span>
                  </div>

                  {/* Stripe Publishable Key */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Stripe Publishable Key (inizia con pk_live_ o pk_test_)
                    </label>
                    <input
                      type="text"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/20 font-mono"
                      placeholder="Esempio: pk_live_... o pk_test_..."
                      value={stripePublishableKey}
                      onChange={(e) => setStripePublishableKey(e.target.value)}
                    />
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Chiave pubblica usata per identificare il tuo account lato client.
                    </span>
                  </div>

                  {/* Stripe Environment */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Ambiente Stripe
                    </label>
                    <select
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/20"
                      value={stripeEnvironment}
                      onChange={(e) => setStripeEnvironment(e.target.value)}
                    >
                      <option value="sandbox">Sandbox (Test / Simulato)</option>
                      <option value="production">Production (Reale / Live)</option>
                    </select>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Scegli sandbox per testare l'attivazione in sicurezza.
                    </span>
                  </div>

                  {/* Stripe Webhook Secret */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Stripe Webhook Secret (opzionale, inizia con whsec_)
                    </label>
                    <input
                      type="password"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/20 font-mono"
                      placeholder="Esempio: whsec_..."
                      value={stripeWebhookSecret}
                      onChange={(e) => setStripeWebhookSecret(e.target.value)}
                    />
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Usato per convalidare le firme crittografiche dei webhook Stripe.
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-slate-200/60">
                  <button
                    type="button"
                    disabled={stripeKeysSaving}
                    onClick={handleSaveStripeKeys}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a3a8f] text-white text-xs font-bold hover:bg-[#1a3a8f]/90 transition-all disabled:opacity-50"
                  >
                    {stripeKeysSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Salvataggio...
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        Salva Chiavi Stripe
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={stripeTesting}
                    onClick={handleTestStripeKeys}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-300 transition-all disabled:opacity-50"
                  >
                    {stripeTesting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Verifica...
                      </>
                    ) : (
                      "Testa Connessione"
                    )}
                  </button>
                </div>

                {stripeTestResult && (
                  <div className="mt-3 bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-[11px] space-y-1.5 overflow-x-auto border border-slate-800">
                    <p className="font-bold text-slate-400 border-b border-slate-800 pb-1.5 flex justify-between items-center">
                      <span>🖥️ Risultato Test Server-Side:</span>
                      <span className={stripeTestResult.isCustomSecretsActive ? "text-green-400" : "text-amber-400"}>
                        {stripeTestResult.isCustomSecretsActive ? "● Chiavi Personalizzate Attive" : "● Chiavi Globali di Sistema"}
                      </span>
                    </p>
                    <p><span className="text-slate-500">Ambiente Rilevato:</span> <span className="text-yellow-300 uppercase">{stripeTestResult.stripeEnvironment}</span></p>
                    <p><span className="text-slate-500">API Key Masked:</span> <span className="text-emerald-400">{stripeTestResult.finalKeyUsedMasked}</span></p>
                    <p><span className="text-slate-500">Publishable Key Masked:</span> <span className="text-emerald-400">{stripeTestResult.publishableKeyMasked}</span></p>
                  </div>
                )}
              </div>

              {/* Interval Switcher */}
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Scegli la frequenza di fatturazione
                  </p>
                  <div className="inline-flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsYearlyBilling(false)}
                      className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                        !isYearlyBilling 
                          ? "bg-white text-[#1a3a8f] shadow-sm" 
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      Mensile
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsYearlyBilling(true)}
                      className={`text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                        isYearlyBilling 
                          ? "bg-white text-[#1a3a8f] shadow-sm" 
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      Annuale
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
                        RISPARMIA 20%
                      </span>
                    </button>
                  </div>
                </div>

                {/* Grid of pricing cards */}
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 pt-4">
                  
                  {/* Solo Pro Card */}
                  <div className={`relative border rounded-2xl p-6 transition-all flex flex-col justify-between ${
                    userPlan === "solo_pro" 
                      ? "border-[#1a3a8f] bg-[#1a3a8f]/[0.01] ring-2 ring-[#1a3a8f]/10 shadow-md" 
                      : "border-gray-200 hover:border-gray-300"
                  }`}>
                    {userPlan === "solo_pro" && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1a3a8f] text-white text-[10px] font-extrabold tracking-widest uppercase px-3 py-1 rounded-full shadow">
                        Piano Attivo
                      </span>
                    )}
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-lg font-serif font-bold text-gray-800">Solo Pro</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Ideale per singoli professionisti. Include l'anagrafica clienti completa e le schede tecniche. Esclude il calcolo provvigioni e i listini prezzi dedicati.</p>
                      </div>
                      
                      <div className="flex items-baseline">
                        <span className="text-3xl font-mono font-bold text-[#1a2035]">
                          €{isYearlyBilling ? PLAN_LIMITS.solo_pro.priceYearly : PLAN_LIMITS.solo_pro.priceMonthly}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">/mese</span>
                      </div>

                      <div className="border-t border-gray-100 pt-4">
                        <ul className="space-y-2.5 text-xs">
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span><strong>1 Salone</strong> associabile</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Staff e Collaboratori <strong>Illimitati</strong></span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Massimo <strong>3 report Excel/mese</strong></span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600 font-semibold">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Anagrafica Clienti & Schede</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-300 line-through">
                            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>Provvigioni e Percentuali</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-300 line-through">
                            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>Listini e Tariffe Speciali Clienti</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-300 line-through">
                            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>AI Marketing & Generatore Campagne</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-300 line-through">
                            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>AI Suggeritore Up-selling (Consigli Prodotti)</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="pt-6">
                      {userPlan === "solo_pro" ? (
                        <div className="w-full text-center bg-gray-100 text-gray-500 font-bold py-2.5 rounded-xl text-xs">
                          Attualmente in uso
                        </div>
                      ) : (
                        detectIsMobileApp() ? (
                          <div className="w-full text-center bg-gray-50 text-gray-400 border border-gray-200/50 font-bold py-2.5 rounded-xl text-xs">
                            Disponibile su Web
                          </div>
                        ) : (
                          userRole === "owner" ? (
                            <button
                              type="button"
                              onClick={(e) => handleSelectPlan("solo_pro", e)}
                              className="w-full bg-white hover:bg-gray-50 text-[#1a3a8f] border border-[#1a3a8f] font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                            >
                              Passa a Solo Pro
                            </button>
                          ) : (
                            <div className="text-center text-gray-400 text-[11px] font-semibold">
                              Sola lettura
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>

                  {/* Network Card */}
                  <div className={`relative border rounded-2xl p-6 transition-all flex flex-col justify-between ${
                    userPlan === "network" 
                      ? "border-[#1a3a8f] bg-[#1a3a8f]/[0.01] ring-2 ring-[#1a3a8f]/10 shadow-md" 
                      : "border-gray-200 hover:border-gray-300"
                  }`}>
                    {userPlan === "network" && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1a3a8f] text-white text-[10px] font-extrabold tracking-widest uppercase px-3 py-1 rounded-full shadow">
                        Piano Attivo
                      </span>
                    )}
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-serif font-bold text-gray-800">Premium Network</h4>
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-md uppercase">
                            Premium
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">Sblocca l'anagrafica clienti completa, il calcolo automatico delle provvigioni e listini prezzi dedicati.</p>
                      </div>
                      
                      <div className="flex items-baseline">
                        <span className="text-3xl font-mono font-bold text-[#1a2035]">
                          €{isYearlyBilling ? PLAN_LIMITS.network.priceYearly : PLAN_LIMITS.network.priceMonthly}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">/mese</span>
                      </div>

                      <div className="border-t border-gray-100 pt-4">
                        <ul className="space-y-2.5 text-xs">
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Fino a <strong>6 Saloni</strong></span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Staff e Collaboratori <strong>Illimitati</strong></span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Report Excel <strong>Illimitati</strong></span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Anagrafica Clienti & Schede</span>
                          </li>
                          <li className="flex items-start gap-2 text-emerald-700 font-semibold bg-emerald-50/50 p-1 rounded-lg border border-emerald-100">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Provvigioni e Percentuali Collab.</span>
                          </li>
                          <li className="flex items-start gap-2 text-emerald-700 font-semibold bg-emerald-50/50 p-1 rounded-lg border border-emerald-100">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Listini e Tariffe Speciali Clienti</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-300 line-through">
                            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>AI Marketing & Generatore Campagne</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-300 line-through">
                            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>AI Suggeritore Up-selling (Consigli Prodotti)</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="pt-6">
                      {userPlan === "network" ? (
                        <div className="w-full text-center bg-gray-100 text-gray-500 font-bold py-2.5 rounded-xl text-xs">
                          Attualmente in uso
                        </div>
                      ) : (
                        detectIsMobileApp() ? (
                          <div className="w-full text-center bg-gray-50 text-gray-400 border border-gray-200/50 font-bold py-2.5 rounded-xl text-xs">
                            Disponibile su Web
                          </div>
                        ) : (
                          userRole === "owner" ? (
                            <button
                              type="button"
                              onClick={(e) => handleSelectPlan("network", e)}
                              className="w-full bg-[#1a3a8f] hover:bg-[#152f73] text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                            >
                              Attiva Premium Network
                            </button>
                          ) : (
                            <div className="text-center text-gray-400 text-[11px] font-semibold">
                              Sola lettura
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>

                  {/* Elite AI Card */}
                  <div className={`relative border rounded-2xl p-6 transition-all flex flex-col justify-between ${
                    userPlan === "elite_ai" 
                      ? "border-[#1a3a8f] bg-[#1a3a8f]/[0.01] ring-2 ring-[#1a3a8f]/10 shadow-md" 
                      : "border-gray-200 hover:border-gray-300"
                  }`}>
                    {userPlan === "elite_ai" && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1a3a8f] text-white text-[10px] font-extrabold tracking-widest uppercase px-3 py-1 rounded-full shadow">
                        Piano Attivo
                      </span>
                    )}
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-serif font-bold text-gray-800">Elite AI</h4>
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded-md uppercase">
                            Avanzato
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">Tutto il pacchetto Premium potenziato dall'Intelligenza Artificiale per marketing e automazione.</p>
                      </div>
                      
                      <div className="flex items-baseline">
                        <span className="text-3xl font-mono font-bold text-[#1a2035]">
                          €{isYearlyBilling ? PLAN_LIMITS.elite_ai.priceYearly : PLAN_LIMITS.elite_ai.priceMonthly}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">/mese</span>
                      </div>

                      <div className="border-t border-gray-100 pt-4">
                        <ul className="space-y-2.5 text-xs">
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Saloni <strong>Illimitati</strong> (Infinity)</span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Staff e Collaboratori <strong>Illimitati</strong></span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Report Excel <strong>Illimitati</strong></span>
                          </li>
                          <li className="flex items-start gap-2 text-gray-600">
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span>Anagrafica Clienti & Schede</span>
                          </li>
                          <li className="flex items-start gap-2 text-emerald-700 font-semibold bg-emerald-50/50 p-1 rounded-lg border border-emerald-100">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Provvigioni e Percentuali Collab.</span>
                          </li>
                          <li className="flex items-start gap-2 text-emerald-700 font-semibold bg-emerald-50/50 p-1 rounded-lg border border-emerald-100">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Listini e Tariffe Speciali Clienti</span>
                          </li>
                          <li className="flex items-start gap-2 text-emerald-700 font-bold bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>AI Marketing & Generatore Campagne</span>
                          </li>
                          <li className="flex items-start gap-2 text-emerald-700 font-bold bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100">
                            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>SaaS Assistant AI Chatbot attivo</span>
                          </li>
                          <li className="flex items-start gap-2 text-emerald-700 font-bold bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100">
                            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>AI Suggeritore Up-selling (Consigli Prodotti)</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="pt-6">
                      {userPlan === "elite_ai" ? (
                        <div className="w-full text-center bg-gray-100 text-gray-500 font-bold py-2.5 rounded-xl text-xs">
                          Attualmente in uso
                        </div>
                      ) : (
                        detectIsMobileApp() ? (
                          <div className="w-full text-center bg-gray-50 text-gray-400 border border-gray-200/50 font-bold py-2.5 rounded-xl text-xs">
                            Disponibile su Web
                          </div>
                        ) : (
                          userRole === "owner" ? (
                            <button
                              type="button"
                              onClick={(e) => handleSelectPlan("elite_ai", e)}
                              className="w-full bg-[#1a3a8f] hover:bg-[#152f73] text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                            >
                              Attiva Elite AI
                            </button>
                          ) : (
                            <div className="text-center text-gray-400 text-[11px] font-semibold">
                              Sola lettura
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* Stripe Billing and Payments Portal */}
              <div className="border-t border-gray-100 pt-6">
                <div className="bg-[#f8fafc] border border-gray-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] block">Fatturazione & Abbonamento</span>
                    <h5 className="font-bold text-gray-800 text-sm">Desideri gestire, modificare o disattivare il tuo abbonamento?</h5>
                    <p className="text-xs text-gray-500">
                      Accedi in modo sicuro al Portale Clienti Stripe per visualizzare lo storico delle fatture, aggiornare il metodo di pagamento, cambiare piano o disattivare il rinnovo automatico.
                    </p>
                  </div>
                  
                  {userRole === "owner" ? (
                    <button
                      type="button"
                      disabled={portalLoading}
                      onClick={handleOpenPortal}
                      className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl px-5 py-3 text-xs font-bold flex items-center gap-2 transition-all shadow-sm shrink-0 w-full sm:w-auto justify-center cursor-pointer disabled:opacity-50"
                    >
                      {portalLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#1a3a8f]" />
                      ) : (
                        <ExternalLink className="w-4 h-4 text-gray-500" />
                      )}
                      Gestisci Abbonamento su Stripe
                    </button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2 text-amber-800 text-xs font-semibold shrink-0">
                      <Lock className="w-4 h-4 text-amber-600" />
                      <span>Riservato ai Proprietari</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: CONFIGURAZIONE EMAIL SMTP */}
          {activeTab === "email" && userRole !== "receptionist" && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm space-y-8">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#1a2035] flex items-center gap-2.5">
                    <Mail className="w-5 h-5 text-[#1a3a8f]" />
                    Configurazione SMTP ed Invio Email
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Gestisci le credenziali del server mail per l'invio delle comunicazioni, notifiche automatiche e recupero password.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 self-start bg-[#1a3a8f]/5 text-[#1a3a8f] px-3 py-1.5 rounded-full text-[11px] font-bold">
                  <span>Server Personalizzabile</span>
                </div>
              </div>

              {/* Notice / Guide */}
              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl text-xs text-blue-900 leading-relaxed space-y-2">
                <p className="font-semibold text-blue-950 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  Risoluzione errore 535 (Autenticazione Fallita)
                </p>
                <p>
                  Se ricevi l'errore <strong>"535 Authentication Failed"</strong> nella console o nell'app:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Assicurati di aver inserito l'indirizzo email e la password in modo corretto.</li>
                  <li><strong>Se usi Zoho Mail</strong>: Devi abilitare l'accesso IMAP/SMTP nel pannello Zoho e generare una <strong>"Password dell'Applicazione"</strong> (App-specific password) invece di usare la tua password principale di accesso, specialmente se hai attivo il 2FA (Double Factor Authentication).</li>
                  <li><strong>Se usi Gmail</strong>: Devi impostare una password specifica per le app nel tuo account Google.</li>
                </ul>
              </div>

              {/* Form Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Server SMTP (Host): <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="es. smtppro.zoho.eu o smtp.gmail.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#1a3a8f] focus:bg-white transition-all text-gray-900 font-medium"
                  />
                  <p className="text-[10px] text-gray-400">L'indirizzo del server di posta in uscita.</p>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Porta SMTP: <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#1a3a8f] focus:bg-white transition-all text-gray-900 font-medium"
                  >
                    <option value="465">465 (SSL/TLS - Consigliato)</option>
                    <option value="587">587 (STARTTLS / TLS)</option>
                    <option value="25">25 (Non sicuro)</option>
                  </select>
                  <p className="text-[10px] text-gray-400">Porta standard per connessioni sicure (criptate).</p>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Username SMTP (Email): <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="es. info@tuodominio.it"
                    value={smtpUsername}
                    onChange={(e) => setSmtpUsername(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#1a3a8f] focus:bg-white transition-all text-gray-900 font-medium"
                  />
                  <p className="text-[10px] text-gray-400">L'indirizzo email utilizzato per l'autenticazione.</p>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Password SMTP / App Password: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Inserisci la password o l'App Password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#1a3a8f] focus:bg-white transition-all text-gray-900 font-medium"
                  />
                  <p className="text-[10px] text-gray-400">La password della casella o la password app specifica.</p>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Nome Visualizzato (Mittente):
                  </label>
                  <input
                    type="text"
                    placeholder="es. SforbiciaSmart"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#1a3a8f] focus:bg-white transition-all text-gray-900 font-medium"
                  />
                  <p className="text-[10px] text-gray-400">Il nome visualizzato dai clienti quando ricevono l'email.</p>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Email di Risposta (Reply-To):
                  </label>
                  <input
                    type="email"
                    placeholder="es. supporto@tuodominio.it"
                    value={smtpFromAddr}
                    onChange={(e) => setSmtpFromAddr(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#1a3a8f] focus:bg-white transition-all text-gray-900 font-medium"
                  />
                  <p className="text-[10px] text-gray-400">Indirizzo a cui risponderanno i clienti (se vuoto, usa l'username SMTP).</p>
                </div>
              </div>

              {/* Connection Diagnostics and Testing */}
              <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5 md:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#1a3a8f]" />
                  <h4 className="font-semibold text-xs text-gray-800 uppercase tracking-wider">
                    Strumento di Diagnostica SMTP e Invio Test
                  </h4>
                </div>
                <p className="text-xs text-gray-500">
                  Prima di salvare, puoi verificare in tempo reale se i parametri inseriti sono validi e autorizzati dal tuo provider SMTP.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={smtpTesting || !smtpHost || !smtpUsername || !smtpPassword}
                    onClick={handleTestSmtpConnection}
                    className="bg-[#1a3a8f] hover:bg-[#152e72] disabled:opacity-40 text-white rounded-xl px-5 py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm w-full sm:w-auto"
                  >
                    {smtpTesting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white animate-spin mr-1" />
                        Verifica in corso...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Invia Email di Test e Verifica
                      </>
                    )}
                  </button>
                </div>

                {/* Test Diagnostic Result Panel */}
                {smtpTestResult && (
                  <div className={`p-4 rounded-xl border text-xs leading-normal animate-fadeIn space-y-2 ${
                    smtpTestResult.success 
                      ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" 
                      : "bg-red-50/70 border-red-200 text-red-900"
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {smtpTestResult.success ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Connessione Riuscita!</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>Connessione Fallita</span>
                        </>
                      )}
                    </div>
                    <p className="font-mono text-[11px] bg-white/70 border border-black/5 p-2 rounded-lg break-all">
                      {smtpTestResult.message}
                    </p>
                    {smtpTestResult.advice && (
                      <p className="font-semibold text-gray-800 bg-white/40 p-2 rounded-lg">
                        <strong>Suggerimento:</strong> {smtpTestResult.advice}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  disabled={smtpSaving || !smtpHost || !smtpUsername || !smtpPassword}
                  onClick={handleSaveSmtpSettings}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl px-6 py-3 text-xs font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  {smtpSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      Salvataggio...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      Salva Configurazione SMTP
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* DOUBLE CONFIRMATION MODAL FOR GDPR ACCOUNT DELETION */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-red-100 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative animate-scaleIn">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-extrabold text-gray-900 leading-tight">
                  Sei ASSOLUTAMENTE sicuro?
                </h3>
                <p className="text-xs text-red-600 font-bold uppercase tracking-wider">
                  Questa azione è immediata e irreversibile!
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs md:text-sm text-gray-600 leading-relaxed border-t border-b border-gray-100 py-4 my-4">
              <p>
                Facendo clic su "Elimina Definitivamente", avvierai una procedura automatica atomica che eliminerà permanentemente l'intero database aziendale dei tuoi saloni, l'elenco dei dipendenti, tutti gli appuntamenti storici e futuri, il magazzino, le impostazioni fiscali, le anagrafiche dei clienti e le configurazioni relative al codice <strong>{ownerId}</strong>.
              </p>
              <p className="font-semibold text-red-700 bg-red-50/50 p-2.5 rounded-lg border border-red-100">
                La cancellazione dell'account rimuoverà istantaneamente tutti i dati della tua sottoscrizione nel database locale/Firestore. Riceverai un'email Zoho Mail di avvenuto adempimento e diritto all'oblio.
              </p>

              {auth.currentUser?.providerData.some(p => p.providerId === "password") && (
                <div className="bg-amber-50/40 border border-amber-200/60 p-4 rounded-xl space-y-2 mt-4 text-left">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Conferma Password per l'Eliminazione Credenziali:
                  </label>
                  <p className="text-xs text-gray-500 leading-normal">
                    Per eliminare definitivamente il tuo utente da Firebase Authentication e impedire futuri accessi, inserisci la tua password attuale:
                  </p>
                  <input
                    type="password"
                    placeholder="Inserisci la tua password attuale"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    disabled={deletingAccount}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500 transition-all text-gray-900 font-medium"
                  />
                </div>
              )}
            </div>

            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setDeleteError("");
                }}
                className="px-5 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all cursor-pointer w-full sm:w-auto text-center disabled:opacity-50"
              >
                Annulla e Torna Indietro
              </button>
              <button
                type="button"
                disabled={deletingAccount}
                onClick={handleDeleteAccount}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-3 text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer w-full sm:w-auto disabled:opacity-50"
              >
                {deletingAccount ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Eliminazione in corso (GDPR)...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Sì, Elimina Definitivamente Ora
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
