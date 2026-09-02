import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { claimFlashSlotClient } from "../utils/flashSlotClient";
import { 
  Scissors, 
  Clock, 
  Calendar, 
  User, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Store, 
  Timer, 
  Check 
} from "lucide-react";

interface MagicBookingScreenProps {
  slotId: string;
  customerId?: string | null;
}

export default function MagicBookingScreen({ slotId, customerId }: MagicBookingScreenProps) {
  const [loading, setLoading] = useState(true);
  const [slot, setSlot] = useState<any>(null);
  const [customer, setCustomer] = useState<{ id?: string; name?: string; phone?: string } | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimedResult, setClaimedResult] = useState<{
    success: boolean;
    appointmentId?: string;
    error?: string;
  } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSlotDetails() {
      setLoading(true);
      setFetchError(null);
      try {
        // 1. Primary method: Fetch via server endpoint (supports unauthenticated clients and secure customer prefill)
        const params = new URLSearchParams({ slotId });
        if (customerId) params.append("customerId", customerId);
        
        try {
          const res = await fetch(`/api/flash-slot/details?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.slot) {
              setSlot(data.slot);
              if (data.customer) {
                setCustomer(data.customer);
                setNameInput(data.customer.name || "");
                setPhoneInput(data.customer.phone || "");
              }
              setLoading(false);
              return;
            }
          }
        } catch (apiErr) {
          console.warn("[Magic Booking Load] Server details endpoint failed, attempting direct DB read...", apiErr);
        }

        // 2. Fallback: Direct Firestore read
        const slotDocRef = doc(db, "flash_slots", slotId);
        const slotSnap = await getDoc(slotDocRef);

        if (slotSnap.exists()) {
          const slotData = { id: slotSnap.id, ...slotSnap.data() } as any;
          setSlot(slotData);

          if (customerId) {
            try {
              const custDocRef = doc(db, "customers", customerId);
              const custSnap = await getDoc(custDocRef);
              if (custSnap.exists()) {
                const cData = custSnap.data() as any;
                setCustomer({ id: custSnap.id, name: cData.name, phone: cData.phone });
                setNameInput(cData.name || "");
                setPhoneInput(cData.phone || "");
              }
            } catch (cErr) {
              console.warn("Could not pre-load customer info:", cErr);
            }
          }
        } else {
          setFetchError("Slot non trovato o non più disponibile.");
        }
      } catch (err: any) {
        console.error("[Magic Booking Load Error]:", err);
        setFetchError("Impossibile caricare i dettagli del Flash Slot. Riprova più tardi.");
      } finally {
        setLoading(false);
      }
    }

    loadSlotDetails();
  }, [slotId, customerId]);

  const handleClaimSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !phoneInput.trim()) {
      alert("Inserisci il tuo nome e numero di telefono per confermare.");
      return;
    }

    setClaiming(true);
    try {
      const result = await claimFlashSlotClient(db, slotId, {
        customerId: customer?.id || "guest",
        customerName: nameInput.trim(),
        customerPhone: phoneInput.trim(),
      });

      if (result.success) {
        setClaimedResult({ success: true, appointmentId: result.appointmentId });
        setSlot((prev: any) => ({
          ...prev,
          status: "claimed",
          claimedBy: {
            customerName: nameInput.trim(),
            customerPhone: phoneInput.trim(),
          },
        }));
      } else {
        setClaimedResult({
          success: false,
          error: result.error === "already_claimed" 
            ? "Spiacenti! Il posto è appena stato assegnato ad un altro cliente che ha confermato un istante prima."
            : result.error === "expired"
            ? "L'offerta Flash Slot per questo orario è scaduta."
            : "Impossibile completare la prenotazione. Riprova.",
        });
        if (result.slotDetails) {
          setSlot(result.slotDetails);
        }
      }
    } catch (err: any) {
      setClaimedResult({
        success: false,
        error: "Errore di connessione durante la conferma. Riprova.",
      });
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold tracking-widest uppercase text-amber-300 animate-pulse">
          ⚡ Caricamento Offerta Flash...
        </p>
      </div>
    );
  }

  if (fetchError || !slot) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Slot Non Disponibile</h2>
          <p className="text-sm text-slate-400">
            {fetchError || "Il link potrebbe essere errato o l'offerta non è più attiva."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
          >
            Ricarica Pagina
          </button>
        </div>
      </div>
    );
  }

  const isAlreadyClaimed = slot.status === "claimed" && !claimedResult?.success;
  const isWinner = claimedResult?.success;

  return (
    <div className="min-h-screen bg-[#0d1322] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        
        {/* Top Glow Accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Salon Brand Header */}
        <div className="text-center relative z-10 space-y-1 mb-6">
          <div className="inline-flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-300 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest mb-2 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            Caccia alla Poltrona • Flash Slot
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            {slot.salonName}
          </h1>
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1 font-medium">
            <Store className="w-3.5 h-3.5 text-indigo-400" />
            Prenotazione Rapida Esclusiva
          </p>
        </div>

        {/* SUCCESS STATE */}
        {isWinner ? (
          <div className="space-y-6 text-center animate-fadeIn relative z-10">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/40">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">Posto Aggiudicato! 🎉</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Complimenti <span className="font-bold text-amber-300">{nameInput}</span>! Il tuo appuntamento è stato confermato istantaneamente nel nostro calendario.
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 text-left space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-700/60">
                <span className="text-xs text-slate-400 font-medium">Data & Orario</span>
                <span className="text-sm font-bold text-white flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  {slot.date} alle {slot.time}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-700/60">
                <span className="text-xs text-slate-400 font-medium">Trattamento</span>
                <span className="text-sm font-bold text-amber-300">
                  {slot.serviceName && slot.serviceName !== "Trattamento a scelta" ? slot.serviceName : "Trattamento a scelta"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-700/60">
                <span className="text-xs text-slate-400 font-medium">Stylist</span>
                <span className="text-xs font-semibold text-slate-200">{slot.staffName || "Qualsiasi"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-medium">Condizioni Tariffa</span>
                <span className="text-sm font-bold text-emerald-400">
                  {slot.discountPercent > 0 ? `Sconto Flash -${slot.discountPercent}%` : "Tariffa Standard Salone"}
                </span>
              </div>
            </div>

            <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-2xl p-3.5 text-xs text-indigo-200">
              Ti abbiamo inviato un promemoria sul tuo numero WhatsApp. Ci vediamo in salone!
            </div>
          </div>
        ) : isAlreadyClaimed ? (
          /* ALREADY CLAIMED BY SOMEONE ELSE */
          <div className="space-y-6 text-center animate-fadeIn relative z-10">
            <div className="w-16 h-16 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto">
              <Timer className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Posto Già Assegnato!</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Un altro cliente è stato più veloce di pochi secondi e ha bloccato questo slot.
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 text-xs text-slate-300 space-y-2 text-left">
              <p className="font-bold text-amber-300">💡 Come funziona la Caccia alla Poltrona?</p>
              <p className="text-slate-400 leading-relaxed">
                Quando si libera un posto all'ultimo minuto, inviamo un messaggio a un gruppo selezionato di clienti. Il primo che fa clic e conferma si aggiudica la poltrona!
              </p>
            </div>

            <p className="text-[11px] text-slate-500">
              Rimani sintonizzato su WhatsApp per il prossimo allarme Flash!
            </p>
          </div>
        ) : (
          /* ACTIVE OPEN SLOT READY FOR CLAIM */
          <div className="space-y-6 relative z-10">
            
            {/* Slot Highlight Card */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-850 border border-amber-400/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
              
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${slot.discountPercent > 0 ? "bg-amber-400 text-slate-950" : "bg-indigo-600 text-white"}`}>
                  {slot.discountPercent > 0 ? `Offerta Flash -${slot.discountPercent}%` : "Slot Prioritario"}
                </span>
                <span className="text-xs text-amber-300 font-bold flex items-center gap-1 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Disponibile ORA
                </span>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-indigo-400 shrink-0" />
                  {slot.serviceName && slot.serviceName !== "Trattamento a scelta" ? slot.serviceName : "Trattamento a scelta"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Con {slot.staffName || "Staff Specializzato"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Data</span>
                  <span className="font-bold text-white flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-indigo-400" />
                    {slot.date}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Orario</span>
                  <span className="font-bold text-amber-300 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-amber-400" />
                    {slot.time}
                  </span>
                </div>
              </div>

              {/* Price / Discount Banner */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Condizioni</span>
                  <span className="text-xs text-slate-300 font-medium">
                    {slot.discountPercent > 0 ? `Sconto Flash del ${slot.discountPercent}%` : "Tariffa Standard Salone"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-amber-300 uppercase block font-bold">Vantaggio</span>
                  <span className="text-sm sm:text-base font-black text-emerald-400">
                    {slot.discountPercent > 0 ? `-${slot.discountPercent}% al Check-out` : "Nessun Sovrapprezzo"}
                  </span>
                </div>
              </div>

            </div>

            {/* Error Message if Claim Failed */}
            {claimedResult && !claimedResult.success && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-3 text-xs flex items-start gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p>{claimedResult.error}</p>
              </div>
            )}

            {/* Claiming Form */}
            <form onSubmit={handleClaimSlot} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Il tuo Nome e Cognome
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="es. Mario Rossi"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Numero di Telefono (WhatsApp)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="es. 3401234567"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 transition-colors font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={claiming}
                className="w-full mt-2 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black py-4 px-6 rounded-2xl text-sm sm:text-base uppercase tracking-wider shadow-lg shadow-amber-950/40 hover:shadow-amber-500/20 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {claiming ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Blocco del Posto in Corso...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Aggiudicati il Posto Subito ⚡</span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-slate-400 pt-1">
                🔒 Prenotazione immediata garantita. Nessun pagamento anticipato richiesto.
              </p>
            </form>

          </div>
        )}

      </div>
    </div>
  );
}
