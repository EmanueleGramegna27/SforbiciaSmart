import React, { useState, useEffect, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { collection, query, where, onSnapshot, addDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Appointment } from "../types";
import { 
  Search, 
  Store, 
  User, 
  Scissors, 
  Calendar, 
  Clock, 
  CreditCard, 
  Coins, 
  TrendingUp, 
  FileSpreadsheet,
  ArrowUpDown,
  Filter,
  AlertCircle,
  Download
} from "lucide-react";
import * as XLSX from "xlsx";
import { PLAN_LIMITS } from "../lib/plans";

export default function PerformancesScreen() {
  const { user, salons, ownerId, userRole, userSalonIds, businessSettings } = useBusiness();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic monthly report tracking states
  const [monthlyReportCount, setMonthlyReportCount] = useState<number>(0);
  const [loadingReportCount, setLoadingReportCount] = useState<boolean>(true);

  // Subscribe to report history for current calendar month
  useEffect(() => {
    if (!ownerId) {
      setLoadingReportCount(false);
      return;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const q = query(
      collection(db, "reports_history"),
      where("ownerId", "==", ownerId),
      where("createdAt", ">=", startOfMonth)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setMonthlyReportCount(snapshot.size);
        setLoadingReportCount(false);
      },
      (error) => {
        console.error("Error reading reports history:", error);
        setLoadingReportCount(false);
      }
    );

    return () => unsub();
  }, [ownerId]);
  
  // Filters & Search
  const [selectedSalonId, setSelectedSalonId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Fetch completed/confirmed appointments in real-time
  useEffect(() => {
    if (!ownerId) return;
    setLoading(true);

    const unsub = onSnapshot(
      query(collection(db, "appointments"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Appointment[];
        
        // Filter appointments that represent recorded performances (completed or confirmed)
        const performances = data.filter(
          a => a.status === "completed" || a.status === "confirmed"
        );

        // Filter based on receptionist permissions if applicable
        let permitted = performances;
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          permitted = performances.filter(a => allowedIds.includes(a.salonId));
        }

        setAppointments(permitted);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "appointments");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [ownerId, userRole, userSalonIds]);

  // Selected Month for monthly basis performances (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  });

  // Helper to format year-month string (YYYY-MM) into Italian month and year
  const getMonthNameItalian = (yearMonthStr: string) => {
    if (!yearMonthStr) return "";
    const parts = yearMonthStr.split("-");
    if (parts.length < 2) return yearMonthStr;
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const monthNames = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return `${monthNames[monthIndex]} ${year}`;
  };

  // Helper to format date into readable Italian style
  const formatDateItalian = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    if (!y || !m || !d) return dateStr;
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    const monthName = months[parseInt(m, 10) - 1] || m;
    return `${parseInt(d, 10)} ${monthName} ${y}`;
  };

  // Filter and Sort performances
  const filteredPerformances = useMemo(() => {
    let result = [...appointments];

    // Filter by Month YYYY-MM
    if (selectedMonth) {
      result = result.filter(p => p.date && p.date.startsWith(selectedMonth));
    }

    // Filter by Salon (Sede)
    if (selectedSalonId !== "all") {
      result = result.filter(p => p.salonId === selectedSalonId);
    }

    // Search query: client name or employee name
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => {
        const matchClient = p.customerName ? p.customerName.toLowerCase().includes(q) : false;
        const matchStaff = p.staffName ? p.staffName.toLowerCase().includes(q) : false;
        const matchService = p.serviceName ? p.serviceName.toLowerCase().includes(q) : false;
        return matchClient || matchStaff || matchService;
      });
    }

    // Sort by Date & Time: newest to oldest
    return result.sort((a, b) => {
      const dateTimeA = `${a.date}T${a.time || "00:00"}`;
      const dateTimeB = `${b.date}T${b.time || "00:00"}`;
      return dateTimeB.localeCompare(dateTimeA);
    });
  }, [appointments, selectedMonth, selectedSalonId, searchQuery]);

  // Allowed list of salons based on userRole permissions
  const allowedSalons = useMemo(() => {
    if (userRole === "receptionist") {
      const allowedIds = userSalonIds || [];
      return salons.filter(s => allowedIds.includes(s.id));
    }
    return salons;
  }, [salons, userRole, userSalonIds]);

  // Calculate Metrics for the current filtered list
  const metrics = useMemo(() => {
    const totalCount = filteredPerformances.length;
    const totalRevenue = filteredPerformances.reduce((sum, p) => sum + (p.price || 0), 0);
    
    let cashCount = 0;
    let cardCount = 0;
    let cashRevenue = 0;
    let cardRevenue = 0;

    filteredPerformances.forEach(p => {
      if (p.paymentMethod === "contanti") {
        cashCount++;
        cashRevenue += p.price || 0;
      } else {
        // default to card/bancomat if not specified or is "bancomat"
        cardCount++;
        cardRevenue += p.price || 0;
      }
    });

    return {
      totalCount,
      totalRevenue,
      cashCount,
      cardCount,
      cashRevenue,
      cardRevenue
    };
  }, [filteredPerformances]);

  // EXCEL EXPORT FOR PERFORMANCES
  const handleExportXLSX = async () => {
    if (!ownerId) return;

    try {
      // Gating check based on current plan limits
      const planKey = businessSettings?.userPlan || "network";
      const limit = PLAN_LIMITS[planKey]?.maxReportsPerMonth ?? Infinity;

      if (limit !== Infinity && monthlyReportCount >= limit) {
        alert(`Spiacenti! Il tuo piano attuale (${PLAN_LIMITS[planKey]?.name || planKey}) consente un massimo di ${limit} report Excel al mese.\n\nHai già effettuato ${monthlyReportCount} esportazioni questo mese.\n\nAggiorna il tuo abbonamento nel tuo Profilo (scheda Abbonamento) per sbloccare esportazioni illimitate!`);
        return;
      }

      const rows = filteredPerformances.map((perf) => {
        const salonObj = salons.find(s => s.id === perf.salonId);
        return {
          "Cliente": perf.customerName || "Cliente Anonimo",
          "Data": perf.date || "",
          "Ora": perf.time || "",
          "Sede": salonObj?.name || "Sede Non Specificata",
          "Servizio / Trattamento": perf.serviceName || "Nessun Servizio",
          "Staff / Collaboratore": perf.staffName || "Qualsiasi",
          "Importo (€)": perf.price || 0,
          "Metodo di Pagamento": perf.paymentMethod || "bancomat"
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Prestazioni");

      ws["!cols"] = [
        { wch: 25 }, // Cliente
        { wch: 15 }, // Data
        { wch: 10 }, // Ora
        { wch: 25 }, // Sede
        { wch: 30 }, // Servizio / Trattamento
        { wch: 25 }, // Staff / Collaboratore
        { wch: 15 }, // Importo (€)
        { wch: 20 }  // Metodo di Pagamento
      ];

      XLSX.writeFile(wb, `SforbiciaSmart_Prestazioni_${selectedMonth}.xlsx`);

      // Log the export in reports_history to increment count
      await addDoc(collection(db, "reports_history"), {
        ownerId,
        reportType: "performances_list",
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Export failure", err);
      alert("Errore nella generazione del foglio Excel.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(n => (
            <div key={n} className="bg-white border border-slate-200/80 rounded-3xl p-6 h-36 skeleton shadow-2xs" />
          ))}
        </div>
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 h-96 skeleton shadow-2xs" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12" id="performances-screen-root">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] text-[#1a3a8f] font-bold uppercase tracking-widest">
            Resoconti e Rendiconti
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1a2035]">
            Rendimento Prestazioni e Cassa
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Visualizza e analizza le prestazioni concluse, i metodi di pagamento utilizzati ed esporta report in Excel per il mese di <span className="font-bold text-[#1a3a8f]">{getMonthNameItalian(selectedMonth)}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Dynamic Monthly Report Limit Indicator */}
          {!loadingReportCount && (
            <div className={`px-3.5 py-2 rounded-2xl border flex items-center gap-2.5 shadow-2xs font-medium transition-all ${
              businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3
                ? "bg-rose-50/90 border-rose-200/80 text-rose-800"
                : "bg-[#eef2ff]/80 border-[#1a3a8f]/15 text-[#1a3a8f]"
            }`}>
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shadow-2xs shrink-0 ${
                businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3 
                  ? "bg-rose-100/80 text-rose-600" 
                  : "bg-white text-[#1a3a8f]"
              }`}>
                <FileSpreadsheet className={`w-3.5 h-3.5 ${businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3 ? "text-rose-500 animate-pulse" : "text-[#1a3a8f]"}`} />
              </div>
              <div className="text-left leading-tight">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Report Mensili</span>
                <span className="text-[11px] font-semibold">
                  {businessSettings?.userPlan === "solo_pro" ? (
                    <span>
                      {monthlyReportCount} / 3 <span className="text-[9px] font-normal text-slate-500">({Math.max(0, 3 - monthlyReportCount)} rimasti)</span>
                    </span>
                  ) : (
                    <span>
                      {monthlyReportCount} / ∞ <span className="text-[9px] font-normal text-emerald-600">(Illimitati)</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExportXLSX}
            disabled={filteredPerformances.length === 0}
            className="flex-1 sm:flex-none border border-[#1a3a8f]/20 bg-[#eef2ff] hover:bg-[#eef2ff]/80 text-[#1a3a8f] rounded-2xl px-4.5 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
            title="Esporta l'elenco delle prestazioni filtrate in .XLSX"
          >
            <Download className="w-4 h-4" />
            <span>Esporta Excel</span>
          </button>
        </div>
      </div>

      {/* Alert if Monthly Report Limit is Reached */}
      {!loadingReportCount && businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3 && (
        <div className="bg-amber-50/90 border border-amber-200/80 text-amber-900 rounded-3xl p-4.5 flex items-start gap-3.5 shadow-2xs animate-fadeIn">
          <div className="w-8 h-8 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700 shrink-0 shadow-2xs mt-0.5">
            <AlertCircle className="w-4.5 h-4.5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Limite Report Mensili Raggiunto</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              Hai raggiunto il limite massimo di <strong>3 esportazioni Excel</strong> per questo mese consentite dal tuo piano <strong>Solo Pro</strong>. 
              Per poter generare ed esportare nuovi report delle prestazioni, effettua l'upgrade al piano <strong>Network</strong> o <strong>Elite AI</strong>.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards section (Apple Bento Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="performances-metrics-grid">
        
        {/* Total Revenue */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-2xs flex items-center gap-4.5 relative overflow-hidden group hover:shadow-xs transition-all" id="metric-revenue-card">
          <div className="w-13 h-13 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center shrink-0 shadow-2xs">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block leading-none">
              Incasso {getMonthNameItalian(selectedMonth)}
            </span>
            <span className="text-2xl font-bold tracking-tight text-[#1a2035] mt-1.5 block">
              €{metrics.totalRevenue.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-500 font-medium block mt-1">
              Su <strong className="text-slate-700">{metrics.totalCount}</strong> prestazioni concluse
            </span>
          </div>
        </div>

        {/* Total Count */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-2xs flex items-center gap-4.5 relative overflow-hidden group hover:shadow-xs transition-all" id="metric-count-card">
          <div className="w-13 h-13 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 flex items-center justify-center shrink-0 shadow-2xs">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block leading-none">
              Prestazioni {getMonthNameItalian(selectedMonth)}
            </span>
            <span className="text-2xl font-bold tracking-tight text-[#1a2035] mt-1.5 block">
              {metrics.totalCount}
            </span>
            <span className="text-[11px] text-slate-500 font-medium block mt-1">
              Servizi registrati in questo mese
            </span>
          </div>
        </div>

        {/* Payment Methods breakdown */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-2xs flex flex-col justify-center gap-3 col-span-1 sm:col-span-2 lg:col-span-1 group hover:shadow-xs transition-all" id="metric-payment-card">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block leading-none">
            Breakdown Metodi Pagamento
          </span>
          <div className="grid grid-cols-2 gap-3 mt-1">
            {/* Cash details */}
            <div className="flex items-center gap-2.5 p-2 rounded-2xl bg-emerald-50/60 border border-emerald-100">
              <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                <Coins className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Contanti</span>
                <span className="text-xs font-bold text-slate-800 block leading-tight">
                  €{metrics.cashRevenue.toFixed(2)}
                </span>
                <span className="text-[9px] text-slate-500 block">({metrics.cashCount} transaz.)</span>
              </div>
            </div>

            {/* Bancomat/Card details */}
            <div className="flex items-center gap-2.5 p-2 rounded-2xl bg-[#eef2ff]/70 border border-[#1a3a8f]/10">
              <div className="w-8 h-8 rounded-xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center shrink-0 shadow-2xs">
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Bancomat</span>
                <span className="text-xs font-bold text-slate-800 block leading-tight">
                  €{metrics.cardRevenue.toFixed(2)}
                </span>
                <span className="text-[9px] text-slate-500 block">({metrics.cardCount} transaz.)</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Control Filters Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4" id="performances-filters-bar">
        
        <div className="flex flex-col md:flex-row md:items-center gap-4 flex-1">
          {/* Salon Selector Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5" id="salon-filter-scroll">
            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 pr-1 mr-1">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              <span>Sede:</span>
            </div>
            <button
              onClick={() => setSelectedSalonId("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                selectedSalonId === "all"
                  ? "bg-[#1a3a8f] text-white shadow-2xs font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              Tutte le Sedi
            </button>
            {allowedSalons.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSalonId(s.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                  selectedSalonId === s.id
                    ? "bg-[#1a3a8f] text-white shadow-2xs font-bold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* Monthly Period Selector */}
          <div className="flex items-center gap-2 bg-slate-50/90 border border-slate-200/80 px-3.5 py-1.5 rounded-2xl shadow-2xs w-fit shrink-0" id="period-filter-container">
            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 pr-1 border-r border-slate-200/80 mr-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Periodo:</span>
            </div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-0 focus:ring-0 p-0 text-xs font-bold text-slate-800 outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Live Search Input */}
        <div className="relative flex-1 lg:max-w-xs xl:max-w-md w-full" id="search-input-container">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca per cliente o collaboratore..."
            className="w-full pl-10 pr-16 py-2 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 bg-slate-50/80 transition-all outline-none"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider cursor-pointer"
            >
              cancella
            </button>
          )}
        </div>

      </div>

      {/* Main List Container */}
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-2xs overflow-hidden" id="performances-list-container">
        
        {/* Table Header / Subtext */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Rendiconto di {getMonthNameItalian(selectedMonth)} (Più recenti in alto)</span>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200/80 shadow-2xs">
            {filteredPerformances.length} risultati
          </span>
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent border-[#1a3a8f]" />
            <span className="text-xs font-bold uppercase tracking-wider">Caricamento prestazioni...</span>
          </div>
        ) : filteredPerformances.length === 0 ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <div className="w-14 h-14 bg-slate-100 border border-slate-200/60 rounded-2xl flex items-center justify-center mb-1 text-slate-400 shadow-2xs">
              <Filter className="w-6 h-6" />
            </div>
            <p className="text-lg font-bold text-[#1a2035] tracking-tight">
              Nessuna prestazione registrata
            </p>
            <p className="text-xs font-medium text-slate-500 max-w-sm leading-relaxed">
              Non è stata trovata alcuna prestazione per i filtri selezionati o non ci sono ancora checkout finalizzati per questo periodo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/40">
                  <th className="px-6 py-3.5">Cliente</th>
                  <th className="px-6 py-3.5">Data & Ora</th>
                  <th className="px-6 py-3.5">Sede</th>
                  <th className="px-6 py-3.5">Servizio / Trattamento</th>
                  <th className="px-6 py-3.5">Staff / Collaboratore</th>
                  <th className="px-6 py-3.5 text-right">Importo</th>
                  <th className="px-6 py-3.5 text-center">Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPerformances.map((perf) => {
                  const salonObj = salons.find(s => s.id === perf.salonId);
                  const isCash = perf.paymentMethod === "contanti";

                  return (
                    <tr 
                      key={perf.id} 
                      className="hover:bg-slate-50/60 transition-colors"
                      id={`perf-row-${perf.id}`}
                    >
                      {/* Customer Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            {perf.customerName ? perf.customerName.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="font-bold text-[#1a2035] block leading-tight text-sm tracking-tight">
                              {perf.customerName || "Cliente Anonimo"}
                            </span>
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-full border border-emerald-200/70 uppercase tracking-wider inline-block mt-1 shadow-2xs">
                              PRESTAZIONE EFFETTUATA
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDateItalian(perf.date)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>ore {perf.time || "--:--"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Sede */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200/70 px-3 py-1 rounded-2xl shadow-2xs">
                          <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{salonObj?.name || "Sede Non Specificata"}</span>
                        </span>
                      </td>

                      {/* Services performed */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 max-w-xs sm:max-w-sm">
                          <div className="flex items-start gap-1.5">
                            <Scissors className="w-3.5 h-3.5 text-[#1a3a8f] shrink-0 mt-0.5" />
                            <span className="text-xs font-semibold text-slate-800 leading-normal">
                              {perf.serviceName || "Nessun Servizio Registrato"}
                            </span>
                          </div>
                          {perf.productsSold && perf.productsSold.length > 0 && (
                            <div className="mt-1 pt-1.5 border-t border-slate-100 flex flex-col gap-1">
                              <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                                📦 Prodotti Venduti:
                              </span>
                              {perf.productsSold.map((p: any, idx: number) => (
                                <div key={idx} className="text-[10px] text-slate-600 flex flex-wrap items-center gap-1 bg-emerald-50/60 px-2 py-0.5 rounded-xl border border-emerald-200/60 shadow-2xs">
                                  <span className="font-bold text-slate-800">{p.name}</span>
                                  <span className="text-slate-400">({p.quantity} pz × €{p.price})</span>
                                  <span className="text-[9px] bg-white px-1.5 py-0.5 rounded-md font-semibold text-slate-600 border border-slate-200/60">venduto da {p.staffName || "Qualsiasi"}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Staff */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200/70 px-3 py-1 rounded-2xl shadow-2xs">
                          {perf.staffName || "Qualsiasi"}
                        </span>
                      </td>

                      {/* Total Price paid */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="font-mono text-sm font-bold text-[#1a2035]">
                          €{perf.price ? perf.price.toFixed(2) : "0.00"}
                        </span>
                      </td>

                      {/* Payment Method badge */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-2xs ${
                          isCash 
                            ? "bg-emerald-50/90 text-emerald-800 border-emerald-200/70" 
                            : "bg-[#eef2ff] text-[#1a3a8f] border-[#1a3a8f]/20"
                        }`}>
                          {isCash ? (
                            <>
                              <Coins className="w-3.5 h-3.5" />
                              <span>Contanti</span>
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Bancomat</span>
                            </>
                          )}
                        </span>
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
