import React, { useState, useEffect, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  TrendingUp, 
  Store, 
  Calendar as CalendarIcon, 
  Award,
  DollarSign,
  Users,
  LayoutDashboard,
  Clock,
  ArrowRight,
  Zap
} from "lucide-react";
import { Appointment } from "../types";
import { isFlashSlotAppointment } from "../utils/flashSlotClient";

interface DashboardScreenProps {
  setCurrentTab: (tab: string) => void;
}

export default function DashboardScreen({ setCurrentTab }: DashboardScreenProps) {
  const { user, salons, services, customers, loading, ownerId, userRole, userSalonIds } = useBusiness();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptsLoading, setApptsLoading] = useState(true);

  // Today ISO String
  const todayISO = useMemo(() => {
    return new Date().toISOString().slice(0, 10);
  }, []);

  // Fetch appointments in real-time
  useEffect(() => {
    if (!user || !ownerId) return;
    setApptsLoading(true);

    const unsub = onSnapshot(
      query(collection(db, "appointments"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Appointment[];
        let filtered = data;
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = data.filter(a => allowedIds.includes(a.salonId));
        }
        setAppointments(filtered);
        setApptsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "appointments");
        setApptsLoading(false);
      }
    );

    return () => unsub();
  }, [user, ownerId, userRole, userSalonIds]);

  // Lookup maps for customer info and salons
  const customerPhoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    customers.forEach((c) => {
      map[c.id] = c.phone || "";
    });
    return map;
  }, [customers]);

  const salonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    salons.forEach((s) => {
      map[s.id] = s.name;
    });
    return map;
  }, [salons]);

  // STAT 1: Incasso Oggi (completed appointments of today)
  const todayRevenue = useMemo(() => {
    return appointments
      .filter((a) => a.date === todayISO && a.status === "completed")
      .reduce((sum, a) => sum + (a.price || 0), 0);
  }, [appointments, todayISO]);

  // STAT 2: Top Staff Oggi
  const topStaffOggi = useMemo(() => {
    const dailyCompleted = appointments.filter((a) => a.date === todayISO && a.status === "completed");
    if (dailyCompleted.length === 0) return "Nessuno (No Check-in)";

    const staffFatturato: Record<string, number> = {};
    dailyCompleted.forEach((a) => {
      const staff = a.staffName || "Staff Generico";
      staffFatturato[staff] = (staffFatturato[staff] || 0) + (a.price || 0);
    });

    let topStaff = "Nessuno";
    let maxRevenue = -1;
    Object.entries(staffFatturato).forEach(([staff, rev]) => {
      if (rev > maxRevenue) {
        maxRevenue = rev;
        topStaff = `${staff} (€${rev.toFixed(0)})`;
      }
    });

    return topStaff;
  }, [appointments, todayISO]);

  // STAT 3: Appuntamenti Odierni / Totali
  const apptStatsText = useMemo(() => {
    const todayTotal = appointments.filter((a) => a.date === todayISO).length;
    const globalTotal = appointments.length;
    return {
      today: todayTotal,
      all: globalTotal
    };
  }, [appointments, todayISO]);

  // Sedi summary with calculations
  const salonsSummary = useMemo(() => {
    return salons.map(salon => {
      const salonAppts = appointments.filter(a => a.salonId === salon.id);
      return {
        ...salon,
        apptsCount: salonAppts.length,
        completedRevenue: salonAppts.filter(a => a.status === "completed").reduce((sum, a) => sum + (a.price || 0), 0)
      };
    });
  }, [salons, appointments]);

  // Maximum bookings/revenue among salons for visual bar rendering scale
  const maxSalonValue = useMemo(() => {
    if (userRole === "receptionist") {
      const counts = salonsSummary.map((s) => s.apptsCount);
      return counts.length > 0 ? Math.max(...counts, 1) : 1;
    } else {
      const revenues = salonsSummary.map((s) => s.completedRevenue);
      return revenues.length > 0 ? Math.max(...revenues, 1) : 1;
    }
  }, [salonsSummary, userRole]);

  // Top salon details
  const topSalon = useMemo(() => {
    if (salonsSummary.length === 0) return null;
    if (userRole === "receptionist") {
      return [...salonsSummary].sort((a, b) => b.apptsCount - a.apptsCount)[0];
    } else {
      return [...salonsSummary].sort((a, b) => b.completedRevenue - a.completedRevenue)[0];
    }
  }, [salonsSummary, userRole]);

  // Sorted upcoming appointments (or latest 3)
  const incomingAppointments = useMemo(() => {
    return [...appointments]
      .sort((a, b) => {
        // Sort chronologically by date then time
        const dateA = a.date || "9999-12-31";
        const dateB = b.date || "9999-12-31";
        const timeA = a.time || "23:59";
        const timeB = b.time || "23:59";
        return `${dateA}T${timeA}`.localeCompare(`${dateB}T${timeB}`);
      })
      .slice(0, 4); // earliest 4 appointments
  }, [appointments]);

  // Helper mapping helper logic for progress bar widths to prevent standard style attributes
  const getProgressBarWidthClass = (revenue: number, maxRevenue: number): string => {
    if (maxRevenue <= 0 || revenue <= 0) return "w-[5%]";
    const percent = Math.min(100, Math.round((revenue / maxRevenue) * 100));
    if (percent >= 90) return "w-full bg-[#1a3a8f]";
    if (percent >= 80) return "w-[80%] bg-[#1a3a8f]";
    if (percent >= 70) return "w-[70%] bg-[#1a3a8f]";
    if (percent >= 60) return "w-[60%] bg-[#1a3a8f] opacity-80";
    if (percent >= 50) return "w-[50%] bg-[#1a3a8f] opacity-75";
    if (percent >= 40) return "w-[40%] bg-[#1a3a8f] opacity-70";
    if (percent >= 30) return "w-[30%] bg-[#1a3a8f] opacity-60";
    if (percent >= 20) return "w-[20%] bg-[#1a3a8f] opacity-50";
    if (percent >= 10) return "w-[10%] bg-[#1a3a8f] opacity-40";
    return "w-[5%] bg-[#1a3a8f] opacity-30";
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "confirmed":
        return "text-emerald-700 bg-emerald-50 border-emerald-100";
      case "cancelled":
        return "text-red-700 bg-red-50 border-red-100";
      case "completed":
        return "text-emerald-700 bg-emerald-50 border-emerald-100";
      default:
        return "text-amber-700 bg-amber-50 border-amber-100"; // pending
    }
  };

  const getStatusLabelText = (status: string) => {
    switch (status) {
      case "confirmed": return "Prestazione Effettuata";
      case "cancelled": return "Annullato";
      case "completed": return "Prestazione Effettuata";
      default: return "In Attesa";
    }
  };

  if (loading || apptsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-64 bg-slate-200/70 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-white border border-slate-200/80 rounded-3xl p-6 h-36 shadow-2xs animate-pulse" />
          ))}
        </div>
        <div className="h-9 w-48 bg-slate-200/70 rounded-2xl animate-pulse" />
        <div className="h-64 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-pageFade">
      
      {/* Title Header Panel */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/10 px-3 py-0.5 rounded-full shadow-2xs">
              {userRole === "receptionist" ? "Dashboard Operativa" : "Controllo Strategico"}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1a2035]">
            {userRole === "receptionist" ? "Panoramica Salone" : "Rapporto Consolidato"}
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm font-medium leading-relaxed max-w-2xl">
            {userRole === "receptionist" ? (
              <>Sessione attiva per l'operatore: <span className="font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full text-xs">{user?.email || "Receptionist"}</span></>
            ) : (
              <>Panoramica aziendale multisede per l'amministratore: <span className="font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full text-xs">{user?.email || "Manager"}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setCurrentTab("appointments")}
            className="bg-[#1a3a8f] hover:bg-[#132c6e] active:scale-[0.98] text-white rounded-2xl px-5 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Apri Agenda</span>
          </button>
        </div>
      </div>

      {/* KPI Cards section (4 Columns Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        
        {userRole === "receptionist" ? (
          <>
            {/* Card 1 for Receptionist: Today's Bookings */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-5">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700 shadow-2xs">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                  Oggi
                </span>
              </div>
              <div>
                <p className="text-3xl font-bold text-[#1a2035] tracking-tight">
                  {apptStatsText.today}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                  Appuntamenti di Oggi
                </p>
              </div>
            </div>

            {/* Card 2 for Receptionist: Total Bookings */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#eef2ff] border border-[#1a3a8f]/10 flex items-center justify-center text-[#1a3a8f] shadow-2xs">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                  Tutti
                </span>
              </div>
              <div>
                <p className="text-3xl font-bold text-[#1a2035] tracking-tight">
                  {apptStatsText.all}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                  Appuntamenti Totali
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Card 1: Revenue today */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#eef2ff] border border-[#1a3a8f]/10 flex items-center justify-center text-[#1a3a8f] shadow-2xs">
                  <DollarSign className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                  Incasso Giorno
                </span>
              </div>
              <div>
                <p className="text-3xl font-bold text-[#1a2035] tracking-tight">
                  €{todayRevenue.toFixed(2)}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                  Incasso Oggi (Check-in)
                </p>
              </div>
            </div>

            {/* Card 2: Bookings Count */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-5">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700 shadow-2xs">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                  {apptStatsText.today} oggi
                </span>
              </div>
              <div>
                <p className="text-3xl font-bold text-[#1a2035] tracking-tight">
                  {apptStatsText.all}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                  Appuntamenti Registrati
                </p>
              </div>
            </div>
          </>
        )}

        {/* Card 3: Salons Count */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex justify-between items-start mb-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shadow-2xs">
              <Store className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
              Filiali
            </span>
          </div>
          <div>
            <p className="text-3xl font-bold text-[#1a2035] tracking-tight">
              {salons.length}
            </p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
              Sedi Attive
            </p>
          </div>
        </div>

        {/* Card 4: Top Earner Staff (Owner) vs Total Customers (Receptionist) */}
        {userRole === "receptionist" ? (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start mb-5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-700 shadow-2xs">
                <Users className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                Anagrafiche
              </span>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#1a2035] tracking-tight">
                {customers.length}
              </p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                Clienti in Rubrica
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start mb-5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-700 shadow-2xs">
                <Award className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                Performance
              </span>
            </div>
            <div>
              <p className="text-lg font-bold text-[#1a2035] truncate leading-tight tracking-tight">
                {topStaffOggi}
              </p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                Top Staff di Oggi
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Main Dual-Panel Grid layout (Table & Rendimento Sedi) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Appointments Table Block (Left col-span-2) */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-3xl shadow-2xs flex flex-col overflow-hidden">
          <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/10 px-2.5 py-0.5 rounded-full shadow-2xs">
                Timeline
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-[#1a2035] mt-1 tracking-tight">
                Prossimi Appuntamenti in Agenda
              </h3>
            </div>
            <button 
              onClick={() => setCurrentTab("appointments")}
              className="bg-[#eef2ff] hover:bg-[#e0e7ff] text-[#1a3a8f] border border-[#1a3a8f]/15 px-3.5 py-2 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer"
            >
              <span>Vedi Tutti</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            {incomingAppointments.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <CalendarIcon className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-[#1a2035]">Nessuna prenotazione imminente registrata</p>
                <p className="text-xs text-slate-400 mt-1">Inserisci un appuntamento in agenda per visualizzare la tabella in tempo reale.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/70">
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Servizio</th>
                    <th className="px-6 py-4">Sede</th>
                    <th className="px-6 py-4">Giorno / Ora</th>
                    <th className="px-6 py-4">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {incomingAppointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="font-bold text-sm text-[#1a2035]">{appt.customerName}</div>
                          {isFlashSlotAppointment(appt) && (
                            <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-900 border border-amber-300/80 font-bold text-[9px] uppercase px-2 py-0.5 rounded-full shadow-2xs">
                              <Zap className="w-2.5 h-2.5 text-amber-600 fill-amber-500" />
                              Flash
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono font-medium mt-0.5">{customerPhoneMap[appt.customerId] || "Senza num."}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-[#1a2035] font-semibold">{appt.serviceName}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{appt.duration} min</div>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                        <span className="inline-block bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-xl">
                          {salonsMap[appt.salonId] || "Sede Generale"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-[#1a2035] font-mono">{appt.time}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase">{appt.date}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center border text-[10px] font-bold uppercase px-3 py-1 rounded-full shadow-2xs ${getStatusStyle(appt.status)}`}>
                          {getStatusLabelText(appt.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Rendimento Sedi with progress bars (Right col-span-1) */}
        <div className="col-span-1 flex flex-col gap-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-2xs flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/10 px-2.5 py-0.5 rounded-full shadow-2xs">
                    Metriche Sedi
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold text-[#1a2035] mt-1 tracking-tight">
                    {userRole === "receptionist" ? "Attività Sedi" : "Rendimento Sedi"}
                  </h3>
                </div>
              </div>

              {salonsSummary.length === 0 ? (
                <div className="text-center p-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                  Nessuna sede configurata per l'analisi.
                </div>
              ) : (
                <div className="space-y-5">
                  {salonsSummary.map((salon) => (
                    <div key={salon.id} className="bg-slate-50/70 border border-slate-100 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-bold text-[#1a2035]">
                        <span className="truncate pr-3">{salon.name}</span>
                        {userRole === "receptionist" ? (
                          <span className="font-mono font-bold text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/15 px-2 py-0.5 rounded-full text-[10px] shadow-2xs">
                            {salon.apptsCount} app.
                          </span>
                        ) : (
                          <span className="font-mono font-bold text-[#1a2035] bg-white border border-slate-200/80 px-2.5 py-0.5 rounded-full text-xs shadow-2xs">
                            €{salon.completedRevenue.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="h-2.5 bg-slate-200/70 rounded-full overflow-hidden p-0.5">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarWidthClass(
                            userRole === "receptionist" ? salon.apptsCount : salon.completedRevenue,
                            maxSalonValue
                          )}`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        <span>{salon.apptsCount} Prenotazioni</span>
                        <span>{userRole === "receptionist" ? "Operativo" : `Incasso €${salon.completedRevenue.toFixed(0)}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Smart dynamic feedback advice callout */}
            <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-[#eef2ff]/60 border border-[#1a3a8f]/15 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0">💡</span>
                <p className="text-xs text-[#1a2035] font-medium leading-relaxed">
                  {userRole === "receptionist" ? (
                    <>
                      La sede più attiva è <span className="font-bold text-[#1a3a8f] underline">{topSalon?.name}</span> con ben <span className="font-bold">{topSalon?.apptsCount}</span> appuntamenti totali in agenda. Continua l'ottimo lavoro di gestione e prenotazione clienti!
                    </>
                  ) : (
                    <>
                      {topSalon && topSalon.completedRevenue > 0 ? (
                        <>
                          La sede di <span className="font-bold text-[#1a3a8f] underline">{topSalon.name}</span> ha registrato le performance maggiori con <span className="font-bold">€{topSalon.completedRevenue.toFixed(0)}</span> di incasso. Considera di promuovere i servizi meno richiesti nelle altre filiali.
                        </>
                      ) : (
                        <>
                          Non hai ancora registrato incassi completati per oggi. Nel pannello <span className="font-bold text-[#1a3a8f]">Agenda</span>, clicca su una prenotazione e seleziona <span className="font-bold">"Completa ⭐"</span> dopo il trattamento per aggiornare lo storico in tempo reale.
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
