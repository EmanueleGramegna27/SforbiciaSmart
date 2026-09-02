import React, { useState, useEffect, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  Calendar as CalendarIcon, 
  Store, 
  User as UserIcon, 
  Clock, 
  DollarSign, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  AlertCircle,
  Scissors,
  Trash2,
  X,
  FileCheck,
  Briefcase,
  Users,
  Grid,
  List,
  CalendarRange,
  FileText,
  Copy,
  Coins,
  FolderOpen,
  Lock,
  ArrowRight,
  Sparkles,
  Zap
} from "lucide-react";
import { Appointment } from "../types";
import BookingModal from "./BookingModal";
import FinalizeCheckoutModal from "./FinalizeCheckoutModal";
import FlashSlotModal from "./FlashSlotModal";
import { isFlashSlotAppointment } from "../utils/flashSlotClient";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  salonIds: string[];
  ownerId: string;
}

const ITALIAN_MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00"
];

// Helper to determine if a salon is closed on a specific YYYY-MM-DD date
const isSalonClosedOnDate = (dateStr: string, hoursStr?: string): boolean => {
  if (!hoursStr) return false;
  
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0])) return false;
  
  // Safe local date parsing
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayIndex = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  
  const ITALIAN_DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const appDayName = ITALIAN_DAYS[dayIndex];
  const appDayShort = appDayName.substring(0, 3).toLowerCase(); // "lun", "mar", "mer" etc.
  
  const hoursLower = hoursStr.toLowerCase();
  
  let daysPart = hoursStr;
  if (hoursStr.includes(":")) {
    daysPart = hoursStr.split(":")[0];
  }
  const daysLower = daysPart.toLowerCase();
  
  let dayIsOpen = false;
  
  if (daysLower.includes("ogni giorno") || daysLower.includes("tutti i giorni")) {
    dayIsOpen = true;
  } else if (daysLower.includes("lun - sab") || daysLower.includes("lunedì - sabato")) {
    dayIsOpen = dayIndex >= 1 && dayIndex <= 6;
  } else if (daysLower.includes("lun - ven") || daysLower.includes("lunedì - venerdì")) {
    dayIsOpen = dayIndex >= 1 && dayIndex <= 5;
  } else if (daysLower.includes("-")) {
    const bounds = daysLower.split("-").map(b => b.trim());
    if (bounds.length === 2) {
      const DAY_ABBRS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
      const startIdx = DAY_ABBRS.findIndex(a => bounds[0].startsWith(a));
      const endIdx = DAY_ABBRS.findIndex(a => bounds[1].startsWith(a));
      if (startIdx !== -1 && endIdx !== -1) {
        if (startIdx <= endIdx) {
          dayIsOpen = dayIndex >= startIdx && dayIndex <= endIdx;
        } else {
          dayIsOpen = dayIndex >= startIdx || dayIndex <= endIdx;
        }
      } else {
        dayIsOpen = true;
      }
    } else {
      dayIsOpen = true;
    }
  } else {
    const tokens = daysLower.split(/[\s,]+/).map(t => t.trim());
    dayIsOpen = tokens.some(tok => tok.startsWith(appDayShort) || appDayShort.startsWith(tok));
  }
  
  return !dayIsOpen;
};

// Helper to generate 30-minute time slots dynamically based on salon's operational hours
const getSalonTimeSlots = (hoursStr?: string): string[] => {
  let open = "08:00";
  let close = "20:00";

  if (hoursStr) {
    if (hoursStr.includes(":")) {
      const parts = hoursStr.split(":");
      if (parts.length >= 2) {
        const timePart = parts.slice(1).join(":").trim();
        const times = timePart.split("-");
        if (times.length === 2) {
          const parsedOpen = times[0].trim();
          const parsedClose = times[1].trim();
          if (/^\d{2}:\d{2}$/.test(parsedOpen) && /^\d{2}:\d{2}$/.test(parsedClose)) {
            open = parsedOpen;
            close = parsedClose;
          }
        }
      }
    } else {
      const times = hoursStr.split("-");
      if (times.length === 2) {
        const parsedOpen = times[0].trim();
        const parsedClose = times[1].trim();
        if (/^\d{2}:\d{2}$/.test(parsedOpen) && /^\d{2}:\d{2}$/.test(parsedClose)) {
          open = parsedOpen;
          close = parsedClose;
        }
      }
    }
  }

  const slots: string[] = [];
  
  const parseToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  };

  const minutesToTimeStr = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  let currentMinutes = parseToMinutes(open);
  const endMinutes = parseToMinutes(close);

  if (currentMinutes >= endMinutes || isNaN(currentMinutes) || isNaN(endMinutes)) {
    currentMinutes = 480; // 08:00
    const defEnd = 1200; // 20:00
    for (let m = currentMinutes; m <= defEnd; m += 30) {
      slots.push(minutesToTimeStr(m));
    }
    return slots;
  }

  for (let m = currentMinutes; m <= endMinutes; m += 30) {
    slots.push(minutesToTimeStr(m));
  }
  return slots;
};

interface AppointmentsScreenProps {
  setCurrentTab?: (tab: string) => void;
}

export default function AppointmentsScreen({ setCurrentTab }: AppointmentsScreenProps = {}) {
  const { user, salons, services, customers, loading, ownerId, userRole, userSalonIds, businessSettings } = useBusiness();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);

  // Active dates state
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const formattedDayTextMobile = useMemo(() => {
    try {
      const d = new Date(selectedDate);
      return d.toLocaleDateString("it-IT", { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const formattedDayTextDesktop = useMemo(() => {
    try {
      const d = new Date(selectedDate);
      return d.toLocaleDateString("it-IT", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Active calendar view mode: "giorno" showing the 2D employee grid matrix sketch directly,
  // "mese" showing the monthly interactive calendar + active day summary.
  const [viewMode, setViewMode] = useState<"giorno" | "mese">("giorno");

  // Helper to change active day chronologically
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() - 1);
      setSelectedDate(d.toISOString().slice(0, 10));
    }
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      setSelectedDate(d.toISOString().slice(0, 10));
    }
  };

  // Active month selector state for calendar grid display
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth()); // 0-11

  // Default to first salon to show staff details instead of generic "all"
  const [selectedSalonId, setSelectedSalonId] = useState<string>("all");

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [inlineDeleteId, setInlineDeleteId] = useState<string | null>(null);

  // Keep track of active tabs ("grid" is the 2D employee scheduler, "list" is standard timeline list)
  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");

  // Quick book details state
  const [quickBookState, setQuickBookState] = useState<{
    isOpen: boolean;
    date: string;
    time: string;
    staffName: string;
  } | null>(null);

  // Standard main booking trigger
  const [bookingOpen, setBookingOpen] = useState(false);

  // Flash Slot launch modal state
  const [flashSlotModalState, setFlashSlotModalState] = useState<{
    isOpen: boolean;
    salonId?: string;
    date?: string;
    time?: string;
    staffName?: string;
    serviceId?: string;
    serviceName?: string;
    price?: number;
    excludedCustomerId?: string;
  } | null>(null);

  // Recovery prompt modal state right after definitive appointment deletion
  const [deletedApptRecoveryPrompt, setDeletedApptRecoveryPrompt] = useState<Appointment | null>(null);

  // Checkout modal appointment trigger
  const [checkoutAppointment, setCheckoutAppointment] = useState<Appointment | null>(null);

  // State to manage quick action side-drawer on an appointment
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);

  // States for Customer Scheda Tecnica
  const [techSheetCustomerId, setTechSheetCustomerId] = useState<string | null>(null);
  const [techSheetNotes, setTechSheetNotes] = useState<string>("");
  const [techSheetCustomPrices, setTechSheetCustomPrices] = useState<any[]>([]);
  const [savingNotes, setSavingNotes] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);

  const activeCustomerForSheet = useMemo(() => {
    if (!techSheetCustomerId) return null;
    return customers.find(c => c.id === techSheetCustomerId) || null;
  }, [techSheetCustomerId, customers]);

  // Load custom prices for selected tech sheet customer
  useEffect(() => {
    if (!techSheetCustomerId || !ownerId) {
      setTechSheetCustomPrices([]);
      return;
    }
    const q = query(
      collection(db, "custom_prices"), 
      where("ownerId", "==", ownerId),
      where("customerId", "==", techSheetCustomerId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTechSheetCustomPrices(list);
    }, (err) => {
      console.error("Error loading techSheetCustomPrices", err);
    });
    return () => unsub();
  }, [techSheetCustomerId, ownerId]);

  const handleOpenTechSheet = (custId: string) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      setTechSheetCustomerId(custId);
      setTechSheetNotes(cust.notes || "");
    }
  };

  const handleSaveTechNotes = async () => {
    if (!techSheetCustomerId) return;
    setSavingNotes(true);
    try {
      await updateDoc(doc(db, "customers", techSheetCustomerId), {
        notes: techSheetNotes
      });
    } catch (err) {
      console.error("Errore salvataggio note", err);
    } finally {
      setSavingNotes(false);
    }
  };

  // Reset delete confirmation on appointment swap or date change
  useEffect(() => {
    setDeleteConfirmId(null);
    setInlineDeleteId(null);
  }, [activeAppointment?.id, selectedDate]);

  // Auto-set the first salon when lists are loaded
  useEffect(() => {
    if (salons.length > 0 && selectedSalonId === "all") {
      setSelectedSalonId(salons[0].id);
    }
  }, [salons]);

  // Sync year/month with selectedDate when it changes outside
  useEffect(() => {
    const d = new Date(selectedDate);
    if (!isNaN(d.getTime())) {
      setCurrentYear(d.getFullYear());
      setCurrentMonth(d.getMonth());
    }
  }, [selectedDate]);

  // Fetch appointments in real-time
  useEffect(() => {
    if (!ownerId) return;
    setAppointmentsLoading(true);

    const unsub = onSnapshot(
      query(collection(db, "appointments"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Appointment[];
        let filtered = data;
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = data.filter(a => allowedIds.includes(a.salonId));
        }
        setAppointments(
          filtered.filter(a => a.date).sort((a, b) => {
            const timeA = `${a.date}T${a.time || "00:00"}`;
            const timeB = `${b.date}T${b.time || "00:00"}`;
            return timeA.localeCompare(timeB);
          })
        );
        setAppointmentsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "appointments");
        setAppointmentsLoading(false);
      }
    );

    return () => unsub();
  }, [ownerId, userRole, userSalonIds]);

  // Fetch team members in real-time
  useEffect(() => {
    if (!ownerId) return;
    setTeamLoading(true);

    const unsub = onSnapshot(
      query(collection(db, "team"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TeamMember[];
        // Deduplicate team members by email to prevent showing clones (e.g. self-healed UID doc)
        const uniqueMap = new Map<string, TeamMember>();
        data.forEach(m => {
          const emailKey = m.email?.trim().toLowerCase();
          if (emailKey) {
            const existing = uniqueMap.get(emailKey);
            // Prefer the document whose ID is NOT a UUID (e.g. is the email itself)
            if (!existing || m.id === emailKey) {
              uniqueMap.set(emailKey, m);
            }
          } else {
            uniqueMap.set(m.id, m);
          }
        });
        const uniqueData = Array.from(uniqueMap.values());
        
        let filtered = uniqueData;
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = uniqueData.filter(t => t.salonIds && t.salonIds.some(id => allowedIds.includes(id)));
        }
        setTeam(filtered);
        setTeamLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "team");
        setTeamLoading(false);
      }
    );

    return () => unsub();
  }, [ownerId, userRole, userSalonIds]);

  const salonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    salons.forEach(s => {
      map[s.id] = s.name;
    });
    return map;
  }, [salons]);

  const selectedSalonObj = useMemo(() => {
    return salons.find(s => s.id === selectedSalonId) || null;
  }, [salons, selectedSalonId]);

  // Calculate active teams and columns for the daily grid
  const activeSalonTeam = useMemo(() => {
    if (selectedSalonId === "all") return team;
    return team.filter(m => m.salonIds?.includes(selectedSalonId));
  }, [team, selectedSalonId]);

  const gridColumns = useMemo(() => {
    const list = activeSalonTeam.map(member => ({
      id: member.id,
      name: member.name,
      role: member.role || "Stylist"
    }));
    // Add "Qualsiasi" as fallback column representing standard/unassigned slots
    list.push({
      id: "unassigned",
      name: "Qualsiasi",
      role: "Personale Turno"
    });
    return list;
  }, [activeSalonTeam]);

  // Dynamic active time slots based on the opening & closing hours of the selected salon
  const activeTimeSlots = useMemo(() => {
    return getSalonTimeSlots(selectedSalonObj?.hours);
  }, [selectedSalonObj]);

  // Grid time slot range mapping (next slot tracking to capture custom appointments lying inside ranges)
  const nextSlotMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < activeTimeSlots.length - 1; i++) {
      map[activeTimeSlots[i]] = activeTimeSlots[i + 1];
    }
    return map;
  }, [activeTimeSlots]);

  // Filtered Appointments for the selected day
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      const matchDate = appt.date === selectedDate;
      const matchSalon = selectedSalonId === "all" || appt.salonId === selectedSalonId;
      return matchDate && matchSalon;
    });
  }, [appointments, selectedDate, selectedSalonId]);

  // Generate days for monthly grid
  const monthDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    // Padding for weeks alignment
    let startDayOffset = firstDay.getDay() - 1;
    if (startDayOffset === -1) startDayOffset = 6; // Sunday is 6

    const days = [];
    
    // Add end of previous month
    const prevMonthLast = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOffset - 1; i >= 0; i--) {
      days.push({
        dayNum: prevMonthLast - i,
        isCurrentMonth: false,
        dateStr: ""
      });
    }

    // Add current month days
    const totalDays = lastDay.getDate();
    for (let i = 1; i <= totalDays; i++) {
      const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        dayNum: i,
        isCurrentMonth: true,
        dateStr: dStr
      });
    }

    // Pad next month
    const totalCells = days.length > 35 ? 42 : 35;
    const remaining = totalCells - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        dayNum: i,
        isCurrentMonth: false,
        dateStr: ""
      });
    }

    return days;
  }, [currentMonth, currentYear]);

  // Pre-calculate appointment counts to draw markers in the monthly layout
  const apptsPerDayCount = useMemo(() => {
    const counts: Record<string, number> = {};
    appointments.forEach(appt => {
      if (appt.date && (selectedSalonId === "all" || appt.salonId === selectedSalonId)) {
        counts[appt.date] = (counts[appt.date] || 0) + 1;
      }
    });
    return counts;
  }, [appointments, selectedSalonId]);

  // Calendar Month Navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const handleSetToday = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setSelectedDate(todayStr);
  };

  // Change Appt Status Action
  const handleUpdateStatus = async (apptId: string, status: "confirmed" | "pending" | "cancelled" | "completed") => {
    try {
      await updateDoc(doc(db, "appointments", apptId), { status });
      // update state locally
      setActiveAppointment(prev => prev && prev.id === apptId ? { ...prev, status } : prev);
    } catch (err: any) {
      console.error("Error updating appointment status", err);
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${apptId}`);
    }
  };

  // Delete Appt
  const handleDeleteAppointment = async (apptOrId: Appointment | string) => {
    let apptToDelete: Appointment | undefined;
    let apptId = "";

    if (typeof apptOrId === "string") {
      apptId = apptOrId;
      apptToDelete = appointments.find((a) => a.id === apptId) || (activeAppointment?.id === apptId ? activeAppointment : undefined);
    } else {
      apptToDelete = apptOrId;
      apptId = apptOrId.id;
    }

    try {
      await deleteDoc(doc(db, "appointments", apptId));
      setActiveAppointment(null);
      setDeleteConfirmId(null);
      setInlineDeleteId(null);

      // Immediately offer the salon owner to recover this freed slot via Flash Slot on WhatsApp
      if (apptToDelete) {
        setDeletedApptRecoveryPrompt(apptToDelete);
      }
    } catch (err: any) {
      console.error("Error deleting appointment", err);
      handleFirestoreError(err, OperationType.DELETE, `appointments/${apptId}`);
    }
  };

  const getAppointmentsForCell = (slot: string, staffName: string) => {
    const nextSlot = nextSlotMap[slot] || null;
    return filteredAppointments.filter(appt => {
      const apptStaff = appt.staffName || "Qualsiasi";
      const apptStaffParts = apptStaff.split(",").map(p => p.trim().toLowerCase());

      const isStaffMatch = staffName.toLowerCase() === "qualsiasi"
        ? (apptStaff.toLowerCase() === "qualsiasi" || apptStaff === "" || !activeSalonTeam.some(t => apptStaffParts.includes(t.name.toLowerCase())))
        : apptStaffParts.includes(staffName.toLowerCase());

      if (!isStaffMatch) return false;
      
      const apptTime = appt.time;
      if (!apptTime) return false;

      // check index range matches
      if (nextSlot) {
        return apptTime >= slot && apptTime < nextSlot;
      } else {
        return apptTime >= slot;
      }
    });
  };

  const handleQuickBook = (timeSlot: string, collaboratorName: string) => {
    setQuickBookState({
      isOpen: true,
      date: selectedDate,
      time: timeSlot,
      staffName: collaboratorName
    });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "confirmed":
        return "text-emerald-800 bg-emerald-50 border-emerald-100 hover:bg-emerald-100/70";
      case "cancelled":
        return "text-red-800 bg-red-50 border-red-100 hover:bg-red-100/70";
      case "completed":
        return "text-emerald-800 bg-emerald-50 border-emerald-100 hover:bg-emerald-100/70";
      default:
        return "text-amber-800 bg-amber-50 border-amber-100 hover:bg-amber-100/70"; // pending
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

  // Check if current active day is closed for selected salon
  const isSelectedDayClosedVal = useMemo(() => {
    return isSalonClosedOnDate(selectedDate, selectedSalonObj?.hours);
  }, [selectedDate, selectedSalonObj]);

  if (loading || appointmentsLoading || teamLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-80 bg-white border border-slate-200/80 rounded-3xl p-6 md:col-span-1 skeleton shadow-2xs" />
          <div className="h-80 bg-white border border-slate-200/80 rounded-3xl p-6 md:col-span-2 skeleton shadow-2xs" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Top Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="text-[10px] text-[#1a3a8f] font-bold uppercase tracking-widest">
            Gestione Appuntamenti & Presenze
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1a2035] flex items-center gap-2.5 mt-0.5">
            <div className="w-9 h-9 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center border border-[#1a3a8f]/10 shadow-2xs shrink-0">
              <CalendarRange className="w-5 h-5" />
            </div>
            Agenda & Calendario Saloni
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Visualizza turni del personale in tempo reale, orari di apertura e gestisci gli incassi da un'unica console.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Due tasti ravvicinati: Mese e Giorno (Apple Segmented Control) */}
          <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode("mese")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                viewMode === "mese"
                  ? "bg-[#1a3a8f] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Vista Mese
            </button>
            <button
              type="button"
              onClick={() => setViewMode("giorno")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                viewMode === "giorno"
                  ? "bg-[#1a3a8f] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Vista Giorno
            </button>
          </div>

          <button
            onClick={() => setBookingOpen(true)}
            className="bg-[#1a3a8f] hover:bg-[#132c6e] active:scale-[0.98] text-white rounded-2xl px-5 py-2.5 text-xs font-semibold shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nuovo Appuntamento
          </button>
        </div>
      </div>

      {/* Main Container Layout */}
      {viewMode === "mese" ? (
        /* ================= VISTA MESE (Month Calendar + Daily Timeline List) ================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column Controls (Negozio and Calendar picker) */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-5 min-w-0 w-full">
            
            {/* Card 1: Negozio Selection */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-3.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <Store className="w-4 h-4 text-[#1a3a8f]" />
                Sede Operativa (Negozio)
              </h3>

              {salons.length === 0 ? (
                <div className="p-4 bg-amber-50/90 border border-amber-200/80 text-amber-900 text-xs rounded-2xl flex items-start gap-2.5 shadow-2xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>Nessun salone registrato nel sistema. Vai nella schermata Saloni per inserirne uno.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <select
                      id="salon-select-dropdown"
                      value={selectedSalonId || ""}
                      onChange={(e) => setSelectedSalonId(e.target.value)}
                      className="w-full min-w-0 bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-xs font-bold text-[#1a2035] outline-none focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] transition-all cursor-pointer appearance-none pr-9 shadow-2xs"
                    >
                      {salons.map((sal) => (
                        <option key={sal.id} value={sal.id}>
                          {sal.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                      <ChevronRight className="w-4 h-4 rotate-90" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Interactive Month/Day Calendar Widget with Graying out closed days */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-2xs space-y-4">
              
              {/* Header with months dropdown */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center shadow-2xs">
                    <CalendarIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-bold text-[#1a2035] tracking-tight">
                    {ITALIAN_MONTHS[currentMonth]} {currentYear}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1.5 border border-slate-200/80 rounded-xl hover:bg-slate-50 text-slate-600 active:scale-95 transition-all cursor-pointer shadow-2xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleSetToday}
                    className="px-2.5 py-1 border border-slate-200/80 rounded-xl hover:bg-[#eef2ff] text-[10px] font-bold text-[#1a3a8f] active:scale-95 transition-all cursor-pointer shadow-2xs"
                  >
                    Oggi
                  </button>
                  <button
                    onClick={handleNextMonth}
                    className="p-1.5 border border-slate-200/80 rounded-xl hover:bg-slate-50 text-slate-600 active:scale-95 transition-all cursor-pointer shadow-2xs"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Direct selector triggers: Dropdowns for rapid Month/Year shifts */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(Number(e.target.value))}
                  className="w-full min-w-0 bg-slate-50/90 border border-slate-200/80 rounded-2xl px-3 py-2 text-xs text-slate-700 outline-none font-bold cursor-pointer shadow-2xs"
                >
                  {ITALIAN_MONTHS.map((mo, i) => (
                    <option key={mo} value={i}>{mo}</option>
                  ))}
                </select>
                <select
                  value={currentYear}
                  onChange={(e) => setCurrentYear(Number(e.target.value))}
                  className="w-full min-w-0 bg-slate-50/90 border border-slate-200/80 rounded-2xl px-3 py-2 text-xs text-slate-700 outline-none font-bold cursor-pointer shadow-2xs"
                >
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>

              {/* Days Grid heading */}
              <div className="grid grid-cols-7 gap-1 text-center text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {WEEK_DAYS.map(wd => (
                  <div key={wd} className="py-1 truncate">{wd}</div>
                ))}
              </div>

              {/* Calendar Cells */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {monthDays.map((day, idx) => {
                  if (!day.isCurrentMonth || !day.dateStr) {
                    return (
                      <div 
                        key={`empty-${idx}`} 
                        className="aspect-square min-h-[38px] sm:min-h-[44px] flex items-center justify-center text-slate-300 text-xs font-medium"
                      >
                        {day.dayNum}
                      </div>
                    );
                  }

                  const dateStr = day.dateStr;
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === new Date().toISOString().slice(0, 10);
                  
                  // Real-time closed day calculations
                  const isClosed = isSalonClosedOnDate(dateStr, selectedSalonObj?.hours);
                  const apptCount = apptsPerDayCount[dateStr] || 0;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => {
                        setSelectedDate(dateStr);
                      }}
                      className={`aspect-square min-h-[38px] sm:min-h-[44px] rounded-2xl transition-all flex flex-col items-center justify-between py-1 border text-xs font-bold relative group cursor-pointer active:scale-95 shadow-2xs ${
                        isSelected
                          ? "bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-xs"
                          : isClosed
                          ? "bg-slate-100 hover:bg-slate-200/60 text-slate-400 border-dashed border-slate-200"
                          : isToday
                          ? "border-amber-300 bg-amber-50/90 text-[#1a3a8f]"
                          : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200/70"
                      }`}
                    >
                      <span className="text-[11px]">{day.dayNum}</span>
                      {isClosed && (
                        <span className="text-[7px] font-bold tracking-tighter border border-current px-1 py-0.2 rounded-full leading-none text-rose-500 uppercase">
                          Chiuso
                        </span>
                      )}

                      {apptCount > 0 && !isSelected && (
                        <span className={`w-1.5 h-1.5 rounded-full absolute bottom-1 left-1/2 -translate-x-1/2 ${isToday ? "bg-amber-500" : "bg-[#1a3a8f]"}`} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend indicators */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-slate-400 shrink-0 font-medium pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-md bg-slate-100 border border-dashed border-slate-200 block" />
                  Negozio Chiuso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-md bg-[#1a3a8f] block" />
                  Selezionato
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1a3a8f] block" />
                  Con Appuntamenti
                </span>
              </div>
            </div>

          </div>

          {/* Right Column Layout (Selected Day Timeline Schedule List) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4 min-w-0 w-full">
            
            {/* List layout: Original chronological Timeline feed + check-in triggers */}
            <div className="space-y-4">
              
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <h3 className="text-base font-bold text-[#1a2035] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#1a3a8f]" />
                  Cronoprogramma Orario del Giorno
                </h3>
              </div>

              {filteredAppointments.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center max-w-lg mx-auto shadow-2xs">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-4 shadow-2xs">
                    <CalendarIcon className="w-6 h-6" />
                  </div>
                  <p className="text-slate-700 text-sm font-semibold">Nessuna prenotazione inserita per la data selezionata.</p>
                  <p className="text-slate-400 text-xs mt-1">Crea un nuovo appuntamento per questo giorno.</p>
                  <button 
                    onClick={() => setBookingOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 bg-[#eef2ff] hover:bg-[#eef2ff]/80 text-[#1a3a8f] px-4 py-2 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs border border-[#1a3a8f]/10"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Inserisci prenotazione
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAppointments.map((appt) => (
                    <div 
                      key={appt.id}
                      onClick={() => setActiveAppointment(appt)}
                      className="bg-white border border-slate-200/80 rounded-3xl p-4.5 hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group shadow-2xs"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {/* Time label */}
                        <div className="bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 rounded-2xl px-3 py-2 flex flex-col items-center justify-center shrink-0 min-w-[58px] text-center font-sans font-bold shadow-2xs">
                          <span className="text-[9px] uppercase tracking-wider opacity-75">Ora</span>
                          <span className="text-sm leading-tight mt-0.5">{appt.time}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-[#1a2035] group-hover:text-[#1a3a8f] transition-colors break-words">
                              {appt.customerName}
                            </h4>
                            {isFlashSlotAppointment(appt) && (
                              <span className="inline-flex items-center gap-1 bg-amber-100/90 text-amber-900 border border-amber-300 font-bold text-[9.5px] uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-2xs">
                                <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                                <span>Flash Slot</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                              {inlineDeleteId === appt.id ? (
                                <span className="flex items-center gap-1.5 bg-rose-50 p-1.5 rounded-xl border border-rose-200 text-[9.5px]/none animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-rose-700 font-bold px-1 select-none">Eliminare?</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteAppointment(appt);
                                      setInlineDeleteId(null);
                                    }}
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase tracking-wider cursor-pointer active:scale-95 shadow-2xs"
                                  >
                                    Sì
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInlineDeleteId(null)}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase tracking-wider cursor-pointer active:scale-95"
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenTechSheet(appt.customerId);
                                    }}
                                    className="p-1.5 bg-slate-50 hover:bg-[#eef2ff] text-slate-600 hover:text-[#1a3a8f] border border-slate-200/80 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95"
                                    title="Apri Scheda Tecnica"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-[#1a3a8f]" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInlineDeleteId(appt.id);
                                    }}
                                    className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200/80 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95"
                                    title="Elimina rapidamente appuntamento"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                  </button>
                                </>
                              )}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500 mt-1 font-medium min-w-0 w-full">
                            <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-full text-slate-700 max-w-full min-w-0 border border-slate-200/60 shadow-2xs">
                              <Scissors className="w-3 h-3 text-[#1a3a8f] shrink-0" />
                              <span className="truncate font-semibold" title={appt.serviceName}>
                                {appt.serviceName}
                              </span>
                              <span className="shrink-0 text-slate-400">({appt.duration}m)</span>
                            </span>
                            <span className="flex items-center gap-1 min-w-0 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200/60 shadow-2xs">
                              <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="text-slate-400 shrink-0">Staff:</span>
                              <span className="text-slate-700 font-bold">{appt.staffName || "Standard"}</span>
                            </span>
                            {selectedSalonId === "all" && (
                              <span className="bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 shadow-2xs">
                                {salonsMap[appt.salonId] || "Sede"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right tag checkout details */}
                      <div className="flex items-center gap-3 ml-auto md:ml-0 shrink-0">
                        {isFlashSlotAppointment(appt) ? (
                          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 bg-amber-50/90 px-3 py-1 rounded-2xl border border-amber-200 shadow-2xs" title="Prezzo da definire in base ai trattamenti eseguiti in salone">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Da definire
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-slate-800 flex items-center bg-slate-50 px-2.5 py-1 rounded-2xl border border-slate-200/80 font-mono shadow-2xs">
                            €{appt.price?.toFixed(2)}
                          </span>
                        )}
                        {appt.status !== "completed" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCheckoutAppointment(appt);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-2xl shadow-2xs transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                          >
                            <span>Cassa 💸</span>
                          </button>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border shadow-2xs ${getStatusStyle(appt.status)}`}>
                            {getStatusLabelText(appt.status)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>

            {/* Render Bottom sliding action details if any in Month View */}
            {activeAppointment && (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 md:p-6 space-y-4 animate-fadeIn relative shadow-2xs">
                <button
                  type="button"
                  onClick={() => setActiveAppointment(null)}
                  className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#eef2ff] flex items-center justify-center text-[#1a3a8f] shadow-2xs border border-[#1a3a8f]/10 shrink-0">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/10 px-2.5 py-0.5 rounded-full shadow-2xs">
                         Slot {activeAppointment.time} del {activeAppointment.date}
                      </span>
                      {isFlashSlotAppointment(activeAppointment) && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <Zap className="w-2.5 h-2.5 text-amber-600 fill-amber-500" />
                          Flash Slot
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#1a2035] mt-1 tracking-tight">
                      Check-in Appuntamento: {activeAppointment.customerName}
                    </h3>
                  </div>
                </div>

                {isFlashSlotAppointment(activeAppointment) && (
                  <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-900 shadow-2xs">
                    <div className="w-7 h-7 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-amber-600 fill-amber-500" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-bold uppercase tracking-wide text-[10px] text-amber-900">
                        Prenotazione Acquisita tramite Flash Slot (Magic Link WhatsApp)
                      </p>
                      <p className="text-[11px] text-amber-800/90 font-medium leading-relaxed">
                        Il cliente si è aggiudicato il posto rapido. I trattamenti eseguiti e il prezzo finale verranno registrati e saldati in cassa.
                      </p>
                    </div>
                  </div>
                )}

                {/* Detail list details */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Trattamento</span>
                    <span className="font-bold text-[#1a2035]">{activeAppointment.serviceName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Operatore</span>
                    <span className="font-bold text-[#1a2035]">{activeAppointment.staffName || "Non specificato"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Fattura Totale</span>
                    {isFlashSlotAppointment(activeAppointment) ? (
                      <span className="font-bold text-amber-800 text-xs flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Da definire in cassa
                      </span>
                    ) : (
                      <span className="font-bold font-mono text-[#1a3a8f]">€{activeAppointment.price?.toFixed(2)}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Stato Attuale</span>
                    <span className="inline-block mt-0.5 px-2.5 py-0.5 font-bold uppercase text-[9px] rounded-full border bg-white border-slate-200/80 shadow-2xs">
                      {getStatusLabelText(activeAppointment.status)}
                    </span>
                  </div>
                </div>

                {/* Prominent Checkout / Cassa Action Callout */}
                {activeAppointment.status !== "completed" && (
                  <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-fadeIn">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                        💸 Cassa e Pagamento Rapido
                      </p>
                      <p className="text-[11px] text-slate-600 font-medium">
                        Procedi al saldo, verifica i dati e finalizza il check-out dell'appuntamento.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCheckoutAppointment(activeAppointment)}
                      className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-2xs active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <span>Incassa e Completa ➔</span>
                    </button>
                  </div>
                )}

                {/* Direct update actions */}
                <div className="space-y-2 pt-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Controlli Rapidi Presenza / Pagamento
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setCheckoutAppointment(activeAppointment)}
                      className={`p-2.5 border rounded-2xl text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-1 active:scale-95 shadow-2xs ${
                        (activeAppointment.status === "completed" || activeAppointment.status === "confirmed")
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                          : "border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      Conferma 💸
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(activeAppointment.id, "pending")}
                      className={`p-2.5 border rounded-2xl text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95 shadow-2xs ${
                        (!activeAppointment.status || activeAppointment.status === "pending")
                          ? "bg-amber-500 border-amber-500 text-white shadow-xs"
                          : "border-amber-200 bg-amber-50/40 text-amber-700 hover:bg-amber-50"
                      }`}
                    >
                      In Attesa
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(activeAppointment.id, "cancelled")}
                      className={`p-2.5 border rounded-2xl text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95 shadow-2xs ${
                        activeAppointment.status === "cancelled"
                          ? "bg-rose-600 border-rose-600 text-white shadow-xs"
                          : "border-rose-200 bg-rose-50/40 text-rose-700 hover:bg-rose-50"
                      }`}
                    >
                      Annulla
                    </button>
                  </div>
                </div>

                {/* Delete event row */}
                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  {deleteConfirmId === activeAppointment.id ? (
                    <>
                      <span className="text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200 animate-pulse text-[11px]">
                        ⚠️ Confermare l'eliminazione definitiva?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteAppointment(activeAppointment.id)}
                          className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[9.5px] cursor-pointer shadow-2xs transition-all active:scale-95"
                        >
                          Sì, elimina
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[9.5px] cursor-pointer transition-all active:scale-95"
                        >
                          Annulla
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-400 font-medium">Vuoi eliminare questa prenotazione?</span>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(activeAppointment.id)}
                        className="text-rose-600 hover:bg-rose-50 hover:border-rose-200 p-2 border border-transparent rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all text-[9.5px] uppercase tracking-wider active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Elimina Definitivamente
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>
      ) : (
        /* ================= VISTA GIORNO (Standard 2D Grid) ================= */
        <div className="space-y-4">
          
          {/* Day View Top-Bar with Integrated Sede select and Navigation */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Salon mini-selector dropdown directly inline on left side */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Store className="w-3.5 h-3.5 text-[#1a3a8f]" />
                Negozio:
              </span>
              <div className="relative">
                <select
                  id="salon-select-day-view"
                  value={selectedSalonId || ""}
                  onChange={(e) => setSelectedSalonId(e.target.value)}
                  className="bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl px-3.5 py-1.5 text-xs font-bold text-[#1a2035] outline-none focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] cursor-pointer appearance-none pr-8 shadow-2xs"
                >
                  {salons.map((sal) => (
                    <option key={sal.id} value={sal.id}>
                      {sal.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </div>
              </div>
            </div>

            {/* Date Navigator in the center */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handlePrevDay}
                className="p-1.5 border border-slate-200/80 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Prec.</span>
              </button>
              
              <button
                onClick={handleSetToday}
                className="px-3 py-1.5 border border-slate-200/80 rounded-xl bg-slate-50 hover:bg-[#eef2ff] text-xs font-bold text-[#1a3a8f] cursor-pointer active:scale-95 shadow-2xs"
              >
                Oggi
              </button>

              <div className="bg-[#eef2ff] border border-[#1a3a8f]/10 px-3.5 sm:px-4 py-1.5 rounded-2xl text-xs sm:text-sm font-bold text-[#1a2035] flex items-center gap-1.5 min-w-0 shadow-2xs">
                <CalendarRange className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1a3a8f] shrink-0" />
                <span className="sm:hidden">{formattedDayTextMobile}</span>
                <span className="hidden sm:inline">{formattedDayTextDesktop}</span>
              </div>

              <button
                onClick={handleNextDay}
                className="p-1.5 border border-slate-200/80 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
              >
                <span className="hidden sm:inline">Succ.</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Indicator of closed days */}
            <div>
              {isSelectedDayClosedVal ? (
                <span className="bg-rose-50 text-rose-800 text-[10px] font-bold uppercase px-3 py-1.5 rounded-2xl border border-rose-200 tracking-wide block text-center shadow-2xs">
                  Salone Chiuso
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-3 py-1.5 rounded-2xl border border-emerald-200 block text-center shadow-2xs">
                   Aperto: {selectedSalonObj?.hours || "Sì"}
                </span>
              )}
            </div>

          </div>

          {/* 2D Grid Matrix - styled in Apple design theme */}
          <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <div 
                className="divide-y divide-slate-100"
                style={{ minWidth: `${100 + gridColumns.length * 180}px` }}
              >
                
                {/* 2D Table Header Row */}
                <div 
                  className="grid bg-slate-50/80 font-sans items-stretch border-b border-slate-200/80"
                  style={{ gridTemplateColumns: `100px repeat(${gridColumns.length}, minmax(180px, 1fr))` }}
                >
                  
                  {/* Top-Left Corner Cell */}
                  <div className="flex flex-col items-center justify-center bg-slate-100/70 border-r border-slate-200/80 p-3.5 text-center shrink-0">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Orari</span>
                    <span className="text-xs font-bold text-[#1a2035] mt-1 font-mono">{selectedDate.slice(5)}</span>
                  </div>

                  {/* Employees listed horizontally side-by-side on vertical axes */}
                  {gridColumns.map((col, idx) => (
                    <div 
                      key={col.id} 
                      className={`text-center py-4 px-3 flex flex-col justify-center items-center ${idx < gridColumns.length - 1 ? "border-r border-slate-200/80" : ""}`}
                    >
                      <span className="block text-xs font-bold text-[#1a2035] font-sans tracking-tight leading-tight">
                        {col.name}
                      </span>
                      <span className="block text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">
                        {col.role}
                      </span>
                    </div>
                  ))}

                </div>

                {/* 2D Table Row Space Grid */}
                <div className="divide-y divide-slate-100">
                  {activeTimeSlots.map((slot) => (
                    <div 
                      key={slot} 
                      className="grid items-stretch min-h-[66px]"
                      style={{ gridTemplateColumns: `100px repeat(${gridColumns.length}, minmax(180px, 1fr))` }}
                    >
                      {/* Left-most cell indicating Orario Time */}
                      <div className="flex flex-col items-center justify-center bg-slate-50/40 border-r border-slate-200/80 py-3 font-sans shrink-0">
                        <span className="text-xs font-bold text-[#1a2035] leading-none font-mono">{slot}</span>
                        <span className="text-[8px] text-slate-400 uppercase font-bold leading-none mt-1">Slot 30m</span>
                      </div>

                      {/* Map employees cell blocks list */}
                      {gridColumns.map((col, idx) => {
                        const cellAppts = getAppointmentsForCell(slot, col.name);

                        return (
                          <div 
                            key={`${col.id}-${slot}`} 
                            className={`p-1.5 flex flex-col justify-center min-h-[66px] relative group hover:bg-slate-50/50 transition-all ${idx < gridColumns.length - 1 ? "border-r border-slate-200/80" : ""}`}
                          >
                            {cellAppts.length > 0 ? (
                              cellAppts.map((appt) => (
                                <div
                                  key={appt.id}
                                  onClick={() => setActiveAppointment(appt)}
                                  className={`p-2.5 rounded-2xl text-left border cursor-pointer hover:shadow-xs transition-all text-xs h-full flex flex-col justify-between font-sans relative overflow-hidden active:scale-95 shadow-2xs ${getStatusStyle(appt.status)}`}
                                >
                                  {inlineDeleteId === appt.id ? (
                                    <div 
                                      className="absolute inset-0 bg-rose-600 text-white z-20 rounded-2xl p-2 flex flex-col justify-between animate-fadeIn text-[10px]"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <p className="font-bold text-center leading-tight">Eliminare definitivamente?</p>
                                      <div className="flex items-center justify-center gap-2 mt-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleDeleteAppointment(appt);
                                            setInlineDeleteId(null);
                                          }}
                                          className="bg-white text-rose-600 px-2.5 py-0.5 rounded-lg font-bold uppercase transition-transform cursor-pointer shadow-2xs text-[9px] active:scale-95"
                                        >
                                          Sì
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setInlineDeleteId(null)}
                                          className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded-lg font-bold uppercase transition-transform cursor-pointer text-[9px] active:scale-95"
                                        >
                                          No
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}

                                  <div>
                                    <p className="font-bold leading-tight text-[11px] flex items-center justify-between gap-1">
                                      <span className="truncate flex-1 flex items-center gap-1">
                                        {isFlashSlotAppointment(appt) && (
                                          <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[8px] font-bold uppercase px-1 rounded-md inline-flex items-center gap-0.5 shrink-0 shadow-2xs" title="Prenotazione da Flash Slot">
                                            <Zap className="w-2 h-2 text-amber-600 fill-amber-500" />
                                            <span>Flash</span>
                                          </span>
                                        )}
                                        <span className="truncate text-[#1a2035]">{appt.customerName}</span>
                                      </span>
                                      <span className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenTechSheet(appt.customerId);
                                          }}
                                          className="p-1 bg-white/90 hover:bg-[#eef2ff] text-slate-700 hover:text-[#1a3a8f] border border-slate-200/80 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95"
                                          title="Apri Scheda Tecnica"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-[#1a3a8f]" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setInlineDeleteId(appt.id);
                                          }}
                                          className="p-1 bg-white/90 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200/80 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95"
                                          title="Elimina rapidamente appuntamento"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                        </button>
                                      </span>
                                      {appt.status === "completed" && <span className="text-[9px] shrink-0">⭐</span>}
                                    </p>
                                    <p className="text-[9px] font-medium opacity-85 mt-0.5 truncate text-slate-600">
                                      ✂️ {appt.serviceName}
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-black/5 text-[8px] font-bold opacity-85">
                                    <span className="text-slate-500">{appt.duration}m</span>
                                    {appt.status !== "completed" ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCheckoutAppointment(appt);
                                        }}
                                        className="bg-emerald-600 text-white rounded-lg px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider flex items-center gap-0.5 hover:bg-emerald-700 transition-all cursor-pointer shadow-2xs active:scale-95"
                                        title="Incassa e Completa"
                                      >
                                        Cassa 💸
                                      </button>
                                    ) : (
                                      <span className="text-emerald-700 font-bold">✓ Pagato</span>
                                    )}
                                    {isFlashSlotAppointment(appt) ? (
                                      <span className="text-[8px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md leading-none shadow-2xs">
                                        Da definire
                                      </span>
                                    ) : (
                                      <span className="font-mono text-slate-800 font-bold">€{appt.price?.toFixed(0)}</span>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              /* Empty space with nice clean button helper to allow quick booking on click */
                              <button
                                type="button"
                                onClick={() => handleQuickBook(slot, col.name === "Qualsiasi" ? "Qualsiasi" : col.name)}
                                className="group/btn lg:opacity-0 lg:group-hover:opacity-100 w-full h-full min-h-[46px] border border-dashed border-slate-200/80 hover:border-[#1a3a8f]/30 hover:bg-[#eef2ff]/40 flex items-center justify-center gap-1.5 text-[9px] font-bold text-[#1a3a8f] rounded-2xl transition-all cursor-pointer active:scale-95"
                              >
                                <Plus className="w-3.5 h-3.5 text-[#1a3a8f]" />
                                <span className="font-mono">{slot}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>

          {/* Quick Check-in Drawer Sidebar Details Panel for Day Grid */}
          {activeAppointment && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 md:p-6 space-y-4 animate-fadeIn relative mt-4 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveAppointment(null)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-[#eef2ff] flex items-center justify-center text-[#1a3a8f] shadow-2xs border border-[#1a3a8f]/10 shrink-0">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/10 px-2.5 py-0.5 rounded-full shadow-2xs">
                       Slot {activeAppointment.time} del {activeAppointment.date}
                    </span>
                    {isFlashSlotAppointment(activeAppointment) && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                        <Zap className="w-2.5 h-2.5 text-amber-600 fill-amber-500" />
                        Flash Slot
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-[#1a2035] mt-1 tracking-tight">
                    Gestisci Prenotazione: {activeAppointment.customerName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider shrink-0">
                      Negozio: {salonsMap[activeAppointment.salonId] || "Sede"}
                    </p>
                    <span className="hidden sm:inline text-slate-300 select-none">•</span>
                    <button
                      type="button"
                      onClick={() => handleOpenTechSheet(activeAppointment.customerId)}
                      className="text-[10px] sm:text-[11px] font-bold text-[#1a3a8f] hover:text-[#152f73] bg-[#eef2ff] border border-[#1a3a8f]/10 px-3 py-1 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs active:scale-95"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#1a3a8f]" />
                      Apri Scheda Tecnica
                    </button>
                  </div>
                </div>
              </div>

              {isFlashSlotAppointment(activeAppointment) && (
                <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-900 shadow-2xs">
                  <div className="w-7 h-7 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-4 h-4 text-amber-600 fill-amber-500" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold uppercase tracking-wide text-[10px] text-amber-900">
                      Prenotazione Acquisita tramite Flash Slot (Magic Link WhatsApp)
                    </p>
                    <p className="text-[11px] text-amber-800/90 font-medium leading-relaxed">
                      Il cliente si è aggiudicato il posto rapido. I trattamenti eseguiti e il prezzo finale verranno registrati e saldati in cassa.
                    </p>
                  </div>
                </div>
              )}

              {/* Detail list details */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Trattamento</span>
                  <span className="font-bold text-[#1a2035]">{activeAppointment.serviceName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Operatore</span>
                  <span className="font-bold text-[#1a2035]">{activeAppointment.staffName || "Non specificato"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Prezzo</span>
                  {isFlashSlotAppointment(activeAppointment) ? (
                    <span className="font-bold text-amber-800 text-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      Da definire in cassa
                    </span>
                  ) : (
                    <span className="font-bold font-mono text-[#1a3a8f]">€{activeAppointment.price?.toFixed(2)}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Stato</span>
                  <span className="inline-block mt-0.5 px-2.5 py-0.5 font-bold uppercase text-[9px] rounded-full border bg-white border-slate-200/80 shadow-2xs">
                    {getStatusLabelText(activeAppointment.status)}
                  </span>
                </div>
              </div>

              {/* Prominent Checkout / Cassa Action Callout */}
              {activeAppointment.status !== "completed" && (
                <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-fadeIn">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                      💸 Cassa e Pagamento Rapido
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Procedi al saldo, verifica i dati e finalizza il check-out dell'appuntamento.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckoutAppointment(activeAppointment)}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-2xs active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>Incassa e Completa ➔</span>
                  </button>
                </div>
              )}

              {/* Direct update actions */}
              <div className="space-y-2 pt-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Stato Avanzamento / Azioni Veloci
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setCheckoutAppointment(activeAppointment)}
                    className={`p-2.5 border rounded-2xl text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-1 active:scale-95 shadow-2xs ${
                      (activeAppointment.status === "completed" || activeAppointment.status === "confirmed")
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                        : "border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    Conferma 💸
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(activeAppointment.id, "pending")}
                    className={`p-2.5 border rounded-2xl text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95 shadow-2xs ${
                      (!activeAppointment.status || activeAppointment.status === "pending")
                        ? "bg-amber-500 border-amber-500 text-white shadow-xs"
                        : "border-amber-200 bg-amber-50/40 text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    In Attesa
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(activeAppointment.id, "cancelled")}
                    className={`p-2.5 border rounded-2xl text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95 shadow-2xs ${
                      activeAppointment.status === "cancelled"
                        ? "bg-rose-600 border-rose-600 text-white shadow-xs"
                        : "border-rose-200 bg-rose-50/40 text-rose-700 hover:bg-rose-50"
                    }`}
                  >
                    Annulla
                  </button>
                </div>
              </div>

              {/* Flash Slot One-Click Recovery Banner if Cancelled */}
              {activeAppointment.status === "cancelled" && (
                <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-indigo-500/10 border border-amber-400/40 rounded-3xl p-4 space-y-2.5 shadow-2xs">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-amber-400 text-slate-950 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                      <Sparkles className="w-3 h-3" />
                      Slot Liberato!
                    </span>
                    <span className="text-xs font-bold text-slate-900">Riempi subito il buco in agenda</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Lancia la <strong>Caccia alla Poltrona</strong>: il sistema invierà un allarme WhatsApp ai clienti inattivi con un Magic Link a tempo per aggiudicarsi il posto.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFlashSlotModalState({
                      isOpen: true,
                      salonId: activeAppointment.salonId,
                      date: activeAppointment.date,
                      time: activeAppointment.time,
                      staffName: activeAppointment.staffName,
                      serviceId: activeAppointment.serviceId,
                      serviceName: activeAppointment.serviceName,
                      price: activeAppointment.price,
                      excludedCustomerId: activeAppointment.customerId,
                    })}
                    className="w-full bg-[#1a3a8f] hover:bg-[#132c6e] active:scale-[0.98] text-white font-bold py-2.5 px-3 rounded-2xl uppercase tracking-wider text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>⚡ Lancia Allarme WhatsApp Flash Slot</span>
                  </button>
                </div>
              )}

              {/* Delete event row */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                {deleteConfirmId === activeAppointment.id ? (
                  <>
                    <span className="text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200 animate-pulse text-[11px]">
                      ⚠️ Confermare l'eliminazione definitiva?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteAppointment(activeAppointment)}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[9.5px] cursor-pointer shadow-2xs transition-all active:scale-95"
                      >
                        Sì, elimina
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[9.5px] cursor-pointer transition-all active:scale-95"
                      >
                        Annulla
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400 font-medium">Desideri eliminare la prenotazione?</span>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(activeAppointment.id)}
                      className="text-rose-600 hover:bg-rose-50 hover:border-rose-200 p-2 border border-transparent rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all text-[9.5px] uppercase tracking-wider active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Elimina Definitivamente
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Flash Slot Immediate Recovery Prompt Modal right after deletion */}
      {deletedApptRecoveryPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200/80 shadow-2xl overflow-hidden p-6 sm:p-7 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shadow-2xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setDeletedApptRecoveryPrompt(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="bg-amber-100/90 text-amber-900 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-amber-300 inline-flex items-center gap-1 shadow-2xs">
                ⚡ Posto Liberato in Agenda
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-[#1a2035] tracking-tight">
                Vuoi ricoprire subito questo appuntamento?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Hai appena eliminato l'appuntamento di <strong>{deletedApptRecoveryPrompt.customerName}</strong>.
                Vuoi lanciare un allarme <strong>Flash Slot (Caccia alla Poltrona)</strong> su WhatsApp per riempire all'istante questo buco?
              </p>
            </div>

            {/* Appointment Slot Details Box */}
            <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold">Orario & Data:</span>
                <span className="font-bold text-[#1a2035] font-mono">⏰ {deletedApptRecoveryPrompt.time} · 📅 {deletedApptRecoveryPrompt.date}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold">Trattamento:</span>
                <span className="font-bold text-[#1a2035]">✂️ {deletedApptRecoveryPrompt.serviceName}</span>
              </div>
              {deletedApptRecoveryPrompt.staffName && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">Operatore:</span>
                  <span className="font-bold text-[#1a2035]">👤 {deletedApptRecoveryPrompt.staffName}</span>
                </div>
              )}
              {deletedApptRecoveryPrompt.price !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">Prezzo Base:</span>
                  <span className="font-bold text-[#1a3a8f] font-mono text-sm">€{deletedApptRecoveryPrompt.price}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  const appt = deletedApptRecoveryPrompt;
                  setDeletedApptRecoveryPrompt(null);
                  setFlashSlotModalState({
                    isOpen: true,
                    salonId: appt.salonId,
                    date: appt.date,
                    time: appt.time,
                    staffName: appt.staffName,
                    serviceId: appt.serviceId,
                    serviceName: appt.serviceName,
                    price: appt.price,
                    excludedCustomerId: appt.customerId,
                  });
                }}
                className="w-full sm:flex-1 bg-[#1a3a8f] hover:bg-[#132c6e] active:scale-[0.98] text-white font-bold py-3 px-4 rounded-2xl uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>⚡ Sì, Lancia Flash Slot</span>
              </button>
              <button
                type="button"
                onClick={() => setDeletedApptRecoveryPrompt(null)}
                className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-5 rounded-2xl uppercase tracking-wider text-xs cursor-pointer transition-all active:scale-[0.98]"
              >
                No, lascia vuoto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main reservation dialog modals */}
      {bookingOpen && (
        <BookingModal
          isOpen={bookingOpen}
          onClose={() => setBookingOpen(false)}
          initialSalonId={selectedSalonId !== "all" ? selectedSalonId : undefined}
          initialDate={selectedDate}
        />
      )}

      {/* Flash Slot launch modal */}
      {flashSlotModalState && flashSlotModalState.isOpen && (
        <FlashSlotModal
          isOpen={flashSlotModalState.isOpen}
          onClose={() => setFlashSlotModalState(null)}
          initialSalonId={flashSlotModalState.salonId}
          initialDate={flashSlotModalState.date}
          initialTime={flashSlotModalState.time}
          initialStaffName={flashSlotModalState.staffName}
          initialExcludedCustomerId={flashSlotModalState.excludedCustomerId}
        />
      )}

      {/* Checkout and Payment finalization modal */}
      {checkoutAppointment && (
        <FinalizeCheckoutModal
          isOpen={!!checkoutAppointment}
          onClose={() => setCheckoutAppointment(null)}
          appointment={checkoutAppointment}
          onSuccess={(updatedAppt) => {
            setActiveAppointment(updatedAppt);
            setCheckoutAppointment(null);
          }}
        />
      )}

      {/* Grid specific fast reservation trigger modal */}
      {quickBookState && quickBookState.isOpen && (
        <BookingModal
          isOpen={quickBookState.isOpen}
          onClose={() => setQuickBookState(null)}
          initialSalonId={selectedSalonId !== "all" ? selectedSalonId : undefined}
          initialDate={quickBookState.date}
          initialTime={quickBookState.time}
          initialStaffName={quickBookState.staffName !== "Qualsiasi" ? quickBookState.staffName : ""}
        />
      )}

      {/* Scheda Tecnica Overlay Modal */}
      {techSheetCustomerId && activeCustomerForSheet && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm shadow-2xl" onClick={() => setTechSheetCustomerId(null)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-2xl rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
            {/* Header */}
            <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <span className="text-[10px] bg-[#eef2ff] border border-[#1a3a8f]/10 text-[#1a3a8f] px-3 py-1 rounded-full font-bold uppercase tracking-wider select-none shadow-2xs">
                  Scheda Tecnica Cliente
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-[#1a2035] mt-1.5 leading-tight tracking-tight">
                  {activeCustomerForSheet.name}
                </h3>
              </div>
              <button 
                onClick={() => setTechSheetCustomerId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
                title="Chiudi Scheda"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-6 sm:p-8 space-y-6">
              
              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 border border-slate-100 p-4 rounded-2xl text-xs shadow-2xs">
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Telefono</span>
                  {activeCustomerForSheet.phone ? (
                    <a 
                      href={`tel:${activeCustomerForSheet.phone}`} 
                      className="text-[#1a3a8f] font-bold hover:underline hover:text-[#152f73] transition-all flex items-center gap-1 mt-1 font-mono text-sm"
                    >
                      📞 {activeCustomerForSheet.phone}
                    </a>
                  ) : (
                    <span className="text-slate-400 italic block mt-1">Non disponibile</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Email</span>
                  {activeCustomerForSheet.email ? (
                    <span className="text-[#1a2035] font-bold mt-1 block truncate font-mono text-sm">
                      ✉️ {activeCustomerForSheet.email}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic mt-1 block">Non disponibile</span>
                  )}
                </div>
              </div>

              {/* Formula & Tech Notes Panel (Editable) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                    <FileText className="w-4 h-4 text-[#1a3a8f]" />
                    Note Tecniche, Formule Capelli & Storico
                  </label>
                  {techSheetNotes && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(techSheetNotes);
                        setCopiedNotes(true);
                        setTimeout(() => setCopiedNotes(false), 2000);
                      }}
                      className="text-[11px] font-bold text-[#1a3a8f] hover:text-[#152f73] flex items-center gap-1 cursor-pointer select-none bg-[#eef2ff] border border-[#1a3a8f]/10 px-3 py-1 rounded-xl shadow-2xs active:scale-95 transition-all"
                    >
                      {copiedNotes ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Nota Copiata!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copia Appunti
                        </>
                      )}
                    </button>
                  )}
                </div>

                <textarea
                  value={techSheetNotes}
                  onChange={(e) => setTechSheetNotes(e.target.value)}
                  placeholder="Inserisci qui le note tecniche di questo cliente (es. colore, trattamenti precedenti, preferenze, allergie)..."
                  rows={6}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-slate-100 font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/20 focus:border-[#1a3a8f] leading-relaxed resize-y shadow-md"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveTechNotes}
                    disabled={savingNotes}
                    className="bg-[#1a3a8f] hover:bg-[#132c6e] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-2xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
                  >
                    {savingNotes ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Salvataggio...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Salva Note Tecniche
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Custom Prices List for this client */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div>
                  <h4 className="text-lg font-bold text-[#1a2035] flex items-center gap-2 tracking-tight">
                    <Coins className="w-5 h-5 text-amber-500" />
                    Tariffe Speciali Dedicate a questo Cliente
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Questi prezzi personalizzati sovrascrivono la tariffa di listino standard per le prenotazioni di questo cliente.
                  </p>
                </div>

                {businessSettings?.userPlan === "solo_pro" ? (
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-3xl p-6 text-center shadow-2xs space-y-4 relative overflow-hidden">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 mx-auto shadow-2xs">
                      <Lock className="w-6 h-6" />
                    </div>

                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 text-[9px] font-bold uppercase tracking-wider border border-amber-200 shadow-2xs">
                        Disponibile nel piano Network
                      </span>
                      <h4 className="text-lg font-bold text-[#1a2035] tracking-tight">
                        Funzionalità Bloccata
                      </h4>
                      <p className="text-slate-500 text-xs max-w-sm mx-auto leading-relaxed">
                        Il tuo piano attuale (<strong>Solo Pro</strong>) non include l'associazione di tariffe speciali o listini prezzi dedicati per i clienti.
                      </p>
                    </div>

                    {setCurrentTab && (
                      <button
                        type="button"
                        onClick={() => {
                          setTechSheetCustomerId(null);
                          setCurrentTab("account_info");
                        }}
                        className="bg-[#1a3a8f] hover:bg-[#132c6e] text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xs transition-all inline-flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        Sblocca ora <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  techSheetCustomPrices.length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 text-center">
                      Nessuna tariffa speciale è attualmente associata a questo cliente. I trattamenti seguono il prezzo standard del listino.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {techSheetCustomPrices.map((cp) => (
                        <div 
                          key={cp.id}
                          className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-3.5 flex items-center justify-between text-xs font-semibold hover:bg-amber-50/80 duration-150 shadow-2xs"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="text-[#1a2035] truncate font-bold" title={cp.serviceName}>{cp.serviceName}</p>
                            <p className="text-[10px] text-slate-400 font-medium">Tariffa personalizzata</p>
                          </div>
                          <span className="text-xs font-bold text-amber-900 bg-white px-2.5 py-1 rounded-xl border border-amber-200 font-mono shrink-0 shadow-2xs">
                            €{cp.price?.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 sm:px-8 py-4 bg-slate-50/70 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setTechSheetCustomerId(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs uppercase tracking-wider font-bold px-5 py-2.5 rounded-2xl transition-all cursor-pointer active:scale-95"
              >
                Chiudi Scheda
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
