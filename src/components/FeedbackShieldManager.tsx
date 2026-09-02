import React, { useState, useEffect, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { 
  ShieldCheck, 
  Star, 
  Send, 
  Smartphone, 
  MessageSquare, 
  ExternalLink, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  MessageCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Search,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  Sliders
} from "lucide-react";
import { collection, doc, setDoc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function FeedbackShieldManager() {
  const { salons, customers, ownerId } = useBusiness();
  const [selectedSalonId, setSelectedSalonId] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [testChannel, setTestChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  
  // UI Tabs / Accordion for clean view
  const [showTestingStation, setShowTestingStation] = useState(false);

  // Real-time list of feedback requests
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tableSalonFilter, setTableSalonFilter] = useState<string>("all");
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Dynamic tick every 10 seconds for real-time countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Helper to compute minutes remaining
  const getRemainingMinutesText = (scheduledFor?: string, createdAt?: string) => {
    let targetMs: number;
    if (scheduledFor) {
      targetMs = new Date(scheduledFor).getTime();
    } else if (createdAt) {
      targetMs = new Date(createdAt).getTime() + 40 * 60 * 1000;
    } else {
      targetMs = currentTime + 40 * 60 * 1000;
    }

    const diffMs = targetMs - currentTime;
    if (diffMs <= 0) {
      return "invio imminente";
    }
    const mins = Math.ceil(diffMs / (60 * 1000));
    if (mins <= 1) {
      return "meno di 1 min";
    }
    return `tra ${mins} min`;
  };

  // Default to first salon if available
  useEffect(() => {
    if (salons.length > 0 && !selectedSalonId) {
      setSelectedSalonId(salons[0].id);
    }
  }, [salons, selectedSalonId]);

  // Filtered customer list for selected salon
  const salonCustomers = useMemo(() => {
    if (!selectedSalonId) return customers;
    return customers.filter(c => c.salonId === selectedSalonId);
  }, [customers, selectedSalonId]);

  // Set default customer for testing
  useEffect(() => {
    if (salonCustomers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(salonCustomers[0].id);
    } else if (salonCustomers.length === 0) {
      setSelectedCustomerId("");
    }
  }, [salonCustomers, selectedCustomerId]);

  const selectedSalonObj = useMemo(() => {
    return salons.find(s => s.id === selectedSalonId) || salons[0] || null;
  }, [salons, selectedSalonId]);

  const selectedCustomerObj = useMemo(() => {
    return salonCustomers.find(c => c.id === selectedCustomerId) || salonCustomers[0] || null;
  }, [salonCustomers, selectedCustomerId]);

  // Check if WhatsApp is connected for the selected salon
  const isWhatsAppConnected = Boolean(
    selectedSalonObj?.whatsappConnected || 
    selectedSalonObj?.whatsappStatus === "connected" ||
    selectedSalonObj?.whatsappSessionActive
  );

  // Fetch feedback requests from server store
  const fetchServerRequests = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch(`/api/feedback-shield/list?salonId=all&ownerId=${ownerId || ""}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setFeedbackList((prev) => {
          const map = new Map<string, any>();
          prev.forEach((it) => {
            const k = it.token || it.id;
            if (k) map.set(k, it);
          });
          json.data.forEach((it: any) => {
            const k = it.token || it.id;
            if (k) {
              const existing = map.get(k);
              map.set(k, { ...existing, ...it });
            }
          });
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
        });
      }
    } catch (e) {
      console.warn("Failed to fetch server feedback list:", e);
    } finally {
      setIsRefreshing(false);
      setLoadingList(false);
    }
  };

  // Poll server feedback list every 3 seconds for instant updates
  useEffect(() => {
    if (!ownerId) return;
    fetchServerRequests();
    const interval = setInterval(fetchServerRequests, 3000);
    return () => clearInterval(interval);
  }, [ownerId]);

  // Subscribe to real-time feedback requests from Firestore as well
  useEffect(() => {
    if (!ownerId) return;
    const q = query(
      collection(db, "feedback_shield_requests"),
      where("ownerId", "==", ownerId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as any[];
        if (items.length > 0) {
          setFeedbackList((prev) => {
            const map = new Map<string, any>();
            prev.forEach((it) => {
              const k = it.token || it.id;
              if (k) map.set(k, it);
            });
            items.forEach((it) => {
              const k = it.token || it.id;
              if (k) {
                const existing = map.get(k);
                map.set(k, { ...existing, ...it });
              }
            });
            return Array.from(map.values()).sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
          });
        }
        setLoadingList(false);
      },
      (err) => {
        console.debug("Firestore feedback sync notice:", err.message);
        setLoadingList(false);
      }
    );
    return () => unsub();
  }, [ownerId]);

  // Handle resolving an alert
  const handleResolveAlert = async (tokenOrId: string) => {
    try {
      const res = await fetch("/api/feedback-shield/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tokenOrId }),
      });
      const json = await res.json();
      if (json.success) {
        fetchServerRequests();
      }
    } catch (e) {
      console.warn("Resolve alert error:", e);
    }
  };

  // Immediate test send handler
  const handleSendInstantTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSalonObj) {
      setErrorMsg("Seleziona un salone.");
      return;
    }
    if (!selectedCustomerObj) {
      setErrorMsg("Seleziona un cliente per il test.");
      return;
    }

    setSendingTest(true);
    setErrorMsg("");
    setTestResult(null);

    try {
      const res = await fetch("/api/feedback-shield/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: selectedSalonObj.id,
          salonName: selectedSalonObj.name,
          ownerId: ownerId || "",
          appointmentId: "test_manual_" + Date.now(),
          customerId: selectedCustomerObj.id,
          customerName: selectedCustomerObj.name,
          customerPhone: selectedCustomerObj.phone,
          serviceName: "Servizio di Prova",
          staffName: "Staff di Prova",
          googleReviewUrl: selectedSalonObj.googleReviewUrl || "",
          channel: testChannel,
          delayMinutes: 0, // 0 = Instant Test
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult(data);

        // Sync into Firestore
        if (ownerId && data.id) {
          try {
            await setDoc(doc(db, "feedback_shield_requests", data.id), {
              id: data.id,
              salonId: selectedSalonObj.id,
              salonName: selectedSalonObj.name,
              ownerId: ownerId,
              appointmentId: "test_manual_" + Date.now(),
              customerId: selectedCustomerObj.id,
              customerName: selectedCustomerObj.name,
              customerPhone: selectedCustomerObj.phone,
              serviceName: "Servizio di Prova",
              staffName: "Staff di Prova",
              googleReviewUrl: selectedSalonObj.googleReviewUrl || "",
              channel: testChannel,
              status: data.status || "sent",
              scheduledFor: data.scheduledFor || new Date().toISOString(),
              sentAt: new Date().toISOString(),
              token: data.token,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          } catch (syncErr) {
            console.warn("Client Firestore sync notice:", syncErr);
          }
        }
      } else {
        setErrorMsg(data.error || "Impossibile inviare il test del Filtro Verità.");
      }
    } catch (err: any) {
      setErrorMsg("Errore di connessione: " + err.message);
    } finally {
      setSendingTest(false);
    }
  };

  // Filtered requests
  const filteredList = useMemo(() => {
    return feedbackList.filter(item => {
      if (tableSalonFilter !== "all" && item.salonId && item.salonId !== tableSalonFilter) {
        return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (item.customerName || "").toLowerCase().includes(q);
        const matchPhone = (item.customerPhone || "").toLowerCase().includes(q);
        const matchNotes = (item.feedbackNotes || "").toLowerCase().includes(q);
        const matchSalon = (item.salonName || "").toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchNotes && !matchSalon) return false;
      }
      return true;
    });
  }, [feedbackList, tableSalonFilter, statusFilter, searchQuery]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = feedbackList.length;
    const positive = feedbackList.filter(i => i.status === "answered_positive" || i.answer === "positive").length;
    const negative = feedbackList.filter(i => i.status === "answered_negative" || i.answer === "negative").length;
    const pending = feedbackList.filter(i => i.status === "scheduled" || i.status === "sent" || (!i.answer && !i.status?.startsWith("answered"))).length;
    const rate = total > 0 ? Math.round((positive / Math.max(1, positive + negative)) * 100) : 100;
    return { total, positive, negative, pending, rate };
  }, [feedbackList]);

  // Intercepted unsatisfied feedbacks that need owner attention
  const activeAlerts = useMemo(() => {
    return feedbackList.filter(
      (i) => (i.status === "answered_negative" || i.answer === "negative") && !i.feedbackNotes?.includes("[Gestito")
    );
  }, [feedbackList]);

  return (
    <div className="space-y-5 animate-fadeIn max-w-7xl mx-auto pb-10">
      
      {/* 1. Header compatto con statistiche essenziali */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Protezione Google 5 Stelle
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Filtro Verità & Recensioni
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Invia automaticamente un messaggio discreto dopo la cassa: porta solo chi è soddisfatto su Google Maps e blocca le lamentele in privato.
          </p>
        </div>

        {/* 4 Statistiche compatte */}
        <div className="grid grid-cols-4 gap-2 shrink-0">
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-2 text-center min-w-[70px]">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Totali</div>
            <div className="text-lg font-black text-white">{stats.total}</div>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl px-3 py-2 text-center min-w-[70px]">
            <div className="text-[10px] font-bold text-emerald-400 uppercase">5 Stelle</div>
            <div className="text-lg font-black text-emerald-400">{stats.positive}</div>
          </div>
          <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl px-3 py-2 text-center min-w-[70px]">
            <div className="text-[10px] font-bold text-amber-400 uppercase">Protette</div>
            <div className="text-lg font-black text-amber-400">{stats.negative}</div>
          </div>
          <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl px-3 py-2 text-center min-w-[70px]">
            <div className="text-[10px] font-bold text-indigo-300 uppercase">Soddisfaz.</div>
            <div className="text-lg font-black text-indigo-200">{stats.rate}%</div>
          </div>
        </div>
      </div>

      {/* 2. Banner Avviso se WhatsApp Salone non è ancora connesso */}
      {!isWhatsAppConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1 flex-1">
            <div className="font-bold text-amber-950 flex items-center gap-2">
              Dispositivo WhatsApp del Salone non collegato
            </div>
            <p className="text-amber-800 leading-relaxed">
              Il sistema programma correttamente i link del Filtro Verità alla cassa, ma i messaggi WhatsApp automatici potranno partire fisicamente solo dopo aver inquadrato il QR Code WhatsApp nella sezione <strong>Impostazioni & Canali</strong>.
            </p>
          </div>
        </div>
      )}

      {/* 3. Box Alert Critiche Intercettate (Visibile solo se ci sono clienti insoddisfatti) */}
      {activeAlerts.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
              <h3 className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                {activeAlerts.length} {activeAlerts.length === 1 ? "Critica Intercettata in Privato" : "Critiche Intercettate in Privato"}
              </h3>
            </div>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
              Bloccata prima di Google Maps
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAlerts.map((alert) => (
              <div key={alert.id || alert.token} className="bg-white rounded-xl p-3.5 border border-rose-200 shadow-2xs space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900">{alert.customerName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">📞 {alert.customerPhone}</div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {alert.updatedAt ? new Date(alert.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Oggi"}
                  </span>
                </div>

                <div className="p-2.5 bg-rose-50/70 border border-rose-100 rounded-lg text-xs text-slate-800 italic">
                  "{alert.feedbackNotes || "Nessun testo aggiunto (ha cliccato su 'Qualcosa non va')"}"
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={`https://wa.me/${(alert.customerPhone || "").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Ciao ${alert.customerName}, ho letto la tua segnalazione riguardo al tuo ultimo appuntamento da noi. Ci teniamo che tu sia soddisfatta al 100%, posso chiamarti per risolvere?`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold text-center flex items-center justify-center gap-1.5 transition"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Scrivi su WhatsApp
                  </a>
                  <button
                    onClick={() => handleResolveAlert(alert.token || alert.id)}
                    className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Risolto
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Pannello a Scomparsa: Test Rapido & Configurazione (Mantiene la pagina pulita) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <button
          onClick={() => setShowTestingStation(!showTestingStation)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                Stazione di Test Istantaneo & Simulazione
                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Opzionale
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Prova l'esperienza cliente su smartphone senza attendere i 40 minuti della cassa
              </div>
            </div>
          </div>
          <div className="text-slate-400 p-1">
            {showTestingStation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showTestingStation && (
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 space-y-4">
            <form onSubmit={handleSendInstantTest} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Salone */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Salone</label>
                <select
                  value={selectedSalonId}
                  onChange={(e) => setSelectedSalonId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-medium outline-none focus:border-indigo-600"
                >
                  {salons.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Cliente */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Cliente</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-medium outline-none focus:border-indigo-600"
                >
                  {salonCustomers.slice(0, 30).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              {/* Bottone Invio */}
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={sendingTest || salonCustomers.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-2.5 px-4 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {sendingTest ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Invia Test Istantaneo
                    </>
                  )}
                </button>
              </div>
            </form>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                {errorMsg}
              </div>
            )}

            {testResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="text-emerald-900 font-medium">
                  ✓ Test generato! Clicca per visualizzare la schermata cliente:
                </div>
                <a
                  href={testResult.feedbackLink}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
                >
                  <span>Apri Schermata</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Registro Principale Richieste & Risposte (Tabella pulita e chiara) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Registro Risposte & Monitoraggio Cassa
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tutti i clienti che hanno ricevuto o stanno per ricevere la richiesta di feedback.
            </p>
          </div>

          {/* Ricerca e Filtri */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-600 w-36 sm:w-44"
              />
            </div>

            {/* Selettore Salone per il Registro */}
            <select
              value={tableSalonFilter}
              onChange={(e) => setTableSalonFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="all">Tutti i Saloni</option>
              {salons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Filtro Stato */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="all">Tutti gli stati</option>
              <option value="answered_positive">⭐ 5 Stelle Google</option>
              <option value="answered_negative">💬 Critica Privata</option>
              <option value="scheduled">🕒 In Coda (In attesa invio)</option>
              <option value="sent">✉️ Inviato</option>
            </select>

            <button
              onClick={() => fetchServerRequests()}
              disabled={isRefreshing}
              className="p-1.5 text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              title="Ricarica lista"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tabella con Scroll Interno */}
        {loadingList ? (
          <div className="py-8 text-center text-slate-400 text-xs font-semibold">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-1 text-indigo-600" />
            Caricamento registro...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-10 text-center max-w-sm mx-auto space-y-1.5">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-700 text-xs">Nessun feedback presente</div>
            <p className="text-[11px] text-slate-500">
              Le richieste verranno visualizzate automaticamente ogni volta che chiudi una cassa.
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto overflow-x-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-2xs">
                <tr className="border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="py-3 px-3">Cliente</th>
                  <th className="py-3 px-3">Stato Cassa / Invio</th>
                  <th className="py-3 px-3">Esito Filtro Verità</th>
                  <th className="py-3 px-3">Nota del Cliente</th>
                  <th className="py-3 px-3 text-right">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredList.map((item) => {
                  const isPositive = item.status === "answered_positive" || item.answer === "positive";
                  const isNegative = item.status === "answered_negative" || item.answer === "negative";

                  return (
                    <tr key={item.id || item.token} className="hover:bg-slate-50/60 transition">
                      {/* Cliente */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{item.customerName}</span>
                          {item.salonName && (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                              {item.salonName}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{item.customerPhone}</div>
                      </td>

                      {/* Stato Invio */}
                      <td className="py-3 px-3">
                        {item.status === "scheduled" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 font-bold text-[10px] border border-purple-200/80 shadow-2xs whitespace-nowrap">
                            <Clock className="w-3 h-3 text-purple-600 animate-pulse shrink-0" />
                            <span>In Coda ({getRemainingMinutesText(item.scheduledFor, item.createdAt)})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium text-[10px] whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3 text-indigo-600 shrink-0" /> Inviato
                          </span>
                        )}
                      </td>

                      {/* Esito */}
                      <td className="py-3 px-3">
                        {isPositive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                            <ThumbsUp className="w-3 h-3 text-emerald-600" />
                            ⭐⭐⭐⭐⭐ 5 Stelle Google
                          </span>
                        ) : isNegative ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 font-bold text-[11px] border border-rose-200">
                            <ThumbsDown className="w-3 h-3 text-rose-600" />
                            Critica Privata Intercettata
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            In attesa di risposta
                          </span>
                        )}
                      </td>

                      {/* Note */}
                      <td className="py-3 px-3 max-w-xs">
                        {item.feedbackNotes ? (
                          <div className="p-1.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-900 text-[11px] font-medium truncate">
                            "{item.feedbackNotes}"
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Link */}
                      <td className="py-3 px-3 text-right">
                        <a
                          href={`/?feedback=${item.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                        >
                          <span>Apri</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
