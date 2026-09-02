import React, { useState, useEffect } from "react";
import { useBusiness } from "../context/BusinessContext";
import { PLAN_LIMITS } from "../lib/plans";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc,
  onSnapshot
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  Store, 
  MapPin, 
  Phone, 
  Clock, 
  Edit2, 
  Trash2, 
  Plus, 
  Loader2,
  X,
  AlertCircle,
  FileText,
  Building
} from "lucide-react";
import { Salon } from "../types";
import { isValidPartitaIva } from "./AccountInfoScreen";
import { COUNTRY_PREFIXES, splitPhoneNumber } from "./CustomersScreen";

const DAYS_OF_WEEK = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

const DAY_ABBREVIATIONS: { [key: string]: string } = {
  "Lunedì": "Lun",
  "Martedì": "Mar",
  "Mercoledì": "Mer",
  "Giovedì": "Gio",
  "Venerdì": "Ven",
  "Sabato": "Sab",
  "Domenica": "Dom"
};

const parseHoursDetailed = (hoursStr: string) => {
  let selectedDays: string[] = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  let open = "09:00";
  let close = "19:00";

  if (hoursStr) {
    if (hoursStr.includes(":")) {
      const parts = hoursStr.split(":");
      if (parts.length >= 2) {
        const daysPart = parts[0].trim();
        const timePart = parts.slice(1).join(":").trim();
        
        const times = timePart.split("-");
        if (times.length === 2) {
          open = times[0].trim();
          close = times[1].trim();
        }

        // Parse days selection from string
        const daysLower = daysPart.toLowerCase();
        if (daysLower === "ogni giorno") {
          selectedDays = [...DAYS_OF_WEEK];
        } else if (daysLower.includes("-")) {
          const bounds = daysPart.split("-").map(b => b.trim());
          if (bounds.length === 2) {
            const startFull = DAYS_OF_WEEK.find(d => d.toLowerCase().startsWith(bounds[0].toLowerCase().slice(0, 3))) || "Lunedì";
            const endFull = DAYS_OF_WEEK.find(d => d.toLowerCase().startsWith(bounds[1].toLowerCase().slice(0, 3))) || "Sabato";
            const startIndex = DAYS_OF_WEEK.indexOf(startFull);
            const endIndex = DAYS_OF_WEEK.indexOf(endFull);
            
            if (startIndex !== -1 && endIndex !== -1) {
              const arr: string[] = [];
              if (startIndex <= endIndex) {
                for (let i = startIndex; i <= endIndex; i++) {
                  arr.push(DAYS_OF_WEEK[i]);
                }
              } else {
                for (let i = startIndex; i < DAYS_OF_WEEK.length; i++) arr.push(DAYS_OF_WEEK[i]);
                for (let i = 0; i <= endIndex; i++) arr.push(DAYS_OF_WEEK[i]);
              }
              selectedDays = arr;
            }
          }
        } else {
          // Comma-separated abbreviations or day list
          const rawDays = daysPart.split(",").map(d => d.trim().toLowerCase());
          const temp: string[] = [];
          for (const fullDay of DAYS_OF_WEEK) {
            const matched = rawDays.some(rd => 
              fullDay.toLowerCase().startsWith(rd.slice(0, 3)) || 
              rd.startsWith(fullDay.toLowerCase().slice(0, 3))
            );
            if (matched) {
              temp.push(fullDay);
            }
          }
          if (temp.length > 0) {
            selectedDays = temp;
          }
        }
      }
    } else {
      const times = hoursStr.split("-");
      if (times.length === 2) {
        open = times[0].trim();
        close = times[1].trim();
      }
    }
  }
  return { selectedDays, open, close };
};

const serializeHours = (selectedDays: string[], open: string, close: string) => {
  if (selectedDays.length === 0) {
    return `Chiuso: ${open} - ${close}`;
  }
  
  const sortedDays = [...selectedDays].sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b));
  
  let daysHeader = "";
  if (sortedDays.length === 7) {
    daysHeader = "Ogni giorno";
  } else if (sortedDays.length === 6 && !sortedDays.includes("Domenica")) {
    daysHeader = "Lun - Sab";
  } else if (sortedDays.length === 5 && !sortedDays.includes("Sabato") && !sortedDays.includes("Domenica")) {
    daysHeader = "Lun - Ven";
  } else {
    // Check if continuous
    let isContinuous = true;
    const indices = sortedDays.map(d => DAYS_OF_WEEK.indexOf(d));
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) {
        isContinuous = false;
        break;
      }
    }
    
    if (isContinuous && sortedDays.length > 1) {
      const startAbbr = DAY_ABBREVIATIONS[sortedDays[0]];
      const endAbbr = DAY_ABBREVIATIONS[sortedDays[sortedDays.length - 1]];
      daysHeader = `${startAbbr} - ${endAbbr}`;
    } else {
      daysHeader = sortedDays.map(d => DAY_ABBREVIATIONS[d]).join(", ");
    }
  }
  
  return `${daysHeader}: ${open} - ${close}`;
};

export default function SalonsScreen() {
  const { user, salons, loading, userRole, businessSettings } = useBusiness();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSalon, setSelectedSalon] = useState<Salon | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("+39");
  const [phoneBody, setPhoneBody] = useState("");
  const [partitaIva, setPartitaIva] = useState("");
  const [useMainCompanyInfo, setUseMainCompanyInfo] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  
  // Custom structured hours inputs
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("19:00");
  const [selectedDays, setSelectedDays] = useState<string[]>(["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Main business settings loaded from account info
  const [mainBusinessSettings, setMainBusinessSettings] = useState<{ partitaIvaPrincipale: string; SedeLegale: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, "business_settings", user.uid);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMainBusinessSettings({
          partitaIvaPrincipale: data.partitaIvaPrincipale || "",
          SedeLegale: data.sedeLegale || ""
        });
      } else {
        setMainBusinessSettings(null);
      }
    }, (err) => {
      console.error("Error listening to main company settings in SalonsScreen:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // Handle USA i dati checkbox change
  const handleUseMainCompanyInfoChange = (checked: boolean) => {
    setUseMainCompanyInfo(checked);
    if (checked) {
      if (!mainBusinessSettings || !mainBusinessSettings.partitaIvaPrincipale) {
        setErrorMsg("Attenzione: Nessun dato aziendale principale configurato. Configura la Sede Legale e la Partita IVA principale nella sezione 'Informazioni Account'!");
        setUseMainCompanyInfo(false);
        return;
      }
      setPartitaIva(mainBusinessSettings.partitaIvaPrincipale);
      setAddress(mainBusinessSettings.SedeLegale);
      setErrorMsg("");
    } else {
      // clear fields on uncheck so they can re-enter manually if they want
      setPartitaIva("");
      setAddress("");
    }
  };

  // Custom modal delete confirm state
  const [deleteConfirmSalonId, setDeleteConfirmSalonId] = useState<string | null>(null);

  const openCreateModal = () => {
    setSelectedSalon(null);
    setName("");
    setAddress("");
    setPhone("");
    setPhonePrefix("+39");
    setPhoneBody("");
    setPartitaIva("");
    setUseMainCompanyInfo(false);
    setGoogleReviewUrl("");
    setOpenTime("09:00");
    setCloseTime("19:00");
    setSelectedDays(["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"]);
    
    const planKey = businessSettings?.userPlan || "network";
    const limit = PLAN_LIMITS[planKey]?.maxSalons || 6;
    if (salons.length >= limit) {
      setErrorMsg(`Limite raggiunto: Il tuo piano attuale (${PLAN_LIMITS[planKey]?.name || "Network"}) consente un massimo di ${limit} salone/i. Aggiorna il tuo abbonamento nel tuo Profilo (scheda Abbonamento) per sbloccare più sedi!`);
    } else {
      setErrorMsg("");
    }
    
    setModalOpen(true);
  };

  const openEditModal = (salon: Salon) => {
    setSelectedSalon(salon);
    setName(salon.name);
    setAddress(salon.address);
    setPhone(salon.phone);
    const parsed = splitPhoneNumber(salon.phone);
    setPhonePrefix(parsed.prefix);
    setPhoneBody(parsed.number);
    setPartitaIva(salon.partitaIva || "");
    setUseMainCompanyInfo(salon.useMainCompanyInfo || false);
    setGoogleReviewUrl(salon.googleReviewUrl || "");

    // Parse existing hours
    const parsedHours = parseHoursDetailed(salon.hours);
    setSelectedDays(parsedHours.selectedDays);
    setOpenTime(parsedHours.open);
    setCloseTime(parsedHours.close);

    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!selectedSalon) {
      const planKey = businessSettings?.userPlan || "network";
      const limit = PLAN_LIMITS[planKey]?.maxSalons || 6;
      if (salons.length >= limit) {
        setErrorMsg(`Limite raggiunto: Il tuo piano attuale (${PLAN_LIMITS[planKey]?.name || "Network"}) consente un massimo di ${limit} salone/i. Aggiorna il tuo abbonamento nel tuo Profilo (scheda Abbonamento) per sbloccare più sedi!`);
        return;
      }
    }

    if (!name.trim()) {
      setErrorMsg("Il nome del salone è obbligatorio");
      return;
    }

    const cleanedPiva = partitaIva.replace(/\s+/g, "");
    if (!cleanedPiva) {
      setErrorMsg("La Partita IVA è obbligatoria.");
      return;
    }

    if (!isValidPartitaIva(cleanedPiva)) {
      setErrorMsg("Partita IVA non valida. Inserisci una Partita IVA italiana valida di 11 cifre.");
      return;
    }

    if (!address.trim()) {
      setErrorMsg("L'indirizzo del salone è obbligatorio");
      return;
    }

    if (selectedDays.length === 0) {
      setErrorMsg("Seleziona almeno un giorno operativo per il salone.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const generatedHours = serializeHours(selectedDays, openTime, closeTime);
      const joinedPhone = phoneBody.trim() ? `${phonePrefix}${phoneBody.trim()}` : "";
      const payload = {
        name: name.trim(),
        address: address.trim(),
        phone: joinedPhone,
        hours: generatedHours,
        partitaIva: cleanedPiva,
        useMainCompanyInfo,
        googleReviewUrl: googleReviewUrl.trim(),
        ownerId: user.uid,
        updatedAt: new Date()
      };

      const savePromise = selectedSalon
        ? updateDoc(doc(db, "salons", selectedSalon.id), payload)
        : addDoc(collection(db, "salons"), {
            ...payload,
            createdAt: new Date()
          });

      // Se siamo offline, o se la rete impiega più di 800ms,
      // chiudiamo il modal e lasciamo che la cache locale di Firestore aggiorni la UI.
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);
      setModalOpen(false);
    } catch (err: any) {
      console.error("Error saving salon:", err);
      handleFirestoreError(err, selectedSalon ? OperationType.UPDATE : OperationType.CREATE, "salons");
      setErrorMsg("Errore nel salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (salonId: string) => {
    setDeleteConfirmSalonId(salonId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmSalonId) return;
    try {
      await deleteDoc(doc(db, "salons", deleteConfirmSalonId));
      setDeleteConfirmSalonId(null);
    } catch (err: any) {
      console.error("Error deleting salon:", err);
      handleFirestoreError(err, OperationType.DELETE, `salons/${deleteConfirmSalonId}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-64 bg-slate-200/70 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 h-64 shadow-2xs animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-pageFade">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/10 px-2.5 py-0.5 rounded-full shadow-2xs">
              Struttura & Sedi
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1a2035]">
            I tuoi Saloni e Barber Shop
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm leading-relaxed max-w-2xl">
            Gestisci le tue sedi fisiche operative, i recapiti di contatto, la Partita IVA e gli orari di apertura globali.
          </p>
        </div>
        {userRole === "owner" && (
          <button
            onClick={openCreateModal}
            className="bg-[#1a3a8f] hover:bg-[#132c6e] active:scale-[0.98] text-white rounded-2xl px-5 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider shadow-2xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Aggiungi Sede</span>
          </button>
        )}
      </div>

      {/* Salons Grid List */}
      {salons.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-10 md:p-14 text-center max-w-xl mx-auto shadow-2xs mt-8">
          <div className="w-16 h-16 rounded-2xl bg-[#eef2ff] border border-[#1a3a8f]/10 flex items-center justify-center text-[#1a3a8f] mx-auto mb-6 shadow-2xs">
            <Store className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-[#1a2035] mb-2 tracking-tight">
            Nessuna sede configurata
          </h3>
          <p className="text-slate-500 text-xs sm:text-sm mb-6 max-w-xs mx-auto leading-relaxed">
            Inizia aggiungendo il tuo primo salone o barber shop per sbloccare l'agenda e configurare i servizi.
          </p>
          {userRole === "owner" && (
            <button
              onClick={openCreateModal}
              className="bg-[#1a3a8f] hover:bg-[#132c6e] active:scale-[0.98] text-white rounded-2xl px-6 py-3 text-xs font-bold uppercase tracking-wider shadow-2xs transition-all cursor-pointer"
            >
              Configura Primo Salone
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {salons.map((salon) => (
            <div 
              key={salon.id}
              className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-2xs hover:shadow-xs transition-all relative flex flex-col justify-between group"
            >
              {/* Card Actions */}
              {userRole === "owner" && (
                <div className="absolute top-5 right-5 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditModal(salon)}
                    className="p-2 text-slate-400 hover:text-[#1a3a8f] hover:bg-[#eef2ff] border border-transparent hover:border-[#1a3a8f]/10 rounded-xl transition-all active:scale-95"
                    title="Modifica Sede"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(salon.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl transition-all active:scale-95"
                    title="Elimina Sede"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div>
                {/* Visual Header */}
                <div className="flex items-center gap-3.5 mb-5 border-b border-slate-100 pb-4 pr-16">
                  <div className="w-12 h-12 rounded-2xl bg-[#eef2ff] border border-[#1a3a8f]/10 flex items-center justify-center text-[#1a3a8f] shrink-0 shadow-2xs">
                    <Store className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-[#1a2035] truncate tracking-tight">
                      {salon.name}
                    </h3>
                    <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[9px] font-bold uppercase tracking-wider shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Sede Attiva
                    </span>
                  </div>
                </div>

                {/* Details list */}
                <div className="space-y-3.5 text-xs sm:text-sm text-slate-600 mb-6">
                  <div className="flex items-start gap-3 bg-slate-50/70 border border-slate-100 rounded-2xl p-3 shadow-2xs">
                    <MapPin className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Indirizzo</span>
                      <span className="text-xs font-semibold text-[#1a2035] leading-tight block mt-0.5">
                        {salon.address || "Nessun indirizzo specificato"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-50/70 border border-slate-100 rounded-2xl p-3 shadow-2xs">
                    <Phone className="w-4 h-4 text-[#1a3a8f] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Telefono</span>
                      <span className="text-xs font-semibold text-[#1a2035] font-mono block mt-0.5">
                        {salon.phone || "Nessun telefono inserito"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-50/70 border border-slate-100 rounded-2xl p-3 shadow-2xs">
                    <Clock className="w-4 h-4 text-[#1a3a8f] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Orari Apertura</span>
                      <span className="text-xs font-semibold text-[#1a2035] block mt-0.5">
                        {salon.hours || "Orari non definiti"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50/70 border border-slate-100 rounded-2xl p-3 shadow-2xs">
                    <FileText className="w-4 h-4 text-[#1a3a8f] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Partita IVA</span>
                        {salon.useMainCompanyInfo && (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 text-[8px] font-bold uppercase tracking-wider">
                            Dati Principali
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-[#1a2035] font-mono block mt-0.5">
                        {salon.partitaIva || "Non inserita"}
                      </span>
                    </div>
                  </div>

                  {salon.googleReviewUrl && (
                    <div className="bg-indigo-50/40 border border-indigo-100/60 rounded-2xl p-3 text-xs shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                        Filtro Verità (Google Reviews)
                      </span>
                      <span className="text-[11px] font-medium text-slate-600 truncate block mt-0.5">
                        Link recensioni collegato ✓
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer info */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span className="text-[11px] font-medium">Codice Sede:</span>
                <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100/80 px-2.5 py-0.5 rounded-full border border-slate-200/60">
                  #{salon.id.slice(0, 8)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal create/edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm shadow-2xl" onClick={() => setModalOpen(false)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-lg rounded-3xl shadow-2xl z-10 overflow-hidden animate-fadeIn flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
              <div>
                <span className="text-[10px] bg-[#eef2ff] border border-[#1a3a8f]/10 text-[#1a3a8f] px-3 py-1 rounded-full font-bold uppercase tracking-wider select-none shadow-2xs">
                  {selectedSalon ? "Configurazione Sede" : "Nuova Struttura"}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-[#1a2035] mt-1 tracking-tight">
                  {selectedSalon ? "Modifica Sede Salone" : "Crea Nuova Sede"}
                </h3>
              </div>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner inside form */}
            {errorMsg && (
              <div className="mx-6 sm:mx-8 mt-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2.5 shrink-0 shadow-2xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nome del Salone *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es: Barber Shop Duomo, Acconciature Elena"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl px-4 py-3 text-sm font-medium text-[#1a2035] focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] transition-all placeholder:text-slate-400 shadow-2xs"
                />
              </div>

              {/* Checkbox USA i dati */}
              <div className="flex items-start gap-3 bg-[#eef2ff]/50 border border-[#1a3a8f]/15 p-4 rounded-2xl shadow-2xs">
                <input
                  id="useMainCompanyInfo"
                  type="checkbox"
                  checked={useMainCompanyInfo}
                  onChange={(e) => handleUseMainCompanyInfoChange(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#1a3a8f] border-slate-300 rounded focus:ring-[#1a3a8f] cursor-pointer"
                />
                <label htmlFor="useMainCompanyInfo" className="text-xs text-slate-700 font-medium select-none cursor-pointer leading-tight">
                  <span className="font-bold text-[#1a3a8f] block mb-0.5">USA i dati della Sede Legale / Partita IVA principale</span>
                  Se abilitato, l'indirizzo della sede e la Partita IVA verranno popolati automaticamente utilizzando i dati aziendali principali dell'account.
                </label>
              </div>

              {/* Partita IVA field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Partita IVA *
                </label>
                <input
                  type="text"
                  required
                  disabled={useMainCompanyInfo}
                  placeholder="Es: 12345678901"
                  value={partitaIva}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, ""); // Allow only digits
                    setPartitaIva(val);
                  }}
                  className={`w-full border rounded-2xl px-4 py-3 text-sm font-mono font-medium outline-none transition-all placeholder:text-slate-400 shadow-2xs ${
                    useMainCompanyInfo 
                      ? "bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed" 
                      : "bg-slate-50/90 hover:bg-slate-100/70 border-slate-200/80 text-[#1a2035] focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f]"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Indirizzo Fisico *
                </label>
                <input
                  type="text"
                  required
                  disabled={useMainCompanyInfo}
                  placeholder="Es: Corso Vittorio Emanuele II, 24, Milano"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium outline-none transition-all placeholder:text-slate-400 shadow-2xs ${
                    useMainCompanyInfo 
                      ? "bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed" 
                      : "bg-slate-50/90 hover:bg-slate-100/70 border-slate-200/80 text-[#1a2035] focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f]"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Recapito Telefonico
                </label>
                <div className="flex gap-2">
                  <select
                    value={phonePrefix}
                    onChange={(e) => setPhonePrefix(e.target.value)}
                    className="bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl px-3.5 py-3 text-xs sm:text-sm font-bold text-[#1a2035] focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] outline-none transition-all shrink-0 shadow-2xs"
                  >
                    {COUNTRY_PREFIXES.map((pref) => (
                      <option key={pref.code} value={pref.code}>
                        {pref.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="Es: 02123456"
                    value={phoneBody}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, "");
                      setPhoneBody(cleaned);
                    }}
                    className="flex-1 min-w-0 bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl px-4 py-3 text-sm font-mono font-medium text-[#1a2035] focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] outline-none transition-all placeholder:text-slate-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* Google Reviews Link for Filtro Verità */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Link Recensioni Google Maps (Filtro Verità)
                  </label>
                  <span className="text-[10px] text-[#1a3a8f] font-bold bg-[#eef2ff] border border-[#1a3a8f]/10 px-2.5 py-0.5 rounded-full shadow-2xs">
                    Consigliato
                  </span>
                </div>
                <input
                  type="url"
                  placeholder="Es: https://g.page/r/YOUR_ID/review oppure link scheda Google"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  className="w-full bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl px-4 py-3 text-sm font-medium text-[#1a2035] focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] outline-none transition-all placeholder:text-slate-400 shadow-2xs"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  I clienti che selezioneranno "Tutto Perfetto" verranno reindirizzati qui per lasciare 5 stelle su Google.
                </p>
              </div>

              {/* Real / structured opening and closing hours */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-3xl p-5 space-y-4 shadow-2xs">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#1a3a8f]">
                  Giorni di Apertura e Orario Operativo
                </span>
                
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-2.5">
                    Seleziona i giorni di apertura (spunta per abilitare):
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DAYS_OF_WEEK.map((day) => {
                      const isChecked = selectedDays.includes(day);
                      return (
                        <label 
                          key={day}
                          className={`flex items-center gap-2 p-2.5 rounded-2xl border text-xs font-bold cursor-pointer transition-all select-none shadow-2xs active:scale-95 ${
                            isChecked 
                              ? "bg-[#eef2ff] border-[#1a3a8f]/30 text-[#1a3a8f]" 
                              : "bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedDays(selectedDays.filter(d => d !== day));
                              } else {
                                setSelectedDays([...selectedDays, day]);
                              }
                            }}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded-lg flex items-center justify-center border transition-all shrink-0 ${
                            isChecked ? "bg-[#1a3a8f] border-[#1a3a8f] text-white" : "border-slate-300 bg-white"
                          }`}>
                            {isChecked && (
                              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 20 20">
                                <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                              </svg>
                            )}
                          </div>
                          <span className="truncate">{DAY_ABBREVIATIONS[day] || day.slice(0, 3)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Ora Apertura *
                    </label>
                    <input
                      type="time"
                      required
                      value={openTime}
                      onChange={(e) => setOpenTime(e.target.value)}
                      className="w-full bg-white border border-slate-200/80 rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#1a2035] outline-none focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] transition-all shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Ora Chiusura *
                    </label>
                    <input
                      type="time"
                      required
                      value={closeTime}
                      onChange={(e) => setCloseTime(e.target.value)}
                      className="w-full bg-white border border-slate-200/80 rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#1a2035] outline-none focus:ring-2 focus:ring-[#1a3a8f]/15 focus:border-[#1a3a8f] transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-3 border border-slate-200/80 rounded-2xl text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95 shadow-2xs"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#1a3a8f] hover:bg-[#132c6e] disabled:opacity-50 text-white rounded-2xl px-6 py-3 text-xs font-bold uppercase tracking-wider shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Salvataggio...
                    </>
                  ) : (
                    "Salva Sede"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmSalonId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm shadow-2xl" onClick={() => setDeleteConfirmSalonId(null)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-md rounded-3xl shadow-2xl z-10 overflow-hidden animate-fadeIn p-6 sm:p-7">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4 shadow-2xs">
              <AlertCircle className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-bold text-[#1a2035] mb-2 tracking-tight">
              Sei sicuro di voler eliminare questa sede?
            </h3>
            
            <p className="text-slate-500 text-xs leading-relaxed mb-6">
              Questa azione è del tutto irreversibile. Gli allineamenti storici rimarranno ma i futuri appuntamenti in questa sede potrebbero risentirne o disassociare dati correlati.
            </p>
            
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmSalonId(null)}
                className="px-5 py-2.5 border border-slate-200/80 rounded-2xl text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95 shadow-2xs"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-2xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider shadow-2xs transition-all cursor-pointer"
              >
                Sì, Elimina Sede
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
