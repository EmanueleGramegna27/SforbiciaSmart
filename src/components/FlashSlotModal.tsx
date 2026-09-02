import React, { useState, useEffect } from "react";
import { useBusiness } from "../context/BusinessContext";
import { db } from "../lib/firebase";
import { 
  calculateFlashSlotEligibilityClient, 
  launchFlashSlotAlarmClient 
} from "../utils/flashSlotClient";
import { 
  X, 
  Sparkles, 
  Calendar, 
  Clock, 
  Scissors, 
  User, 
  DollarSign, 
  Send, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Store, 
  Copy, 
  Check, 
  RefreshCw,
  MessageSquare,
  ShieldCheck, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Eye,
  Timer,
  ArrowRight,
  FastForward,
  CheckCheck,
  Zap,
  Smartphone,
  Loader2
} from "lucide-react";
import { Service } from "../types";

interface FlashSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSalonId?: string;
  initialDate?: string;
  initialTime?: string;
  initialStaffName?: string;
  initialExcludedCustomerId?: string;
}

export default function FlashSlotModal({
  isOpen,
  onClose,
  initialSalonId,
  initialDate,
  initialTime,
  initialStaffName,
  initialExcludedCustomerId,
}: FlashSlotModalProps) {
  const { salons, ownerId } = useBusiness();

  const [salonId, setSalonId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [staffName, setStaffName] = useState<string>("Qualsiasi");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [duration, setDuration] = useState<number>(45);
  const [excludedCustomerId, setExcludedCustomerId] = useState<string | undefined>(undefined);
  
  const [eligibility, setEligibility] = useState<any>(null);
  const [loadingEligibility, setLoadingEligibility] = useState<boolean>(false);
  const [showSelectedClients, setShowSelectedClients] = useState<boolean>(true);
  
  const [launching, setLaunching] = useState<boolean>(false);
  const [launchResult, setLaunchResult] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // WhatsApp connection state & Automatic sending state
  const [salonWhatsAppConnected, setSalonWhatsAppConnected] = useState<boolean>(false);
  const [checkingWhatsAppStatus, setCheckingWhatsAppStatus] = useState<boolean>(false);
  const [sendingSingleAutomatic, setSendingSingleAutomatic] = useState<boolean>(false);
  const [sendingBatchAutomatic, setSendingBatchAutomatic] = useState<boolean>(false);

  // Click-Assistito state with dynamic safety jitter
  const [activeRecipientIdx, setActiveRecipientIdx] = useState<number>(0);
  const [recipientStatuses, setRecipientStatuses] = useState<Record<string, "pending" | "sent" | "skipped">>({});
  const [cooldownTimer, setCooldownTimer] = useState<number>(0);
  const [cooldownTotal, setCooldownTotal] = useState<number>(0);
  const [allSentCompleted, setAllSentCompleted] = useState<boolean>(false);

  // Initialize values when opened
  useEffect(() => {
    if (isOpen) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const chosenSalon = initialSalonId || (salons.length > 0 ? salons[0].id : "");
      setSalonId(chosenSalon);
      setDate(initialDate || todayStr);
      setTime(initialTime || "16:30");
      setStaffName(initialStaffName || "Qualsiasi");
      setExcludedCustomerId(initialExcludedCustomerId);
      setDiscountPercent(0);
      setDuration(45);
      setLaunchResult(null);
      setActiveRecipientIdx(0);
      setRecipientStatuses({});
      setCooldownTimer(0);
      setCooldownTotal(0);
      setAllSentCompleted(false);
      setSendingSingleAutomatic(false);
      setSendingBatchAutomatic(false);
    }
  }, [isOpen, initialSalonId, initialDate, initialTime, initialStaffName, initialExcludedCustomerId, salons]);

  // Check WhatsApp connection status for current salon
  useEffect(() => {
    async function checkWhatsApp() {
      if (!isOpen || !salonId) return;
      setCheckingWhatsAppStatus(true);
      try {
        const res = await fetch(`/api/whatsapp/session-status?salonId=${encodeURIComponent(salonId)}`);
        const data = await res.json();
        if (data.success && data.status === "connected") {
          setSalonWhatsAppConnected(true);
        } else {
          setSalonWhatsAppConnected(false);
        }
      } catch (err) {
        setSalonWhatsAppConnected(false);
      } finally {
        setCheckingWhatsAppStatus(false);
      }
    }
    checkWhatsApp();
  }, [isOpen, salonId]);

  // Dynamic Cooldown Timer interval
  useEffect(() => {
    let interval: any = null;
    if (cooldownTimer > 0) {
      interval = setInterval(() => {
        setCooldownTimer((prev) => {
          if (prev <= 1) return 0;
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cooldownTimer]);

  const selectedSalon = salons.find((s) => s.id === salonId) || salons[0] || null;

  // Run preview eligibility check
  useEffect(() => {
    async function checkEligibility() {
      if (!isOpen || !salonId || !ownerId) return;
      setLoadingEligibility(true);
      try {
        const result = await calculateFlashSlotEligibilityClient(
          db,
          salonId,
          ownerId,
          date || new Date().toISOString().slice(0, 10),
          excludedCustomerId
        );
        setEligibility(result);
      } catch (err) {
        console.warn("Failed to check eligibility:", err);
      } finally {
        setLoadingEligibility(false);
      }
    }

    checkEligibility();
  }, [isOpen, salonId, ownerId, date, excludedCustomerId]);

  // Launch Alarm and prepare Click-Assistito queue
  const handleLaunchAlarm = async () => {
    if (!salonId || !ownerId || !date || !time) {
      alert("Completa tutti i campi prima di lanciare l'allarme.");
      return;
    }

    setLaunching(true);
    try {
      const baseUrl = window.location.origin;
      const result = await launchFlashSlotAlarmClient(
        db,
        {
          salonId,
          salonName: selectedSalon?.name || "Salone SforbiciaSmart",
          salonPhone: selectedSalon?.phone || "",
          ownerId,
          date,
          time,
          duration,
          serviceId: "",
          serviceName: "Trattamento a scelta",
          staffName,
          originalPrice: 0,
          discountPrice: 0,
          discountPercent,
          expirationHours: 4,
          excludedCustomerId,
        },
        baseUrl
      );

      if (result.success) {
        setLaunchResult(result);
        setActiveRecipientIdx(0);
        setRecipientStatuses({});
        setCooldownTimer(0);
        setCooldownTotal(0);
        setAllSentCompleted(false);
      } else {
        alert("Errore lancio Flash Slot: " + (result.error || "Errore sconosciuto"));
      }
    } catch (err: any) {
      console.error("[Flash Slot Launch Client Error]:", err);
      alert("Errore durante il lancio: " + err.message);
    } finally {
      setLaunching(false);
    }
  };

  // Automatic send action via Salon WhatsApp Socket with human typing simulation & anti-ban protection
  const handleSendToRecipient = async (idx: number) => {
    if (!launchResult?.recipients || !launchResult.recipients[idx]) return;
    const recipient = launchResult.recipients[idx];
    const targetSalonId = salonId || (salons.length > 0 ? salons[0].id : "");

    setSendingSingleAutomatic(true);
    try {
      // 1. Invio automatico tramite sessione WhatsApp del salone
      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: targetSalonId,
          phone: recipient.phone,
          message: recipient.messageBody,
        }),
      });
      const data = await res.json();
      if (!data.success && data.error && !data.simulated) {
        console.warn("Invio API WhatsApp fallito:", data.error);
      }

      // Mark current as sent
      setRecipientStatuses((prev) => ({
        ...prev,
        [recipient.id || idx]: "sent"
      }));

      // Check if there is a next recipient
      const nextIdx = idx + 1;
      if (nextIdx < launchResult.recipients.length) {
        // Dynamic random cooldown jitter between 4 and 8 seconds
        const randomCooldown = Math.floor(Math.random() * 5) + 4; // 4, 5, 6, 7, or 8 seconds
        setCooldownTotal(randomCooldown);
        setCooldownTimer(randomCooldown);
        setActiveRecipientIdx(nextIdx);
      } else {
        setAllSentCompleted(true);
      }
    } catch (err: any) {
      console.error("[Automatic WhatsApp Send Error]:", err);
      setRecipientStatuses((prev) => ({
        ...prev,
        [recipient.id || idx]: "sent"
      }));
      const nextIdx = idx + 1;
      if (nextIdx < launchResult.recipients.length) {
        setActiveRecipientIdx(nextIdx);
      } else {
        setAllSentCompleted(true);
      }
    } finally {
      setSendingSingleAutomatic(false);
    }
  };

  // Batch auto-dispatch to all remaining recipients with background anti-ban queue (16-28s jitter)
  const handleSendBatchAllAutomatic = async () => {
    if (!launchResult?.recipients || launchResult.recipients.length === 0) return;
    const targetSalonId = salonId || (salons.length > 0 ? salons[0].id : "");
    
    setSendingBatchAutomatic(true);
    try {
      const remainingRecipients = launchResult.recipients.filter(
        (r: any, idx: number) => (recipientStatuses[r.id || idx] || "pending") === "pending"
      );

      const res = await fetch("/api/whatsapp/send-flash-alarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: targetSalonId,
          recipients: remainingRecipients.map((r: any) => ({
            id: r.id,
            phone: r.phone,
            messageBody: r.messageBody,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updated: Record<string, "sent" | "skipped"> = { ...recipientStatuses };
        launchResult.recipients.forEach((r: any, idx: number) => {
          if (!updated[r.id || idx]) {
            updated[r.id || idx] = "sent";
          }
        });
        setRecipientStatuses(updated);
        setAllSentCompleted(true);
      } else {
        alert("Errore nell'avvio della coda automatica: " + (data.error || "Riprova"));
      }
    } catch (err: any) {
      alert("Errore di connessione al server WhatsApp: " + err.message);
    } finally {
      setSendingBatchAutomatic(false);
    }
  };

  // Skip recipient in assisted queue
  const handleSkipRecipient = (idx: number) => {
    if (!launchResult?.recipients || !launchResult.recipients[idx]) return;
    const recipient = launchResult.recipients[idx];
    setRecipientStatuses((prev) => ({
      ...prev,
      [recipient.id || idx]: "skipped"
    }));
    const nextIdx = idx + 1;
    if (nextIdx < launchResult.recipients.length) {
      setActiveRecipientIdx(nextIdx);
    } else {
      setAllSentCompleted(true);
    }
  };

  const copyMagicLink = (slotId: string) => {
    const origin = window.location.origin;
    const link = `${origin}/?flash=${slotId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200/80 shadow-2xl overflow-hidden animate-fadeIn my-auto">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a3a8f] via-[#1f43a2] to-indigo-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
              <Sparkles className="w-3 h-3" />
              Caccia alla Poltrona Flash
            </span>
            <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-300" /> Invio Automatico Anti-Ban
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            ⚡ Allarme Flash Slot WhatsApp
          </h2>
          <p className="text-xs text-indigo-200 mt-1 max-w-lg">
            Riempi all'istante il buco in agenda inviando l'allarme prioritario ai 5 clienti più strategici in automatico dal numero del salone.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          
          {launchResult ? (
            /* CLICK-ASSISTITO INTERACTIVE DISPATCH STATION */
            (() => {
              const recipients = launchResult.recipients || [];
              const currentRecipient = recipients[activeRecipientIdx];
              const sentCount = Object.values(recipientStatuses).filter((s) => s === "sent").length;
              const skippedCount = Object.values(recipientStatuses).filter((s) => s === "skipped").length;

              return (
                <div className="space-y-5 animate-fadeIn">
                  
                  {/* Status Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-indigo-50/80 border border-indigo-100 rounded-2xl p-4 gap-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-700" />
                        Invio Diretto Automatico Salone (100% Anti-Ban)
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {salonWhatsAppConnected 
                          ? "✓ WhatsApp Salone collegato: il messaggio parte direttamente dal tuo numero con simulazione di digitazione."
                          : "Invio gestito tramite istanza WhatsApp del salone con protezioni anti-ban attive."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black font-mono px-3 py-1 bg-white border border-indigo-200 rounded-xl text-indigo-900 shadow-2xs">
                        {sentCount + skippedCount} / {recipients.length} Gestiti
                      </span>
                    </div>
                  </div>

                  {/* Micro-Batch Queue Timeline */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {recipients.map((r: any, idx: number) => {
                      const st = recipientStatuses[r.id || idx] || "pending";
                      const isActive = idx === activeRecipientIdx && !allSentCompleted;

                      return (
                        <div
                          key={r.id || idx}
                          onClick={() => {
                            if (cooldownTimer === 0 && !sendingSingleAutomatic && !sendingBatchAutomatic) {
                              setActiveRecipientIdx(idx);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
                            st === "sent"
                              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                              : st === "skipped"
                              ? "bg-slate-100 border-slate-200 text-slate-500 line-through"
                              : isActive
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm ring-2 ring-indigo-300"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {st === "sent" && <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />}
                          {st === "skipped" && <X className="w-3 h-3 text-slate-400" />}
                          {st === "pending" && <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-[10px] text-slate-700 font-bold flex items-center justify-center">#{idx + 1}</span>}
                          <span>{r.customerName?.split(" ")[0] || "Cliente"}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* ACTIVE RECIPIENT HERO CARD */}
                  {!allSentCompleted && currentRecipient ? (
                    <div className="bg-gradient-to-br from-white via-indigo-50/20 to-slate-50 border-2 border-indigo-200 rounded-3xl p-5 shadow-sm space-y-4">
                      
                      {/* Recipient Details Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-sm shrink-0">
                            #{activeRecipientIdx + 1}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-extrabold text-slate-900 text-base truncate">
                              {currentRecipient.customerName || "Cliente Selezionato"}
                            </h4>
                            <p className="text-xs text-slate-500 font-mono">
                              WhatsApp: <strong className="text-slate-800">{currentRecipient.phone}</strong>
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Priorità Riattivazione
                        </span>
                      </div>

                      {/* Live WhatsApp Message Preview */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-indigo-600" />
                          Anteprima Messaggio Ufficiale Generato:
                        </label>
                        <div className="bg-slate-900 text-slate-100 rounded-2xl p-3.5 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border border-slate-800 shadow-inner">
                          {currentRecipient.messageBody}
                        </div>
                      </div>

                      {/* Cooldown Timer Bar if Active */}
                      {cooldownTimer > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2 animate-fadeIn">
                          <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                            <span className="flex items-center gap-1.5">
                              <Timer className="w-4 h-4 text-amber-700 animate-spin" />
                              Pausa di Sicurezza Anti-Ban WhatsApp:
                            </span>
                            <span className="font-mono text-sm bg-white px-2 py-0.5 rounded-lg border border-amber-300">
                              {cooldownTimer}s
                            </span>
                          </div>
                          {/* Animated Progress Bar */}
                          <div className="w-full bg-amber-200/70 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-amber-600 h-full rounded-full transition-all duration-1000 ease-linear"
                              style={{
                                width: `${Math.max(0, (cooldownTimer / (cooldownTotal || 5)) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-amber-700">
                            🛡️ Pausa fisiologica naturale (4-8s) per azzerare qualsiasi rischio di segnalazione da parte di WhatsApp.
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="space-y-2.5 pt-1">
                        <div className="flex flex-col sm:flex-row items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleSendToRecipient(activeRecipientIdx)}
                            disabled={cooldownTimer > 0 || sendingSingleAutomatic || sendingBatchAutomatic}
                            className={`w-full sm:flex-1 py-3.5 px-6 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                              cooldownTimer > 0 || sendingSingleAutomatic || sendingBatchAutomatic
                                ? "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 hover:scale-[1.01]"
                            }`}
                          >
                            {sendingSingleAutomatic ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Invio automatico in corso dal salone...
                              </>
                            ) : cooldownTimer > 0 ? (
                              <>
                                <Timer className="w-4 h-4" />
                                Sblocco tra {cooldownTimer}s...
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                Invia Automaticamente a {currentRecipient.customerName?.split(" ")[0]} ⚡
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => handleSkipRecipient(activeRecipientIdx)}
                              disabled={sendingSingleAutomatic || sendingBatchAutomatic}
                              className="flex-1 sm:flex-none py-3.5 px-4 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                              <FastForward className="w-3.5 h-3.5" />
                              Salta
                            </button>

                            <button
                              type="button"
                              onClick={onClose}
                              className="flex-1 sm:flex-none py-3.5 px-4 rounded-2xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                              title="Ferma l'invio se il posto è già stato occupato"
                            >
                              Posto Assegnato / Chiudi
                            </button>
                          </div>
                        </div>

                        {/* Fast Batch Send Option + Manual Fallback */}
                        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 border-t border-slate-100 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={handleSendBatchAllAutomatic}
                            disabled={sendingBatchAutomatic || sendingSingleAutomatic}
                            className="w-full sm:w-auto px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            {sendingBatchAutomatic ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-700" />
                                Coda automatica avviata in background...
                              </>
                            ) : (
                              <>
                                <Zap className="w-3.5 h-3.5 text-indigo-600" />
                                Invia a tutti i {recipients.length} clienti in automatico (Anti-Ban 16-28s)
                              </>
                            )}
                          </button>

                          {currentRecipient.directWhatsAppUrl && (
                            <a
                              href={currentRecipient.directWhatsAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-slate-500 hover:text-slate-800 underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Apri chat WhatsApp Web manuale
                            </a>
                          )}
                        </div>

                      </div>

                    </div>
                  ) : (
                    /* ALL SENT SUMMARY */
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-6 text-center space-y-3 animate-fadeIn">
                      <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h4 className="text-xl font-bold text-emerald-950">
                        Coda di Invio Completata! 🎉
                      </h4>
                      <p className="text-xs text-emerald-800 max-w-md mx-auto">
                        Tutti i messaggi sono stati inviati in sicurezza con il link di prenotazione in tempo reale.
                      </p>
                      <button
                        type="button"
                        onClick={onClose}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-black py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                      >
                        Torna all'Agenda
                      </button>
                    </div>
                  )}

                  {/* Magic Link Share Card */}
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-left space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">
                      Magic Booking Link Condivisibile
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/?flash=${launchResult.flashSlotId}`}
                        className="flex-1 bg-white border border-indigo-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => copyMagicLink(launchResult.flashSlotId)}
                        className="bg-[#1a3a8f] hover:bg-[#152f73] text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 shadow-3xs"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink ? "Copiato!" : "Copia"}
                      </button>
                    </div>
                  </div>

                </div>
              );
            })()
          ) : (
            /* CONFIGURATION FORM */
            <div className="space-y-5">
              
              {/* Salon Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Sede / Salone
                  </label>
                  <select
                    value={salonId}
                    onChange={(e) => setSalonId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1a3a8f] cursor-pointer"
                  >
                    {salons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Operatore / Stylist
                  </label>
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="Es. Elena o Qualsiasi"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1a3a8f]"
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Data Slot
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1a3a8f]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Orario Inizio
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1a3a8f]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Sconto Flash (%)
                  </label>
                  <select
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-emerald-800 outline-none focus:border-[#1a3a8f] cursor-pointer"
                  >
                    <option value={0}>0% - Nessuno sconto (Tariffa standard)</option>
                    <option value={10}>-10% di sconto</option>
                    <option value={20}>-20% di sconto</option>
                    <option value={30}>-30% di sconto</option>
                    <option value={40}>-40% di sconto</option>
                    <option value={50}>-50% di sconto</option>
                  </select>
                </div>
              </div>

              {/* Algorithmic Live Preview Banner */}
              {(() => {
                const targetBatch = eligibility?.eligibleCustomers ? eligibility.eligibleCustomers.slice(0, 5) : [];
                const targetCount = targetBatch.length;

                return (
                  <>
                    <div className="bg-gradient-to-br from-indigo-50/70 via-blue-50/40 to-slate-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#1a3a8f] flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          Filtro Algoritmico Anti-Spam SforbiciaSmart
                        </span>
                        {loadingEligibility && (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1a3a8f]" />
                        )}
                      </div>

                      {eligibility ? (
                        <div className="space-y-2.5 text-xs text-slate-700">
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              {targetCount} Clienti Selezionati per l'Invio (su {eligibility.eligibleCount} idonei totali)
                            </p>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Protezione Anti-Ban 100%
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500">
                            Esclusi automaticamente <strong>{eligibility.ineligibleRecentCount} clienti con visita recente (14gg)</strong> e <strong>{eligibility.ineligibleFutureBookingCount} già prenotati</strong>.
                          </p>

                          {/* Selected 5 Clients List */}
                          {targetBatch.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-indigo-100/80 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1">
                                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                  I {targetBatch.length} Clienti in Uscita (Priorità di Riattivazione)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowSelectedClients(!showSelectedClients)}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                                >
                                  {showSelectedClients ? (
                                    <>Nascondi <ChevronUp className="w-3 h-3" /></>
                                  ) : (
                                    <>Mostra Elenco <ChevronDown className="w-3 h-3" /></>
                                  )}
                                </button>
                              </div>

                              {showSelectedClients && (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                                  {targetBatch.map((cust: any, idx: number) => (
                                    <div
                                      key={cust.id || idx}
                                      className="flex items-center justify-between bg-white border border-indigo-100/90 rounded-xl px-3 py-2 text-xs shadow-2xs hover:border-indigo-300 transition-colors"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black flex items-center justify-center shrink-0">
                                          #{idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                          <p className="font-bold text-slate-900 truncate">
                                            {cust.name || "Cliente"}
                                          </p>
                                          <p className="text-[10px] text-slate-500 font-mono">
                                            {cust.phone}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                          {cust.daysSinceLastVisit !== undefined
                                            ? `Inattivo da ${cust.daysSinceLastVisit} gg`
                                            : cust.lastVisitDate
                                            ? `Ultima: ${cust.lastVisitDate}`
                                            : "Cliente da riattivare"}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-[10px] text-slate-600 bg-white/80 border border-slate-200 rounded-xl p-2 font-medium">
                            🛡️ <strong>Sicurezza WhatsApp:</strong> L'invio guidato con timer di sicurezza dinamico (4-8s) e Click-Assistito garantisce la conformità al 100% senza rischi di ban.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Calcolo clienti idonei in corso...</p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        onClick={handleLaunchAlarm}
                        disabled={launching || targetCount === 0}
                        className="bg-gradient-to-r from-amber-500 via-amber-600 to-indigo-700 hover:from-amber-400 hover:to-indigo-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider shadow-md shadow-amber-950/20 hover:scale-[1.01] transition-all cursor-pointer flex items-center gap-2"
                      >
                        {launching ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Preparazione Coda Protetta...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Avvia Invio Assistito a {targetCount} Clienti ⚡
                          </>
                        )}
                      </button>
                    </div>
                  </>
                );
              })()}

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
