import React, { useState, useEffect } from "react";
import { useBusiness } from "../../context/BusinessContext";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";
import { 
  Scissors, 
  CreditCard, 
  Lock, 
  AlertCircle, 
  Check, 
  Loader2, 
  LogOut, 
  ShieldCheck, 
  ArrowRight,
  User,
  Phone,
  Building2,
  Mail,
  FileText,
  CheckCircle,
  Sparkles
} from "lucide-react";
import { PLAN_LIMITS } from "../../lib/plans";
import { BusinessSettings } from "../../types";
import { COUNTRY_PREFIXES, splitPhoneNumber } from "../CustomersScreen";

// Local validation helpers for mandatory profile fields
function isValidPartitaIva(piva: string): boolean {
  if (!piva) return false;
  const cleaned = piva.replace(/\s+/g, "");
  return cleaned.length === 11 && /^\d+$/.test(cleaned);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidSDI(sdi: string): boolean {
  if (!sdi) return false;
  return /^[a-zA-Z0-9]{7}$/.test(sdi);
}

function isValidCAP(cap: string): boolean {
  if (!cap) return false;
  return /^\d{5}$/.test(cap);
}

function isValidCodiceFiscale(cf: string): boolean {
  if (!cf) return false;
  const cleaned = cf.replace(/\s+/g, "").toUpperCase();
  return cleaned.length === 16 || cleaned.length === 11;
}

function detectIsMobileApp(): boolean {
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

interface SubscriptionGuardProps {

  children: React.ReactNode;
}

export default function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { user, ownerId, userRole, businessSettings, loading } = useBusiness();
  const [isYearlyBilling, setIsYearlyBilling] = useState(false);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);
  const [hasProcessedSuccessUrl, setHasProcessedSuccessUrl] = useState(false);
  const [mismatchError, setMismatchError] = useState<{ urlOwnerId: string; loggedInEmail: string } | null>(null);
  const [successOverlay, setSuccessOverlay] = useState(false);
  const [showStripeGuide, setShowStripeGuide] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  // Local form states for profile completion
  const [localOwnerNome, setLocalOwnerNome] = useState("");
  const [localOwnerPhonePrefix, setLocalOwnerPhonePrefix] = useState("+39");
  const [localOwnerPhoneBody, setLocalOwnerPhoneBody] = useState("");
  const [localRagioneSociale, setLocalRagioneSociale] = useState("");
  const [localPartitaIva, setLocalPartitaIva] = useState("");
  const [localCodiceFiscale, setLocalCodiceFiscale] = useState("");
  const [localVia, setLocalVia] = useState("");
  const [localCitta, setLocalCitta] = useState("");
  const [localCap, setLocalCap] = useState("");
  const [localProvincia, setLocalProvincia] = useState("");
  const [localSdi, setLocalSdi] = useState("");
  const [localPec, setLocalPec] = useState("");

  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  useEffect(() => {
    if (businessSettings) {
      setLocalOwnerNome(businessSettings.ownerNome || "");
      const split = splitPhoneNumber(businessSettings.ownerTelefono || "");
      setLocalOwnerPhonePrefix(split.prefix);
      setLocalOwnerPhoneBody(split.number);
      setLocalRagioneSociale(businessSettings.ragioneSociale || "");
      setLocalPartitaIva(businessSettings.partitaIvaPrincipale || "");
      setLocalCodiceFiscale(businessSettings.codiceFiscale || "");
      setLocalVia(businessSettings.via || "");
      setLocalCitta(businessSettings.citta || "");
      setLocalCap(businessSettings.cap || "");
      setLocalProvincia(businessSettings.provincia || "");
      setLocalSdi(businessSettings.sdi || "");
      setLocalPec(businessSettings.pec || "");
    }
  }, [businessSettings]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== "owner" || !ownerId) return;

    setFormError("");
    setFormSuccess("");

    // Validate all fields again explicitly
    if (!localOwnerNome.trim()) {
      setFormError("Il Nome e Cognome del Proprietario è obbligatorio.");
      return;
    }
    if (!localOwnerPhoneBody.trim()) {
      setFormError("Il Numero di Telefono è obbligatorio.");
      return;
    }
    if (!localRagioneSociale.trim()) {
      setFormError("La Ragione Sociale è obbligatoria.");
      return;
    }
    if (!localPartitaIva.trim()) {
      setFormError("La Partita IVA è obbligatoria.");
      return;
    }
    if (!isValidPartitaIva(localPartitaIva)) {
      setFormError("Partita IVA non valida. Inserisci una Partita IVA di 11 cifre.");
      return;
    }
    if (!localCodiceFiscale.trim()) {
      setFormError("Il Codice Fiscale è obbligatorio.");
      return;
    }
    if (!isValidCodiceFiscale(localCodiceFiscale)) {
      setFormError("Codice Fiscale non valido. Inserisci un Codice Fiscale di 11 o 16 caratteri.");
      return;
    }
    if (!localVia.trim() || !localCitta.trim() || !localCap.trim() || !localProvincia.trim()) {
      setFormError("Tutti i campi dell'indirizzo della sede legale (Via, Città, CAP, Provincia) sono obbligatori.");
      return;
    }
    if (!isValidCAP(localCap)) {
      setFormError("Il CAP deve contenere esattamente 5 cifre.");
      return;
    }
    if (localProvincia.trim().length !== 2) {
      setFormError("La sigla della Provincia deve contenere esattamente 2 lettere.");
      return;
    }
    if (!localSdi.trim()) {
      setFormError("Il Codice Destinatario SDI è obbligatorio per la fatturazione elettronica.");
      return;
    }
    if (!isValidSDI(localSdi)) {
      setFormError("Il Codice Destinatario SDI deve essere di 7 caratteri alfanumerici.");
      return;
    }
    if (!localPec.trim()) {
      setFormError("L'indirizzo PEC è obbligatorio.");
      return;
    }
    if (!isValidEmail(localPec)) {
      setFormError("L'indirizzo PEC inserito non è valido.");
      return;
    }

    setFormSaving(true);

    try {
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
      const assembledSedeLegale = `${localVia.trim()}, ${localCap.trim()} ${localCitta.trim()} (${localProvincia.trim().toUpperCase()})`;
      const combinedPhone = `${localOwnerPhonePrefix}${localOwnerPhoneBody.trim()}`;

      const updatedPayload: BusinessSettings = {
        ownerId,
        partitaIvaPrincipale: localPartitaIva.replace(/\s+/g, ""),
        sedeLegale: assembledSedeLegale,
        ownerNome: localOwnerNome.trim(),
        ownerTelefono: combinedPhone,
        ragioneSociale: localRagioneSociale.trim(),
        codiceFiscale: localCodiceFiscale.trim().toUpperCase(),
        via: localVia.trim(),
        citta: localCitta.trim(),
        cap: localCap.trim(),
        provincia: localProvincia.trim().toUpperCase(),
        sdi: localSdi.trim().toUpperCase(),
        pec: localPec.trim().toLowerCase(),
        userPlan: businessSettings?.userPlan || "network",
        subscriptionStatus: businessSettings?.subscriptionStatus || "trialing",
        trialStartDate: businessSettings?.trialStartDate || trialStart.toISOString(),
        trialEndDate: businessSettings?.trialEndDate || trialEnd.toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "business_settings", ownerId), updatedPayload);
      setFormSuccess("Informazioni personali salvate con successo!");
    } catch (err) {
      console.error("Error saving complete business/owner details:", err);
      setFormError("Errore durante il salvataggio. Riprova.");
    } finally {
      setFormSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center font-sans gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-[#1a3a8f]" />
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-widest animate-pulse">
          Verifica stato abbonamento...
        </span>
      </div>
    );
  }

  // If no user, let children handle it (or render nothing)
  if (!user) {
    return <>{children}</>;
  }

  if (successOverlay) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans p-4 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100 flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
            <CheckCircle className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Abbonamento Attivato!</h2>
            <p className="text-sm text-slate-500">
              Il pagamento è andato a buon fine e il tuo piano è ora attivo.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium animate-pulse bg-slate-50 px-4 py-2 rounded-lg w-full justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            <span>Questa finestra si chiuderà automaticamente...</span>
          </div>
          <button
            onClick={() => window.close()}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer"
          >
            Chiudi Finestra
          </button>
        </div>
      </div>
    );
  }

  if (mismatchError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans p-4 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full border border-indigo-100 flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 animate-bounce">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Pagamento Completato & Abbonamento Attivo! 🎉</h2>
            <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full font-semibold inline-block">
              Abbonamento Aggiornato con Successo nel Database
            </p>
          </div>
          <div className="text-xs text-slate-600 text-left bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed space-y-2.5">
            <p>
              Abbiamo completato l'operazione su Stripe e <strong>attivato correttamente l'abbonamento</strong> sul nostro database sicuro per il salone associato all'ID:
              <strong className="block font-mono text-slate-800 bg-slate-100 p-1.5 rounded mt-1 text-center select-all">{mismatchError.urlOwnerId}</strong>
            </p>
            <p>
              Tuttavia, in questa scheda del browser sei attualmente connesso con un account diverso:
              <strong className="block font-mono text-slate-800 bg-slate-100 p-1.5 rounded mt-1 text-center select-all">{mismatchError.loggedInEmail}</strong>
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Per motivi di sicurezza, protezione della privacy e conformità GDPR, il sistema locale impedisce che le impostazioni del salone pagante vengano visualizzate in una sessione di un account diverso. Disconnettiti da questa sessione ed esegui l'accesso con l'account proprietario corretto per iniziare subito ad utilizzare il tuo piano.
            </p>
          </div>

          <div className="space-y-2.5 w-full">
            <button
              onClick={handleLogout}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Scollegati ed Accedi con l'Account Corretto</span>
            </button>
            <button
              onClick={() => {
                setMismatchError(null);
                // Clear search parameters
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer"
            >
              Rimani in Questo Account (Torna alla Dashboard)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extract subscription values
  const plan = businessSettings?.userPlan || "none";
  const status = businessSettings?.subscriptionStatus || "trialing";
  const trialEndDate = businessSettings?.trialEndDate;

  const now = new Date();
  const endDate = trialEndDate ? new Date(trialEndDate) : null;
  const isTrialExpired = endDate ? (now.getTime() > endDate.getTime()) : false;
  const diffMs = endDate ? (endDate.getTime() - now.getTime()) : 0;
  const diffHours = diffMs / (1000 * 60 * 60);

  // Checks for block state: blocked if subscription status is not active AND (trial has expired OR subscription is expired OR there is no active plan chosen)
  // VIP "unlimited" plan bypasses all block and trial checks completely
  const isBlocked = plan !== "unlimited" && status !== "active" && (isTrialExpired || status === "expired" || !plan || plan === "none");

  // Check for alert state (last 24 hours of trial, trialing)
  const showLastDayBanner = plan !== "unlimited" && status === "trialing" && diffHours > 0 && diffHours <= 24;

  // Listen for message events (useful for when payment success happens in a new tab/window)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === "STRIPE_SUCCESS") {
        const { planKey, ownerId: successOwnerId, subscriptionId } = event.data;
        if (successOwnerId && successOwnerId === ownerId && userRole === "owner") {
          console.log("[SubscriptionGuard] Synchronizing payment success via postMessage for owner:", ownerId);
          setHasProcessedSuccessUrl(true);
          
          try {
            const docRef = doc(db, "business_settings", ownerId);
            const docSnap = await getDoc(docRef);
            const existingData = (docSnap.exists() ? docSnap.data() : {}) as BusinessSettings;

            const updatedPayload: BusinessSettings = {
              ...existingData,
              ownerId,
              partitaIvaPrincipale: existingData.partitaIvaPrincipale || businessSettings?.partitaIvaPrincipale || "",
              sedeLegale: existingData.sedeLegale || businessSettings?.sedeLegale || "",
              userPlan: planKey,
              subscriptionStatus: planKey === "none" ? "cancelled" : "active",
              stripeCustomerId: existingData.stripeCustomerId || `ctm_mock_${ownerId}`,
              stripeSubscriptionId: subscriptionId || existingData.stripeSubscriptionId || `sub_mock_${ownerId}_${Date.now()}`,
              updatedAt: new Date().toISOString()
            };
            await setDoc(docRef, updatedPayload, { merge: true });
          } catch (err) {
            console.error("[SubscriptionGuard] Error updating subscription via postMessage listener:", err);
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [ownerId, userRole, businessSettings]);

  // Listen for Stripe/Simulator return success query params
  useEffect(() => {
    if (hasProcessedSuccessUrl) return;

    const params = new URLSearchParams(window.location.search);
    const checkoutSuccess = params.get("checkout_success") === "true";

    if (checkoutSuccess && ownerId && userRole === "owner") {
      const planKey = params.get("plan_key");
      const subscriptionId = params.get("subscription_id");
      const urlOwnerId = params.get("ownerId");
      const isNewTab = window.self === window.top;
      const hasOpener = window.opener !== null;

      if (planKey) {
        setHasProcessedSuccessUrl(true);
        // Clear search parameters immediately to keep URL clean and prevent multiple trigger loops
        window.history.replaceState({}, document.title, window.location.pathname);

        // Security / Safety validation: does the ownerId from the payment redirect match the current session's ownerId?
        if (urlOwnerId && urlOwnerId !== ownerId) {
          console.error("[SubscriptionGuard] Session Mismatch Detected!", { urlOwnerId, ownerId });
          
          if (isNewTab && hasOpener) {
            // Forward success message to the original iframe so it gets applied to the correct account!
            try {
              window.opener.postMessage({
                type: "STRIPE_SUCCESS",
                planKey,
                subscriptionId,
                ownerId: urlOwnerId
              }, window.location.origin);
              
              // Show success message and count down to close the tab
              setSuccessOverlay(true);
              setTimeout(() => {
                window.close();
              }, 3000);
              return;
            } catch (postErr) {
              console.error("[SubscriptionGuard] Failed to send postMessage to opener:", postErr);
            }
          }

          // If there is no opener to handle it, set mismatch error to prevent writing to the wrong account
          setMismatchError({
            urlOwnerId,
            loggedInEmail: user.email || ""
          });
          return;
        }

        // normal match flow
        const updateSubscriptionInDb = async () => {
          try {
            const docRef = doc(db, "business_settings", ownerId);
            const docSnap = await getDoc(docRef);
            const existingData = (docSnap.exists() ? docSnap.data() : {}) as BusinessSettings;

            const updatedPayload: BusinessSettings = {
              ...existingData,
              ownerId,
              partitaIvaPrincipale: existingData.partitaIvaPrincipale || businessSettings?.partitaIvaPrincipale || "",
              sedeLegale: existingData.sedeLegale || businessSettings?.sedeLegale || "",
              userPlan: planKey,
              subscriptionStatus: planKey === "none" ? "cancelled" : "active",
              stripeCustomerId: existingData.stripeCustomerId || `ctm_mock_${ownerId}`,
              stripeSubscriptionId: subscriptionId || existingData.stripeSubscriptionId || `sub_mock_${ownerId}_${Date.now()}`,
              updatedAt: new Date().toISOString()
            };
            await setDoc(docRef, updatedPayload, { merge: true });

            // If we are in a new tab with opener, let's sync the opener as well and auto-close
            if (isNewTab && hasOpener) {
              try {
                window.opener.postMessage({
                  type: "STRIPE_SUCCESS",
                  planKey,
                  subscriptionId,
                  ownerId
                }, window.location.origin);
                setSuccessOverlay(true);
                setTimeout(() => {
                  window.close();
                }, 3000);
              } catch (postErr) {
                console.error("[SubscriptionGuard] Failed to notify opener on normal match:", postErr);
              }
            }
          } catch (err) {
            console.error("Error updating subscription on success redirect:", err);
          }
        };
        updateSubscriptionInDb();
      }
    }
  }, [ownerId, userRole, businessSettings, hasProcessedSuccessUrl, user.email]);

  const handleSelectPlan = async (planKey: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (userRole !== "owner" || !ownerId) return;

    setPurchasingPlan(planKey);
    try {
      const isYearly = isYearlyBilling;
      
      // Trova il price ID corrispondente alle variabili d'ambiente VITE_ se configurate
      let priceId = "";
      if (planKey === "solo_pro") {
        priceId = isYearly 
          ? (import.meta as any).env.VITE_STRIPE_PRICE_SOLO_Y 
          : (import.meta as any).env.VITE_STRIPE_PRICE_SOLO_M;
      } else if (planKey === "network") {
        priceId = isYearly 
          ? (import.meta as any).env.VITE_STRIPE_PRICE_NET_Y 
          : (import.meta as any).env.VITE_STRIPE_PRICE_NET_M;
      } else if (planKey === "elite_ai") {
        priceId = isYearly 
          ? (import.meta as any).env.VITE_STRIPE_PRICE_ELITE_Y 
          : (import.meta as any).env.VITE_STRIPE_PRICE_ELITE_M;
      }

      // Richiede la sessione di checkout Stripe al backend
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          billingCycle: isYearly ? "yearly" : "monthly",
          ownerId,
          customerEmail: user?.email,
          priceId: priceId || undefined,
          stripeCustomerId: businessSettings?.stripeCustomerId || undefined
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
      console.error("Error starting Stripe checkout:", err);
      alert("Errore durante l'avvio del pagamento: " + (err.message || err));
    } finally {
      setPurchasingPlan(null);
    }
  };


  const dbPartitaIva = businessSettings?.partitaIvaPrincipale || "";
  const dbOwnerNome = businessSettings?.ownerNome || "";
  const dbOwnerTelefono = businessSettings?.ownerTelefono || "";
  const dbRagioneSociale = businessSettings?.ragioneSociale || "";
  const dbCodiceFiscale = businessSettings?.codiceFiscale || "";
  const dbVia = businessSettings?.via || "";
  const dbCitta = businessSettings?.citta || "";
  const dbCap = businessSettings?.cap || "";
  const dbProvincia = businessSettings?.provincia || "";
  const dbSdi = businessSettings?.sdi || "";
  const dbPec = businessSettings?.pec || "";

  const isProfileIncompleteInDb = userRole === "owner" && (
    !dbOwnerNome.trim() ||
    !dbOwnerTelefono.trim() ||
    !dbRagioneSociale.trim() ||
    !dbPartitaIva.trim() ||
    !isValidPartitaIva(dbPartitaIva) ||
    !dbCodiceFiscale.trim() ||
    !isValidCodiceFiscale(dbCodiceFiscale) ||
    !dbVia.trim() ||
    !dbCitta.trim() ||
    !dbCap.trim() ||
    !isValidCAP(dbCap) ||
    !dbProvincia.trim() ||
    dbProvincia.trim().length !== 2 ||
    !dbSdi.trim() ||
    !isValidSDI(dbSdi) ||
    !dbPec.trim() ||
    !isValidEmail(dbPec)
  );

  if (isProfileIncompleteInDb && userRole === "owner") {
    const isPivaValid = localPartitaIva.replace(/\s+/g, "").length > 0 ? isValidPartitaIva(localPartitaIva.replace(/\s+/g, "")) : null;
    const isCfValid = localCodiceFiscale.replace(/\s+/g, "").length > 0 ? isValidCodiceFiscale(localCodiceFiscale.replace(/\s+/g, "")) : null;
    const isCapValid = localCap.trim().length > 0 ? isValidCAP(localCap.trim()) : null;
    const isSdiValid = localSdi.trim().length > 0 ? isValidSDI(localSdi.trim()) : null;
    const isPecValid = localPec.trim().length > 0 ? isValidEmail(localPec.trim()) : null;

    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50 flex flex-col font-sans text-gray-900 overflow-y-auto animate-pageFade">
        {/* Header bar with Logout */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#1a3a8f] border border-blue-100">
              <Scissors className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold tracking-tight text-[#1a3a8f]">
                SforbiciaSmart
              </h1>
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded uppercase tracking-wider">
                Configurazione Iniziale Obbligatoria
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-600 hover:text-rose-600 border border-gray-200 hover:border-rose-100 rounded-xl transition-all bg-white hover:bg-rose-50/50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnetti</span>
          </button>
        </header>

        {/* Form Container */}
        <main className="flex-1 max-w-4xl mx-auto px-4 py-10 w-full flex flex-col gap-8">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 text-[#1a3a8f] rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#1a2035] tracking-tight">
              Completa le Informazioni Obbligatorie
            </h2>
            <p className="text-gray-500 text-xs md:text-sm max-w-xl mx-auto leading-relaxed">
              Benvenuto! Per motivi di conformità fiscale italiana e fatturazione elettronica, è obbligatorio compilare tutti i dettagli aziendali e di contatto prima di sbloccare tutte le funzionalità del gestionale.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-xl space-y-8">
            {formError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2.5 animate-pulse">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-4 rounded-xl bg-green-50 border border-green-100 text-green-700 text-xs font-semibold flex items-center gap-2.5">
                <CheckCircle className="w-4.5 h-4.5 shrink-0 text-green-600" />
                <span>{formSuccess}</span>
              </div>
            )}

            {/* SEZIONE 1: CONTATTI PERSONALI */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 border-b border-indigo-50 pb-2">
                <User className="w-4 h-4" />
                1. Dati del Proprietario & Contatti
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Nome e Cognome *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Es: Mario Rossi"
                    value={localOwnerNome}
                    onChange={(e) => setLocalOwnerNome(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Numero di Telefono *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={localOwnerPhonePrefix}
                      onChange={(e) => setLocalOwnerPhonePrefix(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 outline-none focus:border-[#1a3a8f] font-semibold"
                    >
                      {COUNTRY_PREFIXES.map((pref) => (
                        <option key={pref.code} value={pref.code}>
                          {pref.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      placeholder="333 1234567"
                      value={localOwnerPhoneBody}
                      onChange={(e) => {
                        const numericVal = e.target.value.replace(/[^0-9]/g, "");
                        setLocalOwnerPhoneBody(numericVal);
                      }}
                      className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SEZIONE 2: DATI AZIENDALI */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 border-b border-indigo-50 pb-2">
                <Building2 className="w-4 h-4" />
                2. Dati Fiscali Aziendali
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Ragione Sociale Azienda *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Es: Rossi S.r.l."
                    value={localRagioneSociale}
                    onChange={(e) => setLocalRagioneSociale(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Partita IVA italiana *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={11}
                      placeholder="11 cifre numeriche"
                      value={localPartitaIva}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setLocalPartitaIva(val);
                      }}
                      className={`w-full bg-gray-50 border rounded-xl pl-4 pr-10 py-2.5 text-xs outline-none transition-all placeholder:text-gray-400 font-medium ${
                        isPivaValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : isPivaValid === false
                          ? "border-red-200 focus:border-red-400 bg-red-50/10"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      {isPivaValid === true && <CheckCircle className="w-4.5 h-4.5 text-green-500" />}
                      {isPivaValid === false && <span className="text-[9px] text-red-500 font-bold">Non valida</span>}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Codice Fiscale *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="16 caratteri o 11 cifre"
                      value={localCodiceFiscale}
                      onChange={(e) => {
                        setLocalCodiceFiscale(e.target.value.replace(/\s+/g, "").toUpperCase());
                      }}
                      className={`w-full bg-gray-50 border rounded-xl pl-4 pr-10 py-2.5 text-xs outline-none transition-all placeholder:text-gray-400 font-medium uppercase ${
                        isCfValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : isCfValid === false
                          ? "border-red-200 focus:border-red-400 bg-red-50/10"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      {isCfValid === true && <CheckCircle className="w-4.5 h-4.5 text-green-500" />}
                      {isCfValid === false && <span className="text-[9px] text-red-500 font-bold">Non valido</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SEZIONE 3: SEDE LEGALE */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 border-b border-indigo-50 pb-2">
                <FileText className="w-4 h-4" />
                3. Sede Legale (Indirizzo Fiscale)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Via e Numero Civico *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Es: Via Alessandro Manzoni 42"
                    value={localVia}
                    onChange={(e) => setLocalVia(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Città *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Es: Milano"
                    value={localCitta}
                    onChange={(e) => setLocalCitta(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    CAP *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={5}
                      placeholder="5 cifre"
                      value={localCap}
                      onChange={(e) => setLocalCap(e.target.value.replace(/[^0-9]/g, ""))}
                      className={`w-full bg-gray-50 border rounded-xl pl-4 pr-10 py-2.5 text-xs outline-none transition-all placeholder:text-gray-400 font-medium ${
                        isCapValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : isCapValid === false
                          ? "border-red-200 focus:border-red-400 bg-red-50/10"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      {isCapValid === true && <CheckCircle className="w-4.5 h-4.5 text-green-500" />}
                      {isCapValid === false && <span className="text-[9px] text-red-500 font-bold">Invalido</span>}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Provincia (PR) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="Es: MI"
                    value={localProvincia}
                    onChange={(e) => setLocalProvincia(e.target.value.toUpperCase())}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:border-[#1a3a8f] outline-none transition-all placeholder:text-gray-400 text-gray-900 font-medium"
                  />
                </div>
              </div>
            </div>

            {/* SEZIONE 4: FATTURAZIONE ELETTRONICA RECAPITO */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 border-b border-indigo-50 pb-2">
                <Mail className="w-4 h-4" />
                4. Recapito Fatturazione Elettronica
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Codice Destinatario SDI *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={7}
                      placeholder="Es: M5UXCR1 (7 caratteri alfanumerici)"
                      value={localSdi}
                      onChange={(e) => setLocalSdi(e.target.value.toUpperCase())}
                      className={`w-full bg-gray-50 border rounded-xl pl-4 pr-10 py-2.5 text-xs outline-none transition-all placeholder:text-gray-400 font-mono ${
                        isSdiValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : isSdiValid === false
                          ? "border-red-200 focus:border-red-400 bg-red-50/10"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      {isSdiValid === true && <CheckCircle className="w-4.5 h-4.5 text-green-500" />}
                      {isSdiValid === false && <span className="text-[9px] text-red-500 font-bold">Invalido</span>}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Indirizzo PEC *
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="Es: azienda@legalmail.it"
                      value={localPec}
                      onChange={(e) => setLocalPec(e.target.value.toLowerCase())}
                      className={`w-full bg-gray-50 border rounded-xl pl-4 pr-10 py-2.5 text-xs outline-none transition-all placeholder:text-gray-400 font-medium ${
                        isPecValid === true
                          ? "border-green-300 focus:border-green-500 bg-green-50/10"
                          : isPecValid === false
                          ? "border-red-200 focus:border-red-400 bg-red-50/10"
                          : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      {isPecValid === true && <CheckCircle className="w-4.5 h-4.5 text-green-500" />}
                      {isPecValid === false && <span className="text-[9px] text-red-500 font-bold">Invalida</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="pt-6 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={formSaving}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-8 py-3.5 text-xs font-bold shadow-md shadow-blue-900/10 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {formSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvataggio in corso...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4.5 h-4.5" />
                    Salva Informazioni e Accedi
                  </>
                )}
              </button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  // SCENARIO BLOCCO OWNER
  if (isBlocked && userRole === "owner") {
    const isMobileApp = detectIsMobileApp();

    if (isMobileApp) {
      return (
        <div className="fixed inset-0 z-[9999] bg-slate-50 flex flex-col font-sans text-gray-900 overflow-y-auto">
          {/* Header bar with Logout */}
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <Scissors className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="font-serif text-xl font-bold tracking-tight text-gray-900">
                  SforbiciaSmart
                </h1>
                <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded uppercase tracking-wider">
                  Prova Scaduta
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-600 hover:text-rose-600 border border-gray-200 hover:border-rose-100 rounded-xl transition-all bg-white hover:bg-rose-50/50 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnetti</span>
            </button>
          </header>

          {/* Main callout */}
          <main className="flex-1 max-w-xl mx-auto px-6 py-12 flex flex-col items-center justify-center text-center space-y-8 w-full">
            <div className="w-20 h-20 bg-rose-50 border border-rose-100 text-rose-600 rounded-3xl flex items-center justify-center shadow-lg">
              <Lock className="w-10 h-10" />
            </div>

            <div className="space-y-3">
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                Il tuo periodo di prova è scaduto
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed font-semibold px-4">
                Il tuo periodo di prova è scaduto. Visita il sito web di SforbiciaSmart dal browser per attivare il tuo piano e sbloccare di nuovo tutte le funzionalità.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl w-full text-xs text-amber-800 leading-relaxed text-left space-y-3 shadow-sm">
              <p className="font-bold text-sm text-amber-900 flex items-center gap-1.5">
                <span>⚠️</span> Come riattivare il tuo account:
              </p>
              <p>1. Apri il browser (Safari, Chrome o altro) sul tuo PC, Mac o dispositivo mobile.</p>
              <p>2. Accedi al sito di <strong>SforbiciaSmart</strong>.</p>
              <p>3. Effettua l'accesso con la tua email (<span className="font-mono font-bold">{user?.email}</span>).</p>
              <p>4. Seleziona il tuo piano ideale ed attivalo in tutta sicurezza.</p>
              <p className="pt-2 text-amber-900 font-semibold">Nota: I pulsanti di acquisto sono disabilitati nell'app mobile nativa in conformità con i termini dell'App Store e di Google Play.</p>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50 flex flex-col font-sans text-gray-900 overflow-y-auto">

        {/* Header bar with Logout */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#1a3a8f]">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold tracking-tight text-[#1a3a8f]">
                SforbiciaSmart
              </h1>
              <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded uppercase tracking-wider">
                Servizio Sospeso
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-600 hover:text-rose-600 border border-gray-200 hover:border-rose-100 rounded-xl transition-all bg-white hover:bg-rose-50/50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnetti</span>
          </button>
        </header>

        {/* Content Section */}
        <main className="flex-1 max-w-6xl mx-auto px-4 py-12 flex flex-col items-center justify-start lg:justify-center space-y-12 w-full">
          {/* Main callout */}
          <div className="text-center space-y-4 max-w-2xl">
            <div className="w-16 h-16 bg-rose-100 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-[#1a2035] tracking-tight">
              Il tuo periodo di prova è terminato
            </h2>
            <p className="text-gray-500 text-sm md:text-base leading-relaxed">
              Grazie per aver provato <strong>SforbiciaSmart</strong>. Il tuo periodo di prova gratuito di 14 giorni è scaduto. 
              Per continuare ad accedere alla tua agenda, ai dati dei clienti e a tutti gli strumenti di gestione del tuo salone, 
              seleziona uno dei piani seguenti ed attiva il tuo abbonamento.
            </p>
          </div>

          {/* Billing Switcher */}
          <div className="flex items-center justify-center gap-4 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shadow-inner">
            <button
              onClick={() => setIsYearlyBilling(false)}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                !isYearlyBilling
                  ? "bg-white text-[#1a3a8f] shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Fatturazione Mensile
            </button>
            <button
              onClick={() => setIsYearlyBilling(true)}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                isYearlyBilling
                  ? "bg-white text-[#1a3a8f] shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span>Fatturazione Annuale</span>
              <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-extrabold uppercase">
                -20%
              </span>
            </button>
          </div>

          {/* Modalità Demo / Sblocco Rapido Piani */}
          <div className="bg-[#1a3a8f]/5 border border-[#1a3a8f]/10 p-5 rounded-2xl text-xs text-slate-700 leading-relaxed space-y-2 shadow-sm max-w-4xl w-full">
            <div className="flex items-center gap-2">
              <span className="text-base">💳</span>
              <p className="text-sm font-bold text-[#1a3a8f] flex items-center gap-2">
                Sistema di Pagamento Integrato con Stripe Checkout
              </p>
            </div>
            <p className="text-slate-600 pl-6">
              Abbiamo integrato la suite di pagamento nativa di <strong>Stripe Checkout</strong> per gestire in modo sicuro gli abbonamenti mensili e annuali. Se hai configurato le chiavi API reali di Stripe nel pannello Settings, l'applicazione avvierà il checkout reale e sicuro di Stripe. Altrimenti, SforbiciaSmart si avvierà in modalità <strong>Sandbox / Simulatore ad Alta Fedeltà</strong>, permettendoti di testare l'acquisto e sbloccare istantaneamente le funzionalità del gestionale senza addebiti reali!
            </p>
          </div>

          {/* Plan Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
            {Object.entries(PLAN_LIMITS).map(([key, limit]) => {
              const isSolo = key === "solo_pro";
              const isNetwork = key === "network";
              const isElite = key === "elite_ai";
              const price = isYearlyBilling ? limit.priceYearly : limit.priceMonthly;
              const description = 
                key === "solo_pro" 
                  ? "Ideale per singoli professionisti. Include l'anagrafica clienti completa e le schede tecniche dei trattamenti. Esclude il calcolo provvigioni e i listini prezzi dedicati." 
                  : key === "network" 
                  ? "Per saloni in crescita che necessitano di più sedi e un team strutturato. Sblocca il Calcolo Provvigioni collaboratori e i Listini Prezzi Dedicati." 
                  : "Il pacchetto definitivo con intelligenza artificiale per marketing, automazione, calcolo provvigioni e listini prezzi dedicati.";
              const yearlyTotal = key === "solo_pro" ? "238,80" : key === "network" ? "478,80" : "838,80";

              return (
                <div 
                  key={key} 
                  className={`bg-white border rounded-3xl p-6 md:p-8 flex flex-col justify-between transition-all relative ${
                    isNetwork 
                      ? "border-[#1a3a8f]/80 ring-4 ring-[#1a3a8f]/10 shadow-xl" 
                      : "border-gray-200 hover:border-gray-300 shadow-md"
                  }`}
                >
                  {isNetwork && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#1a3a8f] text-white text-[10px] font-extrabold tracking-widest uppercase px-4 py-1.5 rounded-full shadow-md flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      PIÙ SCELTO (PREMIUM)
                    </span>
                  )}

                  <div className="space-y-6">
                    <div>
                      <h3 className="font-serif text-xl font-bold text-gray-900 flex items-center gap-2">
                        {limit.name}
                        {key !== "solo_pro" && (
                          <span className="text-[10px] font-black tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase">
                            Premium
                          </span>
                        )}
                      </h3>
                      <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                        {description}
                      </p>
                    </div>

                    <div className="border-b border-gray-100 pb-6">
                      <div className="flex items-baseline">
                        <span className="font-serif text-4xl font-extrabold text-[#1a2035]">
                          €{price}
                        </span>
                        <span className="text-gray-400 text-xs font-semibold ml-1">
                          / mese
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium mt-1">
                        {isYearlyBilling 
                          ? `Fatturato annualmente (€${yearlyTotal}/anno)` 
                          : "Fatturato mese per mese"}
                      </p>
                    </div>

                    <ul className="space-y-3.5 text-xs text-gray-600">
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Sedi: <strong>{limit.maxSalons === Infinity ? "Illimitate" : `Massimo ${limit.maxSalons}`}</strong></span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Collaboratori: <strong>{limit.maxStaff === Infinity ? "Illimitati" : `Massimo ${limit.maxStaff}`}</strong></span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        {limit.maxReportsPerMonth === Infinity ? (
                          <span>Report Esportabili: <strong>Illimitati</strong></span>
                        ) : (
                          <span>Report Esportabili: <strong>Massimo {limit.maxReportsPerMonth}/mese</strong></span>
                        )}
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Anagrafica Clienti & Schede Tecniche</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        {key !== "solo_pro" ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>Provvigioni e Percentuali Collaboratori</span>
                          </>
                        ) : (
                          <>
                            <span className="w-4 h-4 text-rose-500 font-bold text-center shrink-0 leading-none">×</span>
                            <span className="text-gray-400">Calcolo Provvigioni Non Disponibile</span>
                          </>
                        )}
                      </li>
                      <li className="flex items-start gap-2.5">
                        {key !== "solo_pro" ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>Tariffe Speciali e Listini Dedicati</span>
                          </>
                        ) : (
                          <>
                            <span className="w-4 h-4 text-rose-500 font-bold text-center shrink-0 leading-none">×</span>
                            <span className="text-gray-400">Listini Dedicati Non Disponibili</span>
                          </>
                        )}
                      </li>
                      <li className="flex items-start gap-2.5">
                        {limit.hasAI ? (
                          <>
                            <Check className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span className="text-[#1a3a8f] font-semibold flex items-center gap-1.5">
                              Marketing AI Abilitato
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="w-4 h-4 text-gray-300 font-bold text-center shrink-0 leading-none">-</span>
                            <span className="text-gray-400">Marketing AI Non Disponibile</span>
                          </>
                        )}
                      </li>
                      {limit.hasAI && (
                        <li className="flex items-start gap-2.5 text-emerald-700 font-semibold bg-emerald-50/50 p-1 rounded-lg border border-emerald-100">
                          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>SaaS Assistant AI Chatbot attivo</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="pt-8">
                    <button
                      onClick={(e) => handleSelectPlan(key, e)}
                      disabled={purchasingPlan !== null}
                      className={`w-full py-3.5 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        isNetwork
                          ? "bg-[#1a3a8f] hover:bg-[#152f73] text-white shadow-md shadow-[#1a3a8f]/10 hover:shadow-[#1a3a8f]/20"
                          : "bg-gray-900 hover:bg-gray-800 text-white"
                      } disabled:opacity-50`}
                    >
                      {purchasingPlan === key ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Attivazione...</span>
                        </>
                      ) : (
                        <>
                          <span>Attiva {limit.name}</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Secure checkout notice */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-[10px] text-gray-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>SforbiciaSmart Sandbox - Cambio piano simulato e istantaneo attivo.</span>
          </div>
        </main>
      </div>
    );
  }

  // SCENARIO BLOCCO STAFF (Collaboratore / Receptionist)
  if (isBlocked && (userRole === "collaborator" || userRole === "receptionist")) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50 flex flex-col font-sans text-gray-900 overflow-y-auto">
        {/* Header bar with Logout */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#1a3a8f]">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold tracking-tight text-[#1a3a8f]">
                SforbiciaSmart
              </h1>
              <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded uppercase tracking-wider">
                Sospeso
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-600 hover:text-rose-600 border border-gray-200 hover:border-rose-100 rounded-xl transition-all bg-white hover:bg-rose-50/50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnetti</span>
          </button>
        </header>

        {/* Locked Screen */}
        <main className="flex-1 max-w-xl mx-auto px-6 py-12 flex flex-col items-center justify-start md:justify-center text-center space-y-6 w-full">
          <div className="w-20 h-20 bg-rose-50 border border-rose-100 text-rose-600 rounded-3xl flex items-center justify-center shadow-lg animate-pulse">
            <Lock className="w-10 h-10" />
          </div>
          
          <div className="space-y-3">
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
              Servizio Sospeso
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              🔒 Il periodo di prova del salone è terminato. Contatta il proprietario per riattivare l'accesso.
            </p>
          </div>

          <div className="bg-slate-100/80 border border-slate-200 p-4 rounded-2xl w-full text-xs text-slate-500 leading-relaxed text-left space-y-2">
            <p className="font-bold text-slate-700">Cosa fare ora?</p>
            <p>1. Avvisa il titolare o gestore del salone che la prova gratuita di SforbiciaSmart è terminata.</p>
            <p>2. Chiedigli di accedere con le proprie credenziali da proprietario (Owner) per attivare uno dei piani di abbonamento disponibili.</p>
            <p>3. Non appena il proprietario avrà completato la riattivazione, la tua interfaccia si sbloccherà automaticamente in tempo reale.</p>
          </div>
        </main>
      </div>
    );
  }

  // Not blocked: Render the application content
  return (
    <div className="flex flex-col h-full w-screen overflow-hidden">
      {showLastDayBanner && (
        <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold py-3 px-4 text-center text-xs md:text-sm shadow-sm flex items-center justify-center gap-2 shrink-0 animate-fadeIn z-[9999]">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 animate-bounce" />
          <span>⚠️ Attenzione! Oggi è l'ultimo giorno di prova gratuita. Attiva un piano per non bloccare il salone!</span>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
