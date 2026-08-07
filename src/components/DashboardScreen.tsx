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
  ArrowRight
} from "lucide-react";
import { Appointment } from "../types";

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
        <div className="h-6 w-36 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-white border rounded-2xl p-6 h-32 skeleton" />
          ))}
        </div>
        <div className="h-6 w-44 bg-gray-200 rounded animate-pulse pt-6" />
        <div className="h-44 bg-white border rounded-2xl p-6 skeleton" />
      </div>
    );
  }  return (
    <div className="space-y-8 animate-pageFade">
      
      {/* Title block */}
      <div>
        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
          DASHBOARD GENERALE
        </p>
        <h2 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-[#1a2035]">
          {userRole === "receptionist" ? "Dashboard Operativa" : "Dashboard Strategica"}
        </h2>
        <p className="text-gray-500 text-xs mt-1 font-medium">
          {userRole === "receptionist" ? (
            <>Rapporto operativo per il collaboratore: <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase tracking-widest text-[9px]">{user?.email || "Receptionist"}</span></>
          ) : (
            <>Rapporto consolidato per l'amministratore: <span className="font-bold text-slate-800">{user?.email || "Manager"}</span></>
          )}
        </p>
      </div>

      {/* KPI Cards section (4 Columns Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {userRole === "receptionist" ? (
          <>
            {/* Card 1 for Receptionist: Today's Bookings */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Oggi</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1a2035] tracking-tight">
                  {apptStatsText.today}
                </p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                  Appuntamenti di Oggi
                </p>
              </div>
            </div>

            {/* Card 2 for Receptionist: Total Bookings */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#eef2ff] flex items-center justify-center text-[#1a3a8f]">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-[#1a3a8f] bg-[#eef2ff] px-2 py-0.5 rounded-full">Tutti</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1a2035] tracking-tight">
                  {apptStatsText.all}
                </p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                  Appuntamenti Totali
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Card 1: Revenue today */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#eef2ff] flex items-center justify-center text-[#1a3a8f]">
                  <DollarSign className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-0.5 rounded-full">+12% oggi</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1a2035] tracking-tight">
                  €{todayRevenue.toFixed(2)}
                </p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                  Incasso Oggi
                </p>
              </div>
            </div>

            {/* Card 2: Bookings Count */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                  {apptStatsText.today} oggi
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1a2035] tracking-tight">
                  {apptStatsText.all}
                </p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                  Appuntamenti Totali
                </p>
              </div>
            </div>
          </>
        )}

        {/* Card 3: Salons Count */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              <Store className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#1a2035] tracking-tight">
              {salons.length}
            </p>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
              Sedi Attive
            </p>
          </div>
        </div>

        {/* Card 4: Top Earner Staff (Owner) vs Total Customers (Receptionist) */}
        {userRole === "receptionist" ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1a2035] tracking-tight">
                {customers.length}
              </p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                Clienti in Rubrica
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-[#1a2035] truncate leading-tight tracking-tight">
                {topStaffOggi}
              </p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                Top Staff di Oggi
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Main Dual-Panel Grid layout (Table & Rendimento Sedi) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Appointments Table Block (Left col-span-2) */}
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-serif text-lg font-bold text-[#1a2035]">
              Prossimi Appuntamenti in Agenda
            </h3>
            <button 
              onClick={() => setCurrentTab("appointments")}
              className="text-[#1a3a8f] hover:text-[#152f73] text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
            >
              Vedi Tutti
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            {incomingAppointments.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <CalendarIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-medium">Nessuna prenotazione imminente registrata.</p>
                <p className="text-xs text-gray-300 mt-1">Inserisci un appuntamento per visualizzare la tabella real-time.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100 bg-gray-50/50">
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Servizio</th>
                    <th className="px-6 py-4">Sede</th>
                    <th className="px-6 py-4">Giorno / Ora</th>
                    <th className="px-6 py-4">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {incomingAppointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-sm text-[#1a2035]">{appt.customerName}</div>
                        <div className="text-[10px] text-gray-400 font-semibold">{customerPhoneMap[appt.customerId] || "Senza num."}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 font-medium">{appt.serviceName}</div>
                        <div className="text-[10px] text-gray-400 font-medium">{appt.duration} min</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-700">
                        {salonsMap[appt.salonId] || "Sede Generale"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-800">{appt.time}</div>
                        <div className="text-[9px] text-gray-400 font-bold uppercase">{appt.date}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block border text-[10px] font-bold uppercase px-3 py-1 rounded-full ${getStatusStyle(appt.status)}`}>
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
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex-1">
            <h3 className="font-serif text-lg font-bold text-[#1a2035] mb-4">
              {userRole === "receptionist" ? "Attività Sedi" : "Rendimento Sedi"}
            </h3>

            {salonsSummary.length === 0 ? (
              <div className="text-center p-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                Nessuna sede configurata per l'analisi.
              </div>
            ) : (
              <div className="space-y-6">
                {salonsSummary.map((salon) => (
                  <div key={salon.id} className="space-y-2">
                    <div className="flex justify-between items-end text-xs font-bold text-[#1a2035]">
                      <span className="truncate pr-4">{salon.name}</span>
                      {userRole === "receptionist" ? (
                        <span className="font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-[10px]">
                          {salon.apptsCount} app.
                        </span>
                      ) : (
                        <span className="font-mono">€{salon.completedRevenue.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${getProgressBarWidthClass(
                          userRole === "receptionist" ? salon.apptsCount : salon.completedRevenue,
                          maxSalonValue
                        )}`}
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 font-semibold tracking-wide uppercase">
                      {salon.apptsCount} Prenotazioni Totali
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Smart dynamic feedback advice callout */}
            <div className="mt-8 p-4 rounded-2xl bg-blue-50 border border-blue-100">
              <p className="text-xs text-blue-800 font-medium leading-relaxed">
                💡 {userRole === "receptionist" ? (
                  <>
                    La sede più attiva è <span className="font-bold underline">{topSalon?.name}</span> con ben <span className="font-bold">{topSalon?.apptsCount}</span> appuntamenti totali in agenda. Continua l'ottimo lavoro di gestione e prenotazione clienti!
                  </>
                ) : (
                  <>
                    {topSalon && topSalon.completedRevenue > 0 ? (
                      <>
                        La sede di <span className="font-bold underline">{topSalon.name}</span> ha registrato le performance maggiori con <span className="font-bold">€{topSalon.completedRevenue.toFixed(0)}</span> di incasso. Considera di promuovere i servizi meno richiesti nelle altre filiali.
                      </>
                    ) : (
                      <>
                        Non hai ancora registrato incassi completati per oggi. Nel pannello <span className="font-bold">Agenda</span>, clicca su una prenotazione e seleziona <span className="font-bold">"Completa ⭐"</span> dopo il trattamento per aggiornare lo storico in tempo reale.
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
  );
}
