import React, { useState, useEffect } from "react";
import { useBusiness } from "../context/BusinessContext";
import { 
  QrCode, 
  Smartphone, 
  CheckCircle2, 
  RefreshCw, 
  Unlink, 
  Send, 
  AlertCircle, 
  Store, 
  Sparkles, 
  ShieldCheck, 
  MessageSquare,
  HelpCircle
} from "lucide-react";
import { WhatsAppSessionState } from "../types";

export default function WhatsAppSalonManager() {
  const { salons, ownerId } = useBusiness();
  const [selectedSalonId, setSelectedSalonId] = useState<string>("");
  const [sessionState, setSessionState] = useState<WhatsAppSessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Ciao! Questo è un messaggio di prova automatico inviato da SforbiciaSmart tramite WhatsApp.");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Set default salon
  useEffect(() => {
    if (salons.length > 0 && !selectedSalonId) {
      setSelectedSalonId(salons[0].id);
    }
  }, [salons, selectedSalonId]);

  const selectedSalon = salons.find((s) => s.id === selectedSalonId) || salons[0] || null;

  // Fetch session status
  const fetchStatus = async (salonId: string) => {
    if (!salonId) return;
    try {
      const res = await fetch(`/api/whatsapp/session-status?salonId=${encodeURIComponent(salonId)}`);
      const data = await res.json();
      if (data.success) {
        setSessionState({
          salonId: data.salonId,
          salonName: selectedSalon?.name,
          status: data.status,
          qrCode: data.qrCode,
          phoneNumber: data.phoneNumber,
          lastUpdated: data.lastUpdated,
          errorMessage: data.errorMessage,
        });
      }
    } catch (err) {
      console.warn("Failed to query WhatsApp status:", err);
    }
  };

  useEffect(() => {
    if (selectedSalonId) {
      fetchStatus(selectedSalonId);
    }
  }, [selectedSalonId]);

  // Polling loop when connecting or waiting for QR scan
  useEffect(() => {
    if (!selectedSalonId) return;
    if (sessionState?.status === "qr_ready" || sessionState?.status === "connecting" || polling || loading) {
      const interval = setInterval(() => {
        fetchStatus(selectedSalonId);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [selectedSalonId, sessionState?.status, polling, loading]);

  // Start WhatsApp session
  const handleStartSession = async (forceRestart = true) => {
    if (!selectedSalonId) return;
    setLoading(true);
    setPolling(true);
    setSessionState((prev) => prev ? { ...prev, status: "connecting", errorMessage: null } : null);
    try {
      const res = await fetch("/api/whatsapp/init-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: selectedSalonId,
          salonName: selectedSalon?.name,
          ownerId,
          force: forceRestart,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSessionState({
          salonId: data.salonId,
          status: data.status,
          qrCode: data.qrCode,
          phoneNumber: data.phoneNumber,
          lastUpdated: data.lastUpdated,
          errorMessage: data.errorMessage,
        });
      } else {
        alert("Errore avvio WhatsApp: " + (data.error || "Errore sconosciuto"));
      }
    } catch (err: any) {
      alert("Errore durante l'avvio della sessione WhatsApp: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Disconnect session
  const handleDisconnect = async () => {
    if (!confirm("Sei sicuro di voler scollegare la sessione WhatsApp per questo salone?")) return;
    if (!selectedSalonId) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId: selectedSalonId }),
      });
      fetchStatus(selectedSalonId);
    } catch (err: any) {
      alert("Errore disconnessione: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Send Test WhatsApp Message
  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      alert("Inserisci un numero di telefono per il test.");
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: selectedSalonId,
          phone: testPhone.trim(),
          message: testMessage.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: data.simulated 
            ? "Messaggio simulato inviato con successo (la sessione WhatsApp non è ancora accoppiata con un telefono reale)."
            : "Messaggio WhatsApp recapitato con successo al dispositivo!",
        });
      } else {
        setTestResult({
          success: false,
          message: "Errore durante l'invio: " + (data.error || "Errore sconosciuto"),
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: "Errore di connessione: " + err.message,
      });
    } finally {
      setSendingTest(false);
    }
  };

  const isConnected = sessionState?.status === "connected";
  const isQrReady = sessionState?.status === "qr_ready" && sessionState?.qrCode;

  return (
    <div className="space-y-6">
      
      {/* Top Banner Overview */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
              <Smartphone className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">WhatsApp Saloni (Multi-Tenant)</h2>
          </div>
          <p className="text-xs text-slate-500">
            Collega il numero di telefono dedicato del salone o della receptionist per inviare notifiche WhatsApp automatiche a costo zero.
          </p>
        </div>

        {/* Salon Selector */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <Store className="w-4 h-4 text-slate-400 ml-1.5" />
          <span className="text-xs font-bold text-slate-500">Sede:</span>
          <select
            value={selectedSalonId}
            onChange={(e) => setSelectedSalonId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1a3a8f]/20 cursor-pointer"
          >
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Connection Status Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: QR Code & Status */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stato Connessione Sede</span>
              <h3 className="text-lg font-bold text-slate-900">{selectedSalon?.name || "Salone Selezionato"}</h3>
            </div>
            <div>
              {isConnected ? (
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1.5 rounded-full shadow-3xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connesso: +{sessionState?.phoneNumber || "Attivo"}
                </span>
              ) : isQrReady ? (
                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  In attesa di scansione QR
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold px-3 py-1.5 rounded-full">
                  Disconnesso
                </span>
              )}
            </div>
          </div>

          {/* Connected State View */}
          {isConnected ? (
            <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/40 border border-emerald-200/70 rounded-2xl p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">Sessione WhatsApp Attiva & Pronta!</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Il salone è autenticato con il numero <strong className="font-mono text-emerald-800">+{sessionState?.phoneNumber || "Salone"}</strong>. Gli allarmi Flash Slot e i promemoria verranno inviati direttamente da questo account.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-3xs cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Scollega Dispositivo
                </button>
              </div>
            </div>
          ) : isQrReady ? (
            /* QR Code Scan View */
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  QR Code Pronto per la Scansione
                </div>
                <h4 className="text-sm font-bold text-slate-900">Inquadra con il WhatsApp del Salone</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Apri WhatsApp sul telefono ➔ <strong>Impostazioni</strong> ➔ <strong>Dispositivi Collegati</strong> ➔ <strong>Collega un dispositivo</strong>.
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 inline-block shadow-lg relative group">
                <img
                  src={sessionState.qrCode!}
                  alt="WhatsApp QR Code"
                  className="w-56 h-56 mx-auto rounded-lg"
                />
              </div>

              <div className="space-y-2 max-w-sm mx-auto">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1a3a8f]" />
                  In attesa di scansione... (Scansiona subito)
                </div>
                
                <div className="pt-2 flex items-center justify-center gap-2">
                  <button
                    onClick={() => handleStartSession(true)}
                    disabled={loading}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                    Rigenera Codice QR Fresco
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>
              </div>
            </div>
          ) : sessionState?.status === "connecting" || loading ? (
            /* Connecting Progress View */
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-50 text-[#1a3a8f] rounded-2xl flex items-center justify-center mx-auto">
                <RefreshCw className="w-8 h-8 animate-spin text-[#1a3a8f]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">Connessione ai server WhatsApp in corso...</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Generazione delle chiavi crittografiche e del codice QR. Il codice apparirà a schermo tra pochi istanti.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => handleStartSession(true)}
                  disabled={loading}
                  className="text-xs text-slate-500 hover:text-slate-700 font-semibold underline cursor-pointer"
                >
                  Se non compare entro 5 secondi, clicca qui per forzare il riavvio
                </button>
              </div>
            </div>
          ) : (
            /* Disconnected / Start Connection View */
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-50 text-[#1a3a8f] rounded-2xl flex items-center justify-center mx-auto">
                <QrCode className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">Avvia il collegamento WhatsApp per questa sede</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Clicca sul pulsante sottostante per generare il codice QR univoco e collegare il numero del tuo salone.
                </p>
              </div>
              <button
                onClick={() => handleStartSession(true)}
                disabled={loading}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-950/10 hover:scale-[1.01] transition-all cursor-pointer inline-flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generazione QR in corso...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    Genera Codice QR WhatsApp
                  </>
                )}
              </button>
            </div>
          )}

          {/* Quick FAQ / Guide */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-2 text-xs text-slate-600">
            <p className="font-bold text-[#1a3a8f] flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-[#1a3a8f]" />
              Multi-Tenant & Sicurezza Garantita
            </p>
            <p className="leading-relaxed">
              Ogni sede fisica possiede la propria rubrica isolata e la propria sessione WhatsApp dedicata. Non vi è alcuna condivisione di contatti o messaggi tra negozi differenti.
            </p>
          </div>

        </div>

        {/* Right Column: Test Message Sandbox */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-5">
            
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Strumento di Collaudo</span>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <Send className="w-4 h-4 text-emerald-600" />
                Invia Messaggio di Prova
              </h3>
            </div>

            <form onSubmit={handleSendTest} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Numero di Destinazione (es. tuo cellulare)
                </label>
                <input
                  type="tel"
                  required
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="es. 3401234567"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-[#1a3a8f] transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Testo del Messaggio
                </label>
                <textarea
                  rows={3}
                  required
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 outline-none focus:border-[#1a3a8f] transition-all"
                />
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${testResult.success ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <p>{testResult.message}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={sendingTest}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {sendingTest ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Invio in corso...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Invia WhatsApp di Prova
                  </>
                )}
              </button>
            </form>

          </div>
        </div>

      </div>

    </div>
  );
}
