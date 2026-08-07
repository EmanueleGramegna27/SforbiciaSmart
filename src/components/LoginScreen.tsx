import React, { useState } from "react";
import { 
  auth, 
  db 
} from "../lib/firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from "firebase/auth";
import { 
  doc, 
  setDoc 
} from "firebase/firestore";
import { 
  Scissors, 
  Mail, 
  Lock, 
  ArrowRight, 
  Loader2,
  AlertCircle,
  Shield,
  User,
  Store,
  CheckCircle2,
  ArrowLeft,
  X,
  Printer
} from "lucide-react";
import { z } from "zod";

// Zod validation schemas
const loginSchema = z.object({
  email: z.string().email("Inserisci un indirizzo email valido"),
  password: z.string().min(6, "La password deve contenere almeno 6 caratteri"),
});

const registerSchema = z.object({
  firstName: z.string().min(2, "Il nome deve contenere almeno 2 caratteri"),
  lastName: z.string().min(2, "Il cognome deve contenere almeno 2 caratteri"),
  email: z.string().email("Inserisci un indirizzo email valido"),
  password: z.string().min(6, "La password deve contenere almeno 6 caratteri"),
  role: z.enum(["admin", "barbiere"]),
  tenantId: z.string().optional()
}).refine(data => {
  if (data.role === "barbiere") {
    return !!data.tenantId && data.tenantId.trim().length > 0;
  }
  return true;
}, {
  message: "Il Codice Negozio è obbligatorio per i collaboratori",
  path: ["tenantId"]
});

export default function LoginScreen() {
  // GDPR Erasure Certificate state
  const [gdprCertificate, setGdprCertificate] = useState<{
    userId: string;
    userEmail: string;
    timestamp: string;
    hash: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    collections: string[];
  } | null>(() => {
    try {
      const stored = localStorage.getItem("gdpr_erasure_certificate");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isRegister, setIsRegister] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "barbiere">("admin");
  const [tenantId, setTenantId] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Forgot Password modal states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError("Inserisci un indirizzo email valido.");
      return;
    }

    setForgotLoading(true);
    setForgotSuccess("");
    setForgotError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await response.json();
      if (data.success) {
        setForgotSuccess("Email di ripristino inviata con successo! Controlla la tua casella di posta Zoho Mail o Spam.");
        setForgotEmail("");
      } else {
        setForgotError(data.error || "Impossibile inviare l'email di ripristino.");
      }
    } catch (err: any) {
      console.error("Forgot password API error:", err);
      setForgotError("Errore di connessione col server di ripristino password. Riprova.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorCode("");
    setErrorMessage("");
    setValidationErrors({});
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account"
      });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Google Auth error:", err);
      setErrorCode(err.code || "auth/unknown");
      setErrorMessage(err.message || "Si è verificato un errore durante l'accesso con Google. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorCode("");
    setErrorMessage("");
    setValidationErrors({});

    const emailClean = email.trim().toLowerCase();
    const passwordClean = password.trim();

    // Validate inputs with Zod
    if (isRegister) {
      const result = registerSchema.safeParse({
        firstName,
        lastName,
        email: emailClean,
        password: passwordClean,
        role,
        tenantId: role === "barbiere" ? tenantId : undefined
      });

      if (!result.success) {
        const errors: Record<string, string> = {};
        result.error.issues.forEach(issue => {
          const path = issue.path[0] as string;
          errors[path] = issue.message;
        });
        setValidationErrors(errors);
        setErrorMessage("Verifica i campi evidenziati nel modulo.");
        setLoading(false);
        return;
      }
    } else {
      const result = loginSchema.safeParse({ email: emailClean, password: passwordClean });
      if (!result.success) {
        const errors: Record<string, string> = {};
        result.error.issues.forEach(issue => {
          const path = issue.path[0] as string;
          errors[path] = issue.message;
        });
        setValidationErrors(errors);
        setErrorMessage("Email o password non validi.");
        setLoading(false);
        return;
      }
    }

    try {
      if (isRegister) {
        const userCredential = await createUserWithEmailAndPassword(auth, emailClean, passwordClean);
        const user = userCredential.user;
        
        if (user) {
          const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
          await updateProfile(user, {
            displayName: fullName || undefined
          });

          const targetTenant = role === "admin" ? user.uid : tenantId.trim();

          // 1. Write document inside the `/users/{userId}` collection
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: fullName,
            email: emailClean,
            role: role,
            tenant_id: targetTenant,
            createdAt: new Date().toISOString()
          });

          // 2. Write document inside the `/team/{memberId}` collection so standard staff loading reacts immediately
          await setDoc(doc(db, "team", user.uid), {
            id: user.uid,
            name: fullName,
            role: role === "admin" ? "Amministratore" : "Barbiere",
            phone: "",
            email: emailClean,
            salonIds: [],
            ownerId: targetTenant
          });

          // Send "Welcome/Completamento Registrazione" email via Zoho Mail API
          try {
            await fetch("/api/auth/send-welcome-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: emailClean, name: fullName }),
            });
            console.log("Welcome email request sent successfully.");
          } catch (welcomeErr) {
            console.error("Failed to send welcome email request:", welcomeErr);
          }
        }
      } else {
        await signInWithEmailAndPassword(auth, emailClean, passwordClean);
      }
    } catch (err: any) {
      console.error("Authentication process error:", err);
      setErrorCode(err.code || "auth/unknown");
      
      // Traditional human-friendly translations for Firebase errors
      switch (err.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          setErrorMessage("Email o password non corretti. Verifica le tue credenziali e riprova, oppure registrati come nuovo gestore.");
          break;
        case "auth/too-many-requests":
          setErrorMessage("Troppi tentativi di accesso non riusciti. L'accesso da questo dispositivo è temporaneamente bloccato per motivi di sicurezza.");
          break;
        case "auth/email-already-in-use":
          setErrorMessage("Questo indirizzo Email è già registrato.");
          break;
        case "auth/weak-password":
          setErrorMessage("La password deve contenere almeno 6 caratteri.");
          break;
        case "auth/invalid-email":
          setErrorMessage("Inserisci un indirizzo Email valido.");
          break;
        case "auth/operation-not-allowed":
          setErrorMessage("L'accesso tramite Email/Password non è ancora abilitato su questa sandbox.");
          break;
        default:
          setErrorMessage(err.message || "Si è verificato un errore, riprova.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (gdprCertificate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center py-10 px-4 font-sans print:bg-white print:py-0">
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body { background: white; color: black; }
            .no-print { display: none !important; }
            .print-full { width: 100% !important; max-width: 100% !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
          }
        `}} />
        
        <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-8 md:p-12 shadow-2xl relative print-full print:border-none print:shadow-none animate-fadeIn">
          {/* Top Stamp / Badge */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-slate-100 pb-8 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-sm print:bg-transparent">
                <Shield className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-extrabold text-slate-900 leading-tight">
                  SforbiciaSmart Privacy
                </h2>
                <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">
                  Adempimento Normativo GDPR
                </p>
              </div>
            </div>
            
            <div className="bg-emerald-50/50 border border-emerald-100 px-4 py-2 rounded-2xl flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wide shrink-0 print:border-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse print:hidden" />
              <span>Diritto all'Oblio Eseguito</span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="text-center sm:text-left">
              <h1 className="font-serif text-2xl font-extrabold text-slate-900 tracking-tight">
                Certificato di Avvenuta Cancellazione Dati
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-mono uppercase tracking-widest">
                Articolo 17 Regolamento UE 2016/679 (GDPR)
              </p>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Si certifica con la presente che la richiesta di rimozione totale, definitiva e irreversibile di tutte le informazioni relative all'account registrato e ai saloni ad esso associati è stata completata ed eseguita con successo in data odierna.
            </p>

            {/* Core Certificate Details Box */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-6 space-y-3.5 text-xs font-medium text-slate-700 print:bg-white print:border-slate-300">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 border-b border-slate-200/40 pb-2.5">
                <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Identificativo Proprietario (SaaS Owner)</span>
                <span className="font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-bold print:bg-transparent print:p-0">{gdprCertificate.userId}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 border-b border-slate-200/40 pb-2.5">
                <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Email di Riferimento Account</span>
                <span className="font-semibold text-slate-900 break-all">{gdprCertificate.userEmail}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 border-b border-slate-200/40 pb-2.5">
                <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Data e Ora Adempimento (UTC)</span>
                <span className="font-semibold text-slate-900">{new Date(gdprCertificate.timestamp).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "long", timeStyle: "medium" })}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 border-b border-slate-200/40 pb-2.5">
                <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">ID Sottoscrizione Stripe Disattivata</span>
                <span className="font-mono text-slate-900 break-all">{gdprCertificate.stripeSubscriptionId}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 border-b border-slate-200/40 pb-2.5">
                <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">ID Cliente Stripe Cancellato</span>
                <span className="font-mono text-slate-900 break-all">{gdprCertificate.stripeCustomerId}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Codice Legal-Hash Certificato</span>
                <span className="font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded font-bold print:bg-transparent print:border-none print:p-0">{gdprCertificate.hash}</span>
              </div>
            </div>

            {/* List of deleted datasets */}
            <div className="space-y-3">
              <h3 className="font-serif text-sm font-bold text-slate-800 uppercase tracking-wide">
                Registri e Data Store Cancellati Permanentemente:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 font-semibold">
                {gdprCertificate.collections.map((col, index) => (
                  <div key={index} className="flex items-center gap-2 bg-slate-50/50 border border-slate-100 px-3 py-2 rounded-xl print:bg-transparent print:border-none print:p-0">
                    <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 print:bg-transparent">
                      <span className="text-[10px]">✓</span>
                    </div>
                    <span className="truncate">{col}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-5 space-y-2 mt-2 text-xs text-amber-800 leading-relaxed print:hidden">
              <h4 className="font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                <span>⚠️</span> Nota per il Titolare
              </h4>
              <p>
                In conformità con il Diritto all'Oblio, tutte le tue credenziali di accesso sono state distrutte ed è stata inviata una conferma formale anche alla tua casella di posta. Ti consigliamo di <strong>stampare questa schermata o salvarla come PDF</strong> per il tuo registro interno di adempimento GDPR. Una volta premuto "Chiudi", questo certificato temporaneo non sarà più recuperabile dai nostri sistemi in quanto non conserviamo più alcuna traccia del tuo account.
              </p>
            </div>

            {/* Print and Close controls */}
            <div className="flex flex-col sm:flex-row items-center gap-3 justify-end pt-4 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full sm:w-auto bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-6 py-3.5 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-950/10"
              >
                <Printer className="w-4 h-4" />
                Stampa / Salva PDF Certificato
              </button>
              
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem("gdpr_erasure_certificate");
                  setGdprCertificate(null);
                }}
                className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl px-6 py-3.5 text-xs font-bold transition-all cursor-pointer text-center"
              >
                Chiudi e Torna al Login
              </button>
            </div>

            <div className="text-center pt-4 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                SforbiciaSmart GDPR Compliance Seal • 2026
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center py-8 px-4 relative overflow-y-auto font-sans">
      {/* Decorative Blur Blobs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-[#eef2ff] blur-3xl opacity-70 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[420px] h-[420px] rounded-full bg-blue-100 blur-3xl opacity-60 pointer-events-none" />

      {/* Auth Card wrapper */}
      <div className="w-full max-w-md bg-white border border-gray-100/80 rounded-3xl p-6 md:p-8 shadow-xl shadow-gray-200/50 relative z-10 animate-fadeIn my-auto">
        
        {/* Back to Login Button */}
        {isRegister && (
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setErrorCode("");
              setErrorMessage("");
              setValidationErrors({});
            }}
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#1a3a8f] hover:text-[#152f73] transition-all bg-[#eef2ff]/50 hover:bg-[#eef2ff] px-3.5 py-1.5 rounded-xl border border-blue-100/30 cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Torna al Login / Accedi
          </button>
        )}

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#eef2ff] flex items-center justify-center text-[#1a3a8f] mb-2 shadow-sm">
            <Scissors className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-[#1a2035] tracking-tight text-center">
            SforbiciaSmart
          </h1>
          <p className="text-gray-500 text-xs mt-1 text-center font-medium px-2">
            {isRegister 
              ? "Crea il tuo account ed entra nel workspace" 
              : "Gestisci i tuoi saloni con semplicità ed efficienza"
            }
          </p>
        </div>

        {/* Global Error Callout */}
        {errorMessage && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className="font-bold">Attenzione</p>
              <p className="font-medium mt-0.5 text-red-600/90">{errorMessage}</p>
              <span className="text-[9px] font-mono opacity-50 block mt-1 uppercase text-gray-500">
                CODICE: {errorCode}
              </span>
            </div>
          </div>
        )}

        {/* Guided resolution for operation-not-allowed */}
        {errorCode === "auth/operation-not-allowed" && (
          <div className="mb-5 p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs animate-fadeIn">
            <div className="flex items-center gap-2 mb-2 font-bold text-[#1a3a8f]">
              <Shield className="w-4 h-4 shrink-0 text-[#1a3a8f] animate-pulse" />
              <span>Limitazione Sandbox AI Studio</span>
            </div>
            
            <p className="mb-2 text-gray-700 font-medium leading-relaxed">
              Il provider <strong>Email/Password</strong> non può essere abilitato manualmente a causa delle restrizioni del progetto sandbox.
            </p>

            <div className="bg-white/80 border border-blue-200/50 rounded-xl p-3 text-[11px] leading-relaxed">
              <span className="font-extrabold text-[#1a3a8f] block mb-1">💡 Soluzione Immediata:</span>
              <p className="text-gray-600 font-semibold leading-normal">
                Usa il pulsante <strong className="text-[#1a3a8f] font-extrabold">"Accedi con Google"</strong> qui sotto. Funziona all'istante senza configurazioni aggiuntive!
              </p>
            </div>
          </div>
        )}

        {/* Guided resolution for too-many-requests */}
        {errorCode === "auth/too-many-requests" && (
          <div className="mb-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs animate-fadeIn">
            <div className="flex items-center gap-2 mb-2 font-bold text-[#b45309]">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#b45309]" />
              <span>Accesso Temporaneamente Bloccato</span>
            </div>
            
            <p className="mb-2 text-gray-700 font-medium leading-relaxed">
              Ci sono stati troppi tentativi consecutivi di accesso non riusciti per questo account.
            </p>

            <div className="bg-white/80 border border-amber-200/50 rounded-xl p-3 text-[11px] leading-relaxed">
              <span className="font-extrabold text-[#b45309] block mb-1">💡 Soluzione Alternativa Istantanea:</span>
              <p className="text-gray-600 font-semibold leading-normal">
                Puoi sbloccarti subito cliccando su <strong className="text-[#1a3a8f] font-extrabold">"Accedi subito con Google"</strong> qui sotto. L'accesso tramite Google è abilitato, sicuro e immediato!
              </p>
            </div>
          </div>
        )}

        {/* Recommended Google Sign-In */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 border-2 border-[#1a3a8f]/10 bg-white hover:bg-[#eef2ff]/30 active:scale-[0.98] text-[#1a2035] font-bold text-xs rounded-xl py-2.5 shadow-xs hover:shadow-md hover:border-[#1a3a8f]/30 transition-all cursor-pointer outline-none"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
            </svg>
            Accedi subito con Google
          </button>
          
          <div className="p-2 bg-[#eef2ff]/40 border border-blue-100/50 rounded-xl text-[10px] text-[#1a3a8f] font-semibold text-center leading-relaxed">
            ✨ Google Sign-In è già pre-configurato e pronto all'uso!
          </div>
        </div>

        {/* Divider */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-x-0 h-[1px] bg-gray-100" />
          <span className="relative bg-white px-3 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
            Oppure credenziali email
          </span>
        </div>

        {/* Email/Password Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <>
              {/* Names row */}
              <div className="grid grid-cols-2 gap-3 animate-fadeIn">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Nome
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                      <User className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Mario"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={`w-full bg-gray-50 border rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#1a2035] font-medium outline-none transition-all ${
                        validationErrors.firstName ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                  </div>
                  {validationErrors.firstName && (
                    <span className="text-[10px] text-red-500 font-bold mt-1 block">{validationErrors.firstName}</span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Cognome
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                      <User className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Rossi"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={`w-full bg-gray-50 border rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#1a2035] font-medium outline-none transition-all ${
                        validationErrors.lastName ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                  </div>
                  {validationErrors.lastName && (
                    <span className="text-[10px] text-red-500 font-bold mt-1 block">{validationErrors.lastName}</span>
                  )}
                </div>
              </div>

              {/* Role Selection */}
              <div className="space-y-1 animate-fadeIn">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Tipo di Account / Ruolo
                </label>
                <div className="w-full">
                  <div className="py-2.5 px-3.5 rounded-xl text-xs font-bold border-2 border-[#1a3a8f] bg-[#eef2ff]/40 text-[#1a3a8f] flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Titolare (Admin)
                  </div>
                </div>
              </div>

              {/* Tenant ID input (only if collaborator) */}
              {role === "barbiere" && (
                <div className="space-y-1 animate-slideDown">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Codice Negozio (Tenant ID) *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                      <Store className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Incolla l'ID fornito dal titolare"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value.trim())}
                      className={`w-full bg-gray-50 border rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#1a2035] font-medium outline-none transition-all ${
                        validationErrors.tenantId ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#1a3a8f]"
                      }`}
                    />
                  </div>
                  {validationErrors.tenantId && (
                    <span className="text-[10px] text-red-500 font-bold block mt-1">{validationErrors.tenantId}</span>
                  )}
                  <p className="text-[10px] text-gray-400 leading-normal">
                    Fatti dare il <strong>Codice Negozio (Tenant ID)</strong> dal proprietario. Lo trova nella sua scheda "Info Account" in SforbiciaSmart.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Email input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Indirizzo Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                <Mail className="w-3.5 h-3.5" />
              </span>
              <input
                type="email"
                required
                placeholder="nome@salone.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full bg-gray-50 border rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#1a2035] font-medium outline-none transition-all ${
                  validationErrors.email ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#1a3a8f]"
                }`}
              />
            </div>
            {validationErrors.email && (
              <span className="text-[10px] text-red-500 font-bold mt-1 block">{validationErrors.email}</span>
            )}
          </div>

          {/* Password input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Password
              </label>
              {!isRegister && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotSuccess("");
                    setForgotError("");
                    setShowForgotModal(true);
                  }}
                  className="text-[10px] font-semibold text-[#1a3a8f] hover:underline cursor-pointer focus:outline-none"
                >
                  Password dimenticata?
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                <Lock className="w-3.5 h-3.5" />
              </span>
              <input
                type="password"
                required
                placeholder="Almeno 6 caratteri"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full bg-gray-50 border rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#1a2035] font-medium outline-none transition-all ${
                  validationErrors.password ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#1a3a8f]"
                }`}
              />
            </div>
            {validationErrors.password && (
              <span className="text-[10px] text-red-500 font-bold mt-1 block">{validationErrors.password}</span>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1a3a8f] hover:bg-[#152f73] active:scale-[0.98] text-white rounded-xl py-2.5 text-xs font-semibold shadow-md shadow-blue-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer mt-4"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Elaborazione...
              </>
            ) : (
              <>
                {isRegister ? "Registrati ora" : "Accedi adesso"}
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col items-center gap-1">
          <p className="text-[11px] text-gray-500 font-medium">
            {isRegister ? "Hai già un account gestore?" : "Nuovo gestore? Registra il tuo negozio"}
          </p>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorCode("");
              setErrorMessage("");
              setValidationErrors({});
            }}
            className="text-[11px] font-bold text-[#1a3a8f] hover:text-[#152f73] underline-offset-4 hover:underline transition-all cursor-pointer"
          >
            {isRegister ? "Ritorna alla schermata di login" : "Crea un account gestore"}
          </button>
        </div>

        {/* Info Sandbox */}
        <div className="mt-4 p-2.5 bg-blue-50/40 border border-blue-100/40 rounded-xl text-[10px] text-gray-500 font-medium text-center leading-normal">
          💡 <strong>Protip:</strong> Puoi inserire un'email fittizia per registrare e testare subito diversi ruoli contemporaneamente!
        </div>

        {/* FORGOT PASSWORD MODAL */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl border border-gray-100 max-w-md w-full shadow-2xl p-6 md:p-8 animate-scaleUp relative">
              
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-all p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="mb-5 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-[#1a3a8f] flex items-center justify-center mx-auto mb-3">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="font-serif text-lg font-bold text-[#1a2035]">
                  Recupero Password
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                  Inserisci la tua email e ti invieremo un link per reimpostare la tua password in sicurezza tramite Zoho Mail.
                </p>
              </div>

              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                {forgotSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold flex items-start gap-2.5">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{forgotSuccess}</span>
                  </div>
                )}

                {forgotError && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-800 text-xs font-semibold flex items-start gap-2.5">
                    <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                    <span>{forgotError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Indirizzo Email dell'Account
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                      <Mail className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="email"
                      required
                      placeholder="es: nome@esempio.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#1a2035] font-medium outline-none focus:border-[#1a3a8f] transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl py-2.5 text-xs font-semibold shadow-md shadow-blue-900/15 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Invio...
                      </>
                    ) : (
                      <>
                        <span>Invia Link</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
