import React, { useState, useEffect, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot,
  doc,
  runTransaction,
  setDoc
} from "firebase/firestore";
import { z } from "zod";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  X, 
  Loader2, 
  AlertCircle, 
  Calendar, 
  Clock, 
  User as UserIcon, 
  Scissors, 
  Store, 
  Sparkles,
  DollarSign,
  Check
} from "lucide-react";
import { CustomPrice, TeamMember } from "../types";

function isDayAndTimePossible(appointmentDateStr: string, appointmentTimeStr: string, hoursStr: string): { possible: boolean; reason?: string } {
  if (!hoursStr) return { possible: true };
  
  // 1. Check Day of Week
  const parts = hoursStr.split(":");
  let daysPart = hoursStr;
  let timePart = hoursStr;
  
  if (parts.length >= 2) {
    daysPart = parts[0].trim();
    timePart = parts.slice(1).join(":").trim();
  }
  
  // Get appointment day index (0 = Sunday, 1 = Monday ...)
  const dParts = appointmentDateStr.split("-").map(Number);
  if (dParts.length !== 3 || isNaN(dParts[0])) return { possible: true };
  // safe local date construction to avoid timezone drift
  const dt = new Date(dParts[0], dParts[1] - 1, dParts[2]);
  const dayIndex = dt.getDay(); 
  
  const ITALIAN_DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const appDayName = ITALIAN_DAYS[dayIndex];
  const appDayShort = appDayName.substring(0, 3).toLowerCase(); // "lun", "mar", "mer", "gio", "ven", "sab", "dom"
  
  const daysLower = daysPart.toLowerCase();
  let dayIsOP = false;
  
  if (daysLower.includes("ogni giorno") || daysLower.includes("tutti i giorni")) {
    dayIsOP = true;
  } else if (daysLower.includes("lun - sab") || daysLower.includes("lunedì - sabato")) {
    dayIsOP = dayIndex >= 1 && dayIndex <= 6;
  } else if (daysLower.includes("lun - ven") || daysLower.includes("lunedì - venerdì")) {
    dayIsOP = dayIndex >= 1 && dayIndex <= 5;
  } else if (daysLower.includes("-")) {
    // Range check (e.g. "lun - gio")
    const bounds = daysLower.split("-").map(b => b.trim());
    if (bounds.length === 2) {
      const DAY_ABBRS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
      const startIdx = DAY_ABBRS.findIndex(a => bounds[0].startsWith(a));
      const endIdx = DAY_ABBRS.findIndex(a => bounds[1].startsWith(a));
      if (startIdx !== -1 && endIdx !== -1) {
        if (startIdx <= endIdx) {
          dayIsOP = dayIndex >= startIdx && dayIndex <= endIdx;
        } else {
          dayIsOP = dayIndex >= startIdx || dayIndex <= endIdx;
        }
      } else {
        dayIsOP = true;
      }
    } else {
      dayIsOP = true;
    }
  } else {
    // Comma-separated list of short abbreviations (e.g. "lun, mar, ven")
    const tokens = daysLower.split(/[\s,]+/).map(t => t.trim());
    dayIsOP = tokens.some(tok => tok.startsWith(appDayShort) || appDayShort.startsWith(tok));
  }
  
  if (!dayIsOP) {
    return { 
      possible: false, 
      reason: `La Sede è chiusa il giorno di ${appDayName} (Giorni attivi: ${daysPart}).` 
    };
  }
  
  // 2. Check operational hours
  const times = timePart.split("-");
  if (times.length !== 2) return { possible: true };
  
  const start = times[0].trim();
  const end = times[1].trim();
  
  const matchesStart = start.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/);
  const matchesEnd = end.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/);
  const matchesInput = appointmentTimeStr.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/);
  
  if (!matchesStart || !matchesEnd || !matchesInput) return { possible: true };
  
  const inside = appointmentTimeStr >= start && appointmentTimeStr <= end;
  if (!inside) {
    return { 
      possible: false, 
      reason: `L'orario richiesto (${appointmentTimeStr}) è fuori dalla fascia operativa del salone (${start} - ${end}).` 
    };
  }
  
  return { possible: true };
}

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  initialTime?: string;
  initialStaffName?: string;
  initialSalonId?: string;
}

export default function BookingModal({ 
  isOpen, 
  onClose,
  initialDate,
  initialTime,
  initialStaffName,
  initialSalonId
}: BookingModalProps) {
  const { user, salons, services, customers, ownerId, userRole, userSalonIds, businessSettings } = useBusiness();
  const isSoloPro = businessSettings?.userPlan === "solo_pro";

  // Form Fields
  const [salonId, setSalonId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedStaffNames, setSelectedStaffNames] = useState<string[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [applyCustomDiscount, setApplyCustomDiscount] = useState(true);

  // Reset custom price toggle on selection change
  useEffect(() => {
    setApplyCustomDiscount(true);
  }, [customerId, selectedServiceIds]);

  const [team, setTeam] = useState<TeamMember[]>([]);

  // Subscribe to real-time team list
  useEffect(() => {
    if (!ownerId || !isOpen) return;
    const unsub = onSnapshot(
      query(collection(db, "team"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TeamMember[];
        // Deduplicate team members by email to prevent showing clones (e.g. self-healed UID doc)
        const uniqueMap = new Map<string, TeamMember>();
        list.forEach(m => {
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
        const uniqueList = Array.from(uniqueMap.values());
        
        let filtered = uniqueList;
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = uniqueList.filter(t => t.salonIds && t.salonIds.some(id => allowedIds.includes(id)));
        }
        setTeam(filtered);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "team");
      }
    );
    return () => unsub();
  }, [ownerId, isOpen, userRole, userSalonIds]);

  // Pre-fill fields if custom initial values are supplied
  useEffect(() => {
    if (isOpen) {
      if (initialDate) setDate(initialDate);
      if (initialTime) setTime(initialTime);
      if (initialSalonId) setSalonId(initialSalonId);

      if (initialStaffName) {
        if (initialStaffName === "Qualsiasi" || initialStaffName.trim() === "") {
          setSelectedStaffNames([]);
        } else {
          const names = initialStaffName.split(",").map(n => n.trim()).filter(Boolean);
          setSelectedStaffNames(names);
        }
      } else {
        setSelectedStaffNames([]);
      }
    }
  }, [isOpen, initialDate, initialTime, initialStaffName, initialSalonId]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Retrieve current active salon
  const selectedSalonObj = useMemo(() => {
    return salons.find(s => s.id === salonId) || null;
  }, [salons, salonId]);

  // Custom prices storage to analyze active tariff modifications
  const [customPrices, setCustomPrices] = useState<CustomPrice[]>([]);

  useEffect(() => {
    if (!ownerId || !isOpen) return;
    const unsub = onSnapshot(
      query(collection(db, "custom_prices"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CustomPrice[];
        setCustomPrices(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "custom_prices");
      }
    );
    return () => unsub();
  }, [ownerId, isOpen]);

  // Set default selectors when lists are loaded / salon modifications occur
  useEffect(() => {
    if (isOpen) {
      if (salons.length > 0 && !salonId) {
        setSalonId(salons[0].id);
      }
    }
  }, [isOpen, salons, salonId]);

  // Filtered Customers based on selected salonId (Sede Operativa)
  const filteredCustomers = useMemo(() => {
    if (!salonId) return [];
    return customers.filter(c => c.salonId === salonId);
  }, [customers, salonId]);

  // Sync customerId select state in base of active filteredCustomers list
  useEffect(() => {
    if (isOpen) {
      if (filteredCustomers.length > 0) {
        const isValidCurrent = filteredCustomers.some(c => c.id === customerId);
        if (!customerId || !isValidCurrent) {
          setCustomerId(filteredCustomers[0].id);
        }
      } else {
        setCustomerId("");
      }
    }
  }, [isOpen, filteredCustomers, customerId]);

  // Filtered Services based on current salonId
  const filteredServices = useMemo(() => {
    let list = services;
    if (salonId) {
      list = list.filter(s => !s.salonIds || s.salonIds.length === 0 || s.salonIds.includes(salonId));
    }
    return list;
  }, [services, salonId]);

  // Sync selectedServiceIds default selector
  useEffect(() => {
    if (isOpen) {
      if (filteredServices.length > 0) {
        const validCurrent = selectedServiceIds.filter(id => filteredServices.some(s => s.id === id));
        if (validCurrent.length > 0) {
          setSelectedServiceIds(validCurrent);
        } else {
          setSelectedServiceIds([filteredServices[0].id]);
        }
      } else {
        setSelectedServiceIds([]);
      }
    }
  }, [isOpen, filteredServices]);

  // Filtered Team Members based on selected salonId
  const filteredTeam = useMemo(() => {
    if (!salonId) return [];
    return team.filter(m => m.salonIds?.includes(salonId));
  }, [team, salonId]);

  // Toggle staff selection helper support multiple selections
  const toggleStaffSelection = (name: string) => {
    if (name === "Qualsiasi") {
      setSelectedStaffNames([]);
    } else {
      setSelectedStaffNames(prev => {
        if (prev.includes(name)) {
          const updated = prev.filter(x => x !== name);
          return updated;
        } else {
          return [...prev, name];
        }
      });
    }
  };

  const clientHasCustomPrice = useMemo(() => {
    if (isSoloPro) return false;
    return selectedServiceIds.some(sId => 
      customPrices.some(cp => cp.customerId === customerId && cp.serviceId === sId)
    );
  }, [customerId, selectedServiceIds, customPrices, isSoloPro]);

  // Compute actual price checking custom_prices override for ALL selected services
  const priceCalculation = useMemo(() => {
    if (selectedServiceIds.length === 0) return { value: 0, isCustom: false, servicesList: [] };

    let total = 0;
    let anyCustom = false;
    const details: { name: string; price: number; isCustom: boolean; originalPrice: number }[] = [];

    selectedServiceIds.forEach(sId => {
      const sObj = services.find(s => s.id === sId);
      if (!sObj) return;

      const isCustomOverride = isSoloPro ? null : customPrices.find(
        cp => cp.customerId === customerId && cp.serviceId === sId
      );

      if (isCustomOverride && applyCustomDiscount) {
        total += isCustomOverride.price;
        anyCustom = true;
        details.push({
          name: sObj.name,
          price: isCustomOverride.price,
          isCustom: true,
          originalPrice: sObj.price
        });
      } else {
        total += sObj.price;
        details.push({
          name: sObj.name,
          price: sObj.price,
          isCustom: false,
          originalPrice: sObj.price
        });
      }
    });

    return {
      value: total,
      isCustom: anyCustom,
      servicesList: details
    };
  }, [customerId, selectedServiceIds, services, customPrices, applyCustomDiscount, isSoloPro]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!salonId) {
      setErrorMsg("Completa la configurazione: seleziona un salone.");
      return;
    }
    if (!customerId) {
      setErrorMsg("Seleziona o crea un cliente in anagrafica prima.");
      return;
    }
    if (selectedServiceIds.length === 0) {
      setErrorMsg("Definisci almeno un servizio di listino prima di prenotare.");
      return;
    }
    if (!date) {
      setErrorMsg("Scegli una data valida per l'appuntamento.");
      return;
    }
    if (!time) {
      setErrorMsg("Seleziona un orario valido.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const chosenCustomer = customers.find(c => c.id === customerId);
      const chosenServices = selectedServiceIds
        .map(id => services.find(s => s.id === id))
        .filter(Boolean);
      const chosenSalon = salons.find(s => s.id === salonId);

      if (!chosenCustomer || chosenServices.length === 0) {
        setErrorMsg("Errore di correlazione dati: cliente o servizi inesistenti.");
        setSaving(false);
        return;
      }

      if (chosenSalon && chosenSalon.hours) {
        const check = isDayAndTimePossible(date, time, chosenSalon.hours);
        if (!check.possible) {
          setErrorMsg(check.reason || "Orario e giorno scelto fuori fascia operativa.");
          setSaving(false);
          return;
        }
      }

      let serviceNameJoined = chosenServices.map(s => s!.name).join(", ");
      if (serviceNameJoined.length > 128) {
        serviceNameJoined = serviceNameJoined.substring(0, 125) + "...";
      }

      const serviceIdJoined = selectedServiceIds.join(",");
      const totalDuration = chosenServices.reduce((sum, s) => sum + (s!.duration || 0), 0);
      const staffKey = selectedStaffNames.length > 0 ? selectedStaffNames.join(", ") : "Qualsiasi";

      // 1. Structured input validation using Zod
      const bookingPayload = {
        customerId,
        customerName: chosenCustomer.name,
        serviceId: serviceIdJoined,
        serviceName: serviceNameJoined,
        salonId,
        staffName: staffKey,
        date,
        time,
        duration: totalDuration || 30,
        price: priceCalculation.value,
        ownerId: ownerId || ""
      };

      const bookingSchema = z.object({
        customerId: z.string().min(1, "ID Cliente obbligatorio"),
        customerName: z.string().min(1, "Nome Cliente obbligatorio"),
        serviceId: z.string().min(1, "Almeno un servizio deve essere selezionato"),
        serviceName: z.string().min(1, "Nomi dei servizi non validi"),
        salonId: z.string().min(1, "Sede operativa non selezionata"),
        staffName: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data non valido (YYYY-MM-DD)"),
        time: z.string().regex(/^\d{2}:\d{2}$/, "Formato ora non valido (HH:MM)"),
        duration: z.number().int().positive("La durata deve essere un intero positivo"),
        price: z.number().nonnegative("Il prezzo non può essere negativo"),
        ownerId: z.string().min(1, "ID Proprietario/tenant obbligatorio")
      });

      const validationResult = bookingSchema.safeParse(bookingPayload);
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(err => err.message).join(", ");
        setErrorMsg(`Errore validazione: ${errors}`);
        setSaving(false);
        return;
      }

      // 2. Prevent race conditions using atomicity and unique slot booking documents in a Firestore Transaction
      const sanitizedStaffKey = staffKey.replace(/[^a-zA-Z0-9]/g, "_");
      const slotId = `${salonId}_${date}_${time}_${sanitizedStaffKey}`;
      const slotRef = doc(db, "reserved_slots", slotId);

      if (!window.navigator.onLine) {
        // Offline: Bypassa la transazione perché le transazioni Firestore richiedono una connessione attiva.
        // Scriviamo direttamente nella cache locale, così lo slot/appuntamento appare istantaneamente.
        const newAppRef = doc(collection(db, "appointments"));

        const p1 = setDoc(slotRef, {
          booked: true,
          appointmentId: newAppRef.id,
          salonId,
          date,
          time,
          staffName: staffKey,
          ownerId: ownerId,
          createdAt: new Date().toISOString()
        });

        const p2 = setDoc(newAppRef, {
          customerId,
          customerName: chosenCustomer.name,
          serviceId: serviceIdJoined,
          serviceName: serviceNameJoined,
          salonId,
          staffName: staffKey,
          date,
          time,
          duration: totalDuration || 30,
          price: priceCalculation.value,
          status: "confirmed",
          ownerId: ownerId,
          createdAt: new Date().toISOString()
        });

        await Promise.all([p1, p2]);
        onClose();
        return;
      }

      const transactionPromise = runTransaction(db, async (transaction) => {
        const slotSnap = await transaction.get(slotRef);
        if (slotSnap.exists()) {
          throw new Error("RACE_CONDITION: Lo slot orario selezionato per questo operatore è già stato prenotato. Scegli un'altra combinazione.");
        }

        const newAppRef = doc(collection(db, "appointments"));

        // Atomically acquire lock/write slot document
        transaction.set(slotRef, {
          booked: true,
          appointmentId: newAppRef.id,
          salonId,
          date,
          time,
          staffName: staffKey,
          ownerId: ownerId,
          createdAt: new Date().toISOString()
        });

        // Atomically write the appointment document
        transaction.set(newAppRef, {
          customerId,
          customerName: chosenCustomer.name,
          serviceId: serviceIdJoined,
          serviceName: serviceNameJoined,
          salonId,
          staffName: staffKey,
          date,
          time,
          duration: totalDuration || 30,
          price: priceCalculation.value,
          status: "confirmed",
          ownerId: ownerId,
          createdAt: new Date().toISOString()
        });
      });

      // Se la connessione è molto lenta o instabile, chiudiamo il modal dopo 1 secondo e lasciamo completare l'operazione in background.
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
      await Promise.race([transactionPromise, timeoutPromise]);

      onClose();
    } catch (err: any) {
      console.error("Booking submit error", err);
      if (err.message && err.message.includes("RACE_CONDITION")) {
        setErrorMsg("Spiacenti, questo orario è stato appena prenotato da un altro utente. Riprova con un altro slot.");
      } else {
        handleFirestoreError(err, OperationType.CREATE, "appointments");
        setErrorMsg("Errore del server durante l'inserimento dell'appuntamento.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Container Card */}
      <div className="relative bg-white border border-gray-100 w-full max-w-lg rounded-2xl shadow-xl z-10 overflow-hidden animate-fadeIn flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-serif text-xl font-bold text-[#1a2035] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#1a3a8f]" />
            Nuovo Appuntamento in Agenda
          </h3>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Callout */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2 animate-fadeIn shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleBookingSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Salon Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                <Store className="w-3.5 h-3.5 text-gray-300" />
                Sede Operativa *
              </label>
              <select
                required
                value={salonId}
                onChange={(e) => setSalonId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-700 outline-none focus:border-[#1a3a8f] transition-all"
              >
                {salons.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {salons.length === 0 && <option value="">Nessun Salone Configurato</option>}
              </select>
            </div>

            {/* Customer Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-gray-300" />
                Cliente *
              </label>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-700 outline-none focus:border-[#1a3a8f] transition-all"
              >
                {filteredCustomers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                ))}
                {filteredCustomers.length === 0 && <option value="">Nessun Cliente Registrato in questa sede</option>}
              </select>
            </div>
          </div>

          {/* Trattamenti Selezionati & Selezione multipla */}
          <div className="space-y-3 p-4 border border-indigo-100 rounded-2xl bg-indigo-50/20">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#1a3a8f] uppercase tracking-wider flex items-center gap-1">
                <Scissors className="w-3.5 h-3.5 text-[#1a3a8f]" /> Servizi / Trattamenti Scelti *
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                  {selectedServiceIds.length} Selezionati
                </span>
                {selectedServiceIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedServiceIds([])}
                    className="text-[9px] font-bold text-red-600 hover:text-red-800 transition-colors cursor-pointer bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md border border-red-200/50"
                  >
                    Azzera
                  </button>
                )}
              </div>
            </div>

            {/* Flat Grid of Clickable Service Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1.5 border border-slate-200/60 rounded-xl bg-white shadow-inner">
              {filteredServices.length === 0 ? (
                <div className="col-span-full p-4 text-center text-xs text-gray-400 font-medium">
                  Nessun servizio disponibile per questa sede.
                </div>
              ) : (
                filteredServices.map((s) => {
                  const isSelected = selectedServiceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedServiceIds(prev => {
                          if (prev.includes(s.id)) {
                            return prev.filter(x => x !== s.id);
                          } else {
                            return [...prev, s.id];
                          }
                        });
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                        isSelected 
                          ? "bg-indigo-600 border-indigo-700 text-white shadow-xs scale-[1.01]" 
                          : "bg-slate-50/50 border-gray-200 hover:border-gray-300 text-gray-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 w-full">
                        <span className={`font-bold text-xs truncate ${isSelected ? "text-white" : "text-gray-800"}`}>
                          {s.name}
                        </span>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-white text-indigo-600 border-white" : "border-gray-300 bg-white"
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3.5px]" />}
                        </div>
                      </div>
                      <div className={`flex items-center justify-between mt-2 pt-1 border-t w-full select-none ${
                        isSelected ? "border-indigo-400" : "border-slate-100"
                      }`}>
                        <span className={`text-[10px] font-medium ${isSelected ? "text-indigo-200" : "text-gray-400"}`}>
                          ⏱️ {s.duration} min
                        </span>
                        <span className={`text-xs font-black ${isSelected ? "text-white" : "text-indigo-600"}`}>
                          €{s.price}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Multiple Staff Selection */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/60 space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5 text-gray-300" />
              Operatore / Staff *
              <span className="text-[10px] text-gray-400 normal-case font-medium ml-1">(Seleziona uno o più membri dello staff)</span>
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => toggleStaffSelection("Qualsiasi")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedStaffNames.length === 0
                    ? "bg-[#1a3a8f] text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                Qualsiasi
              </button>
              {filteredTeam.map(member => {
                const isSelected = selectedStaffNames.includes(member.name);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleStaffSelection(member.name)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-[#1a3a8f] text-white shadow-sm"
                        : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-green-400"}`}></span>
                    <span>{member.name}</span>
                    <span className="text-[9px] font-normal opacity-80">({member.role || "Stylist"})</span>
                  </button>
                );
              })}
            </div>
            {filteredTeam.length === 0 && (
              <p className="text-[10px] text-amber-700 font-semibold mt-1 bg-amber-50 p-2 rounded-lg border border-amber-100">
                ⚠️ Nessun membro del team associato alla sede operativa selezionata. Verrà assegnato a "Qualsiasi".
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-300" />
                Giorno Appuntamento *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#1a3a8f] transition-all"
              />
            </div>

            {/* Time Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-300" />
                Orario *
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#1a3a8f] transition-all"
              />
              {selectedSalonObj && (
                <p className="text-[10px] text-[#1a3a8f] font-medium mt-1">
                  Orario Sede: {selectedSalonObj.hours || "Non specificato"}
                </p>
              )}
            </div>
          </div>

           {/* Option to toggle custom price if available */}
          {clientHasCustomPrice && (
            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col gap-1.5 text-xs transition-all">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="apply-custom-price-checkbox"
                  checked={applyCustomDiscount}
                  onChange={(e) => setApplyCustomDiscount(e.target.checked)}
                  className="rounded border-gray-300 text-[#1a3a8f] focus:ring-[#1a3a8f] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="apply-custom-price-checkbox" className="text-gray-700 font-bold cursor-pointer">
                  Applica listini speciali / sconti personalizzati per questo cliente
                </label>
              </div>
              <div className="pl-6 space-y-1 text-[11px] text-gray-500">
                {selectedServiceIds.map(sId => {
                  const sObj = services.find(s => s.id === sId);
                  const cpObj = customPrices.find(cp => cp.customerId === customerId && cp.serviceId === sId);
                  if (!sObj || !cpObj) return null;
                  return (
                    <div key={sId} className="flex justify-between items-center">
                      <span>{sObj.name}</span>
                      <span>
                        <span className="line-through mr-1.5 text-gray-400">€{sObj.price.toFixed(2)}</span>
                        <span className="font-extrabold text-[#1a3a8f]">€{cpObj.price.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pricing check summary */}
          {selectedServiceIds.length > 0 && (
            <div className="bg-[#eef2ff]/40 border border-[#eef2ff] rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1 max-w-[70%]">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Tariffazione Calcolata</p>
                <div className="text-[11px] text-gray-500 font-medium space-y-0.5">
                  {priceCalculation.servicesList.map((item, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-1">
                      <span className="font-bold text-gray-700">{item.name}</span>
                      <span className="text-gray-400">({item.isCustom ? `Prezzo speciale: €${item.price.toFixed(2)}` : `€${item.price.toFixed(2)}`})</span>
                    </div>
                  ))}
                </div>
                {priceCalculation.isCustom && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-extrabold uppercase">
                    ⭐ Listino speciale applicato a uno o più trattamenti
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[#1a3a8f] font-mono font-black text-lg bg-white border border-[#eef2ff] p-2 rounded-xl shadow-sm">
                <span className="text-sm font-bold text-blue-550 mr-0.5">Totale:</span>
                <span>€{priceCalculation.value?.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Warnings if empty layouts */}
          {(salons.length === 0 || customers.length === 0 || services.length === 0) && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[11px] font-bold">
              ⚠️ Attenzione: Assicurati di aver configurato Saloni, Servizi e inserito Clienti in anagrafica prima di procedere.
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-xl text-xs font-semibold text-gray-500 bg-white hover:bg-gray-50 transition-all cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving || salons.length === 0 || customers.length === 0 || services.length === 0}
              className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:opacity-50 text-white rounded-xl px-5 py-2 text-xs font-semibold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                "Prenota Appuntamento"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
