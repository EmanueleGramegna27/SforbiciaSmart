import React, { useState, useEffect, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import PremiumGate from "./PremiumGate";
import { 
  Percent, 
  TrendingUp, 
  User, 
  Scissors, 
  Package, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  DollarSign, 
  AlertCircle, 
  Loader2,
  Building2,
  Users
} from "lucide-react";
import { Appointment, TeamMember } from "../types";

interface CollaboratorMonthlySummary {
  staffName: string;
  role: string;
  serviceCommissions: number;
  productCommissions: number;
  totalCommissions: number;
  servicesPerformedCount: number;
  productsSoldCount: number;
  servicesDetail: Array<{
    date: string;
    customerName: string;
    serviceName: string;
    price: number;
    pct: number;
    earned: number;
  }>;
  productsDetail: Array<{
    date: string;
    customerName: string;
    productName: string;
    price: number;
    qty: number;
    pct: number;
    earned: number;
  }>;
}

interface CommissionsScreenProps {
  setCurrentTab?: (tab: string) => void;
}

export default function CommissionsScreen({ setCurrentTab }: CommissionsScreenProps = {}) {
  const { user, salons, services, ownerId, userRole, userSalonIds, businessSettings } = useBusiness();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [productSales, setProductSales] = useState<any[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date selection: Default to current year and month (YYYY-MM)
  const currentYYYYMM = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  };
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYYYYMM());
  const [selectedSalonId, setSelectedSalonId] = useState<string>("all");
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  // Subscribe to Team
  useEffect(() => {
    if (!ownerId) return;
    const q = query(collection(db, "team"), where("ownerId", "==", ownerId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TeamMember[];
        // Deduplicate team members by email to prevent showing clones
        const uniqueMap = new Map<string, TeamMember>();
        fetched.forEach(m => {
          const emailKey = m.email?.trim().toLowerCase();
          if (emailKey) {
            const existing = uniqueMap.get(emailKey);
            if (!existing || m.id === emailKey) {
              uniqueMap.set(emailKey, m);
            }
          } else {
            uniqueMap.set(m.id, m);
          }
        });
        setTeam(Array.from(uniqueMap.values()));
      },
      (error) => {
        console.error("Error fetching team in commissions:", error);
        handleFirestoreError(error, OperationType.LIST, "team");
      }
    );
    return () => unsubscribe();
  }, [ownerId]);

  // Subscribe to Completed/Confirmed Appointments
  useEffect(() => {
    if (!ownerId) return;
    const q = query(
      collection(db, "appointments"), 
      where("ownerId", "==", ownerId)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Appointment[];
        // Keep completed and confirmed appointments for commissions calculation
        const validAppts = fetched.filter(a => a.status === "completed" || a.status === "confirmed");
        setAppointments(validAppts);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching appointments in commissions:", error);
        handleFirestoreError(error, OperationType.LIST, "appointments");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [ownerId]);

  // Subscribe to Product Sales
  useEffect(() => {
    if (!ownerId) return;
    const q = query(collection(db, "product_sales"), where("ownerId", "==", ownerId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProductSales(fetched);
      },
      (error) => {
        console.error("Error fetching product sales in commissions:", error);
        handleFirestoreError(error, OperationType.LIST, "product_sales");
      }
    );
    return () => unsubscribe();
  }, [ownerId]);

  // Filter salons allowed for receptionist constraint
  const allowedSalons = useMemo(() => {
    if (userRole === "receptionist" && userSalonIds && userSalonIds.length > 0) {
      return salons.filter(s => userSalonIds.includes(s.id));
    }
    return salons;
  }, [salons, userRole, userSalonIds]);

  // Calculate Aggregations for the chosen Year-Month and selected Salon
  const monthlyData = useMemo(() => {
    const summaryMap: Record<string, CollaboratorMonthlySummary> = {};

    // Helper to initialize staff summary
    const getOrInitSummary = (name: string): CollaboratorMonthlySummary => {
      const trimmed = name.trim();
      if (!summaryMap[trimmed]) {
        const teamMember = team.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
        const roleLabel = teamMember 
          ? (teamMember.role === "receptionist" ? "Receptionist" : "Collaboratore") 
          : "Esterno / Altro";
        
        summaryMap[trimmed] = {
          staffName: trimmed,
          role: roleLabel,
          serviceCommissions: 0,
          productCommissions: 0,
          totalCommissions: 0,
          servicesPerformedCount: 0,
          productsSoldCount: 0,
          servicesDetail: [],
          productsDetail: []
        };
      }
      return summaryMap[trimmed];
    };

    // 1. Process Services Performed on Completed/Confirmed Appointments
    appointments.forEach((appt) => {
      // Filter by Month YYYY-MM
      if (!appt.date || !appt.date.startsWith(selectedMonth)) return;
      // Filter by SalonId
      if (selectedSalonId !== "all" && appt.salonId !== selectedSalonId) return;
      // If receptionist logged in, constrain to receptionist allowed salons
      if (userRole === "receptionist" && userSalonIds && !userSalonIds.includes(appt.salonId)) return;

      // Check if new array schema of sub-services performed exists
      if (appt.servicesPerformed && Array.isArray(appt.servicesPerformed) && appt.servicesPerformed.length > 0) {
        appt.servicesPerformed.forEach((perf) => {
          const rawStaff = perf.staffName || "Qualsiasi";
          const staffNames = rawStaff.split(",").map(n => n.trim()).filter(Boolean);
          const staffCount = staffNames.length;
          
          const totalCommEarned = perf.commissionEarned || 0;
          const splitCommEarned = staffCount > 0 ? totalCommEarned / staffCount : 0;
          const pct = perf.commissionPercentage || 0;

          staffNames.forEach((staff) => {
            const staffSummary = getOrInitSummary(staff);
            staffSummary.servicesPerformedCount += 1;
            staffSummary.serviceCommissions += splitCommEarned;
            staffSummary.totalCommissions += splitCommEarned;
            staffSummary.servicesDetail.push({
              date: appt.date,
              customerName: appt.customerName || "Cliente Anonimo",
              serviceName: perf.serviceName || "Servizio generico",
              price: perf.price || 0,
              pct: pct,
              earned: splitCommEarned
            });
          });
        });
      } else {
        // Fallback / Dynamic calculation for legacy or confirmed appointments with missing servicesPerformed
        const sIds = (appt.serviceId || "").split(",").map(id => id.trim()).filter(Boolean);
        const rawStaff = appt.staffName || "Qualsiasi";
        const staffNames = rawStaff.split(",").map(n => n.trim()).filter(Boolean);
        const staffCount = staffNames.length;

        if (sIds.length > 0 && staffCount > 0) {
          if (sIds.length === 1) {
            const sId = sIds[0];
            const srv = services.find(s => s.id === sId);
            const pct = srv?.commissionPercentage || 0;
            const totalCommEarned = appt.price * (pct / 100);
            const splitCommEarned = totalCommEarned / staffCount;

            staffNames.forEach((staff) => {
              const staffSummary = getOrInitSummary(staff);
              staffSummary.servicesPerformedCount += 1;
              staffSummary.serviceCommissions += splitCommEarned;
              staffSummary.totalCommissions += splitCommEarned;
              staffSummary.servicesDetail.push({
                date: appt.date,
                customerName: appt.customerName || "Cliente Anonimo",
                serviceName: appt.serviceName || "Servizio generico",
                price: appt.price,
                pct: pct,
                earned: splitCommEarned
              });
            });
          } else {
            // Distribute total actual price proportionally among matching services
            const matchedServices = sIds.map(id => services.find(s => s.id === id)).filter(Boolean);
            const basePriceSum = matchedServices.reduce((sum, s) => sum + (s.price || 0), 0) || 1;

            matchedServices.forEach((srv) => {
              const srvActualPrice = appt.price * ((srv.price || 0) / basePriceSum);
              const pct = srv.commissionPercentage || 0;
              const totalCommEarned = srvActualPrice * (pct / 100);
              const splitCommEarned = totalCommEarned / staffCount;

              staffNames.forEach((staff) => {
                const staffSummary = getOrInitSummary(staff);
                staffSummary.servicesPerformedCount += 1;
                staffSummary.serviceCommissions += splitCommEarned;
                staffSummary.totalCommissions += splitCommEarned;
                staffSummary.servicesDetail.push({
                  date: appt.date,
                  customerName: appt.customerName || "Cliente Anonimo",
                  serviceName: srv.name || "Servizio generico",
                  price: srvActualPrice,
                  pct: pct,
                  earned: splitCommEarned
                });
              });
            });
          }
        }
      }
    });

    // 2. Process Product Sales with split calculation
    productSales.forEach((sale) => {
      // Filter by Month YYYY-MM
      if (!sale.date || !sale.date.startsWith(selectedMonth)) return;
      // Filter by SalonId
      if (selectedSalonId !== "all" && sale.salonId !== selectedSalonId) return;
      // If receptionist logged in, constrain to receptionist allowed salons
      if (userRole === "receptionist" && userSalonIds && !userSalonIds.includes(sale.salonId)) return;

      const rawStaff = sale.staffName || "Qualsiasi";
      const staffNames = rawStaff.split(",").map(n => n.trim()).filter(Boolean);
      const staffCount = staffNames.length;

      const totalCommEarned = sale.commissionEarned || 0;
      const splitCommEarned = staffCount > 0 ? totalCommEarned / staffCount : 0;
      const pct = sale.commissionPercentage || 0;

      staffNames.forEach((staff) => {
        const staffSummary = getOrInitSummary(staff);
        const qty = Number(sale.quantity || 1);
        staffSummary.productsSoldCount += qty;
        staffSummary.productCommissions += splitCommEarned;
        staffSummary.totalCommissions += splitCommEarned;
        staffSummary.productsDetail.push({
          date: sale.date,
          customerName: sale.customerName || "Cliente Anonimo",
          productName: sale.productName || "Prodotto generico",
          price: sale.price || 0,
          qty: qty,
          pct: pct,
          earned: splitCommEarned
        });
      });
    });

    // Convert Record to Array and sort by total commissions descending
    return Object.values(summaryMap).sort((a, b) => b.totalCommissions - a.totalCommissions);
  }, [appointments, productSales, team, services, selectedMonth, selectedSalonId, userRole, userSalonIds]);

  // Overall Business Totals
  const businessTotals = useMemo(() => {
    return monthlyData.reduce(
      (totals, staff) => {
        totals.services += staff.serviceCommissions;
        totals.products += staff.productCommissions;
        totals.grandTotal += staff.totalCommissions;
        return totals;
      },
      { services: 0, products: 0, grandTotal: 0 }
    );
  }, [monthlyData]);

  const toggleExpandStaff = (name: string) => {
    setExpandedStaff(prev => (prev === name ? null : name));
  };

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#1a3a8f]" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Calcolo provvigioni in corso...
        </span>
      </div>
    );
  }

  if (businessSettings?.userPlan === "solo_pro") {
    return (
      <PremiumGate 
        featureName="Percentuali e Provvigioni" 
        description="Il calcolo, la gestione e lo storico delle provvigioni e delle percentuali per i collaboratori sono disponibili a partire dal piano Premium Network."
        setCurrentTab={setCurrentTab}
      />
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Intro Header Card */}
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#1a3a8f]/10 rounded-lg text-[#1a3a8f]">
              <Percent className="w-4 h-4" />
            </span>
            <span className="text-[10px] bg-indigo-50 text-[#1a3a8f] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Sistema Incentivi e Provvigioni
            </span>
          </div>
          <h1 className="font-serif text-xl font-bold text-gray-900 md:text-2xl mt-1">
            Percentuali Collaboratori
          </h1>
          <p className="text-xs text-gray-400 font-medium">
            Tieni traccia delle commissioni maturate sui trattamenti eseguiti e sui prodotti venduti al dettaglio.
          </p>
        </div>

        {/* Date Selector & Sede Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Monthly selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Calendar className="w-3 h-3 text-gray-400" /> Mese di Riferimento
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setExpandedStaff(null);
              }}
              className="bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] outline-hidden text-xs font-bold text-gray-800 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-3xs"
            />
          </div>

          {/* Salon selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Building2 className="w-3 h-3 text-gray-400" /> Filtra per Sede
            </span>
            <select
              value={selectedSalonId}
              onChange={(e) => {
                setSelectedSalonId(e.target.value);
                setExpandedStaff(null);
              }}
              className="bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] outline-hidden text-xs font-bold text-gray-800 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-3xs"
            >
              <option value="all">Tutte le Sedi</option>
              {allowedSalons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Total Earned Commissions */}
        <div className="bg-gradient-to-br from-[#1a3a8f] to-indigo-950 p-5 rounded-2xl text-white shadow-md shadow-blue-900/5 relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-10">
            <TrendingUp className="w-28 h-28 stroke-[1.5]" />
          </div>
          <span className="text-[10px] uppercase font-black tracking-widest text-indigo-200 block">
            Totale Provvigioni Aziendali
          </span>
          <h3 className="font-serif text-3xl font-black mt-2">
            €{businessTotals.grandTotal.toFixed(2)}
          </h3>
          <p className="text-[10px] text-indigo-200/80 mt-1 font-medium">
            Nel mese di {getMonthNameItalian(selectedMonth)}
          </p>
        </div>

        {/* Services Commissions */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-black tracking-widest text-gray-400 block">
              Provvigioni su Trattamenti
            </span>
            <h3 className="font-serif text-2xl font-black text-gray-900 mt-2">
              €{businessTotals.services.toFixed(2)}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 w-max mt-3">
            <Scissors className="w-3.5 h-3.5" />
            <span>Quota Servizi</span>
          </div>
        </div>

        {/* Product Commissions */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-black tracking-widest text-gray-400 block">
              Provvigioni su Prodotti
            </span>
            <h3 className="font-serif text-2xl font-black text-gray-900 mt-2">
              €{businessTotals.products.toFixed(2)}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 w-max mt-3">
            <Package className="w-3.5 h-3.5" />
            <span>Quota Vendite</span>
          </div>
        </div>

      </div>

      {/* Main Table / Collaborator Cards */}
      <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-serif font-bold text-[#1a2035] text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-[#1a3a8f]" />
            Riepilogo Compensi di {getMonthNameItalian(selectedMonth)}
          </h3>
          <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">
            {monthlyData.length} Collaboratori Attivi
          </span>
        </div>

        {monthlyData.length === 0 ? (
          <div className="p-12 text-center text-gray-400 font-medium space-y-2">
            <Percent className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-sm">Nessuna provvigione registrata in questo mese.</p>
            <p className="text-xs text-gray-400">Completa dei check-out assegnando i collaboratori per vedere i dati aggiornati.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {monthlyData.map((staff) => {
              const isExpanded = expandedStaff === staff.staffName;
              return (
                <div key={staff.staffName} className="transition-all hover:bg-slate-50/20">
                  
                  {/* Row Header Card */}
                  <div 
                    onClick={() => toggleExpandStaff(staff.staffName)}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#1a3a8f] font-bold text-sm shrink-0">
                        {staff.staffName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm">{staff.staffName}</h4>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                          {staff.role}
                        </span>
                      </div>
                    </div>

                    {/* Breakdown and totals */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      
                      <div className="text-left sm:text-right">
                        <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block">Servizi (x{staff.servicesPerformedCount})</span>
                        <span className="text-xs font-black text-gray-800">€{staff.serviceCommissions.toFixed(2)}</span>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block">Prodotti (x{staff.productsSoldCount})</span>
                        <span className="text-xs font-black text-gray-800">€{staff.productCommissions.toFixed(2)}</span>
                      </div>

                      <div className="text-left sm:text-right bg-[#1a3a8f]/5 px-3 py-1.5 rounded-xl border border-[#1a3a8f]/10">
                        <span className="text-[9px] uppercase font-extrabold text-[#1a3a8f] tracking-wider block">Totale Maturato</span>
                        <span className="text-sm font-black text-[#1a3a8f]">€{staff.totalCommissions.toFixed(2)}</span>
                      </div>

                      <div className="text-gray-400 self-center hidden sm:block">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>

                    </div>
                  </div>

                  {/* Expanded Transaction Details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-1 border-t border-dashed border-gray-100 bg-slate-50/50 space-y-4 animate-fadeIn">
                      
                      {/* Services detail list */}
                      <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-[#1a3a8f] uppercase tracking-widest flex items-center gap-1">
                          <Scissors className="w-3.5 h-3.5 text-[#1a3a8f]" /> Trattamenti eseguiti ({staff.servicesDetail.length})
                        </span>
                        {staff.servicesDetail.length === 0 ? (
                          <p className="text-[11px] text-gray-400 font-medium bg-white p-3 rounded-xl border border-gray-100/50">Nessun trattamento eseguito.</p>
                        ) : (
                          <div className="bg-white rounded-xl border border-gray-100/60 overflow-hidden shadow-3xs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-gray-100/60 font-bold text-gray-500 text-[10px] uppercase tracking-wider">
                                  <th className="py-2.5 px-3">Data</th>
                                  <th className="py-2.5 px-3">Cliente</th>
                                  <th className="py-2.5 px-3">Servizio</th>
                                  <th className="py-2.5 px-3 text-right">Incasso</th>
                                  <th className="py-2.5 px-3 text-center">Provv %</th>
                                  <th className="py-2.5 px-3 text-right">Provv €</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100/60 font-medium text-gray-700">
                                {staff.servicesDetail.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="py-2 px-3 font-semibold text-gray-400">{item.date}</td>
                                    <td className="py-2 px-3 font-semibold text-gray-900">{item.customerName}</td>
                                    <td className="py-2 px-3 font-semibold">{item.serviceName}</td>
                                    <td className="py-2 px-3 text-right text-gray-500 font-mono">€{item.price.toFixed(2)}</td>
                                    <td className="py-2 px-3 text-center">
                                      <span className="bg-slate-100 text-slate-700 font-black px-1.5 py-0.5 rounded text-[10px]">
                                        {item.pct}%
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right text-[#1a3a8f] font-black font-mono">€{item.earned.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Products detail list */}
                      <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-emerald-600" /> Prodotti venduti al dettaglio ({staff.productsDetail.length})
                        </span>
                        {staff.productsDetail.length === 0 ? (
                          <p className="text-[11px] text-gray-400 font-medium bg-white p-3 rounded-xl border border-gray-100/50">Nessun prodotto venduto.</p>
                        ) : (
                          <div className="bg-white rounded-xl border border-gray-100/60 overflow-hidden shadow-3xs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-gray-100/60 font-bold text-gray-500 text-[10px] uppercase tracking-wider">
                                  <th className="py-2.5 px-3">Data</th>
                                  <th className="py-2.5 px-3">Cliente</th>
                                  <th className="py-2.5 px-3">Prodotto</th>
                                  <th className="py-2.5 px-3 text-center">Quantità</th>
                                  <th className="py-2.5 px-3 text-right">Prezzo Cad.</th>
                                  <th className="py-2.5 px-3 text-center">Provv %</th>
                                  <th className="py-2.5 px-3 text-right">Provv €</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100/60 font-medium text-gray-700">
                                {staff.productsDetail.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="py-2 px-3 font-semibold text-gray-400">{item.date}</td>
                                    <td className="py-2 px-3 font-semibold text-gray-900">{item.customerName}</td>
                                    <td className="py-2 px-3 font-semibold">{item.productName}</td>
                                    <td className="py-2 px-3 text-center font-bold text-gray-900">{item.qty}</td>
                                    <td className="py-2 px-3 text-right text-gray-500 font-mono">€{item.price.toFixed(2)}</td>
                                    <td className="py-2 px-3 text-center">
                                      <span className="bg-slate-100 text-slate-700 font-black px-1.5 py-0.5 rounded text-[10px]">
                                        {item.pct}%
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right text-emerald-700 font-black font-mono">€{item.earned.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
