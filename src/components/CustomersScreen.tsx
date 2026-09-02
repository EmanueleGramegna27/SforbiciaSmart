import React, { useState, useMemo, useEffect } from "react";
import { useBusiness } from "../context/BusinessContext";
import { PLAN_LIMITS } from "../lib/plans";
import PremiumGate from "./PremiumGate";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  getDocs
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  Users, 
  Phone, 
  Mail, 
  FileText, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Edit2, 
  Trash2, 
  X, 
  Loader2, 
  AlertCircle,
  FileSpreadsheet,
  Download,
  Upload,
  Coins,
  Store,
  Check,
  Copy,
  Lock,
  ArrowRight
} from "lucide-react";
import { Customer, CustomPrice } from "../types";
import * as XLSX from "xlsx";

const normalizeSalonName = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ""); // Remove spaces and punctuation for strict deduplication
};

export const COUNTRY_PREFIXES = [
  { code: "+39", label: "🇮🇹 +39" },
  { code: "+41", label: "🇨🇭 +41" },
  { code: "+33", label: "🇫🇷 +33" },
  { code: "+49", label: "🇩🇪 +49" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+34", label: "🇪🇸 +34" },
  { code: "+43", label: "🇦🇹 +43" },
  { code: "+32", label: "🇧🇪 +32" },
  { code: "+1", label: "🇺🇸 +1" }
];

export function splitPhoneNumber(phoneStr: string): { prefix: string; number: string } {
  const cleanPhone = (phoneStr || "").trim();
  for (const pref of COUNTRY_PREFIXES) {
    if (cleanPhone.startsWith(pref.code)) {
      const remaining = cleanPhone.substring(pref.code.length).replace(/[^0-9]/g, "");
      return { prefix: pref.code, number: remaining };
    }
  }
  if (cleanPhone.startsWith("0039")) {
    return { prefix: "+39", number: cleanPhone.substring(4).replace(/[^0-9]/g, "") };
  }
  if (cleanPhone.startsWith("+")) {
    const match = cleanPhone.match(/^\+(\d{1,4})/);
    if (match) {
      const foundPref = "+" + match[1];
      return { prefix: foundPref, number: cleanPhone.substring(foundPref.length).replace(/[^0-9]/g, "") };
    }
  }
  return { prefix: "+39", number: cleanPhone.replace(/[^0-9]/g, "") };
}



interface CustomersScreenProps {
  setCurrentTab?: (tab: string) => void;
}

export default function CustomersScreen({ setCurrentTab }: CustomersScreenProps = {}) {
  const { user, salons, services, customers, loading, ownerId, businessSettings } = useBusiness();

  // Accordion open states per salonId
  const [openAccordionIds, setOpenAccordionIds] = useState<Record<string, boolean>>({});

  // Help Guide Box state
  const [showImportGuide, setShowImportGuide] = useState(true);

  // CRUD Customer modal states
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);

  // Deletion confirmation modal states
  const [custToDelete, setCustToDelete] = useState<Customer | null>(null);
  const [deletingCust, setDeletingCust] = useState(false);

  // Detail Technical panel state (active customer)
  const [activeCustDetailsId, setActiveCustDetailsId] = useState<string | null>(null);

  // Selection states for custom Excel exporting
  const [selectedCustIds, setSelectedCustIds] = useState<Record<string, boolean>>({});

  // Tech Sheet Modal state
  const [showTechSheetModal, setShowTechSheetModal] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [showCustomPricesModal, setShowCustomPricesModal] = useState(false);

  const handleCopyNotes = (notes: string) => {
    if (!notes) return;
    navigator.clipboard.writeText(notes);
    setCopiedNotes(true);
    setTimeout(() => setCopiedNotes(false), 2000);
  };

  // Forms Customer
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custPhonePrefix, setCustPhonePrefix] = useState("+39");
  const [custPhoneBody, setCustPhoneBody] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custSalonId, setCustSalonId] = useState("");
  const [custNotes, setCustNotes] = useState("");
  const [savingCust, setSavingCust] = useState(false);
  const [errorMsgCust, setErrorMsgCust] = useState("");

  // Custom prices real state
  const [customPrices, setCustomPrices] = useState<CustomPrice[]>([]);
  const [customPriceServiceId, setCustomPriceServiceId] = useState("");
  const [customPriceValue, setCustomPriceValue] = useState("");
  const [savingCustomPrice, setSavingCustomPrice] = useState(false);

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

  // Initial setup of Accordions
  useEffect(() => {
    if (salons && salons.length > 0) {
      const initialOpen: Record<string, boolean> = {};
      salons.forEach((salon, i) => {
        initialOpen[salon.id] = i === 0; // open first by default
      });
      setOpenAccordionIds(initialOpen);
    }
  }, [salons]);

  // Read custom prices for current owner
  useEffect(() => {
    if (!ownerId) return;
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
  }, [ownerId]);

  // Salon map lookup representation
  const salonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    salons.forEach(s => {
      map[s.id] = s.name;
    });
    return map;
  }, [salons]);

  // Group customers by salon ID
  const groupedCustomers = useMemo(() => {
    const groups: Record<string, Customer[]> = {};
    // initialize empty groups
    salons.forEach(s => {
      groups[s.id] = [];
    });
    groups["unassociated"] = [];

    if (Array.isArray(customers)) {
      customers.forEach(c => {
        if (c.salonId && groups[c.salonId]) {
          groups[c.salonId].push(c);
        } else {
          groups["unassociated"].push(c);
        }
      });
    }
    return groups;
  }, [customers, salons]);

  // Active client object lookup
  const activeCustomer = useMemo(() => {
    return customers.find(c => c.id === activeCustDetailsId) || null;
  }, [customers, activeCustDetailsId]);

  // Custom prices filtered for the selected active technical card
  const activeCustPrices = useMemo(() => {
    if (!activeCustDetailsId) return [];
    return customPrices.filter(cp => cp.customerId === activeCustDetailsId);
  }, [customPrices, activeCustDetailsId]);

  const toggleAccordion = (id: string) => {
    setOpenAccordionIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Open modal triggers
  const openCreateModal = () => {
    setSelectedCust(null);
    setCustName("");
    setCustPhone("");
    setCustPhonePrefix("+39");
    setCustPhoneBody("");
    setCustEmail("");
    setCustSalonId(salons.length > 0 ? salons[0].id : "");
    setCustNotes("");
    setErrorMsgCust("");
    setCustModalOpen(true);
  };

  const openEditModal = (cust: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCust(cust);
    setCustName(cust.name);
    setCustPhone(cust.phone);
    const parsed = splitPhoneNumber(cust.phone);
    setCustPhonePrefix(parsed.prefix);
    setCustPhoneBody(parsed.number);
    setCustEmail(cust.email || "");
    setCustSalonId(cust.salonId || (salons.length > 0 ? salons[0].id : ""));
    setCustNotes(cust.notes || "");
    setErrorMsgCust("");
    setCustModalOpen(true);
  };

  // Save Customer
  const handleSaveCust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId) return;
    if (!custName.trim()) {
      setErrorMsgCust("Il nome del cliente è obbligatorio.");
      return;
    }
    const joinedPhone = `${custPhonePrefix}${custPhoneBody.trim()}`;
    if (!custPhoneBody.trim()) {
      setErrorMsgCust("Il recapito telefonico è obbligatorio.");
      return;
    }

    setSavingCust(true);
    setErrorMsgCust("");

    try {
      const payload = {
        name: custName.trim(),
        phone: joinedPhone,
        email: custEmail.trim(),
        salonId: custSalonId,
        notes: custNotes.trim(),
        ownerId: ownerId,
        updatedAt: new Date()
      };

      const savePromise = selectedCust
        ? updateDoc(doc(db, "customers", selectedCust.id), payload)
        : addDoc(collection(db, "customers"), {
            ...payload,
            createdAt: new Date()
          });

      // Se siamo offline, o se la rete impiega più di 800ms,
      // chiudiamo il modal e lasciamo che la cache locale di Firestore aggiorni la UI.
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);
      setCustModalOpen(false);
    } catch (err: any) {
      console.error("Error saving customer", err);
      handleFirestoreError(err, selectedCust ? OperationType.UPDATE : OperationType.CREATE, "customers");
      setErrorMsgCust("Errore nel salvataggio dei dati anagrafici.");
    } finally {
      setSavingCust(false);
    }
  };

  // Trigger delete confirmation modal
  const handleDeleteCust = (cust: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustToDelete(cust);
  };

  // Execute the actual customer deletion
  const executeDeleteCust = async () => {
    if (!custToDelete) return;
    setDeletingCust(true);
    try {
      await deleteDoc(doc(db, "customers", custToDelete.id));
      if (activeCustDetailsId === custToDelete.id) {
        setActiveCustDetailsId(null);
      }
      // Also delete custom prices for this client
      const pricesToDelete = customPrices.filter(p => p.customerId === custToDelete.id);
      for (const cp of pricesToDelete) {
        await deleteDoc(doc(db, "custom_prices", cp.id));
      }
      setCustToDelete(null);
    } catch (err: any) {
      console.error("Error deleting customer", err);
      handleFirestoreError(err, OperationType.DELETE, `customers/${custToDelete.id}`);
    } finally {
      setDeletingCust(false);
    }
  };

  // Save Custom Price Tariff
  const handleAddCustomPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeCustDetailsId) return;

    if (!customPriceServiceId) {
      alert("Seleziona un servizio valido.");
      return;
    }
    const val = parseFloat(customPriceValue);
    if (isNaN(val) || val <= 0) {
      alert("Inserisci un prezzo speciale valido.");
      return;
    }

    setSavingCustomPrice(true);
    try {
      const chosenService = services.find(s => s.id === customPriceServiceId);
      const servName = chosenService ? chosenService.name : "Servizio";

      // Check if custom price already exists for this client & service
      const existing = customPrices.find(cp => cp.customerId === activeCustDetailsId && cp.serviceId === customPriceServiceId);

      const savePromise = existing
        ? updateDoc(doc(db, "custom_prices", existing.id), { price: val })
        : addDoc(collection(db, "custom_prices"), {
            customerId: activeCustDetailsId,
            serviceId: customPriceServiceId,
            serviceName: servName,
            price: val,
            ownerId: ownerId
          });

      // Se siamo offline, o se la rete impiega più di 800ms,
      // terminiamo l'attesa e lasciamo che la cache offline sincronizzi in background.
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);
      setCustomPriceServiceId("");
      setCustomPriceValue("");
    } catch (err: any) {
      console.error("Error saving custom price", err);
      handleFirestoreError(err, OperationType.CREATE, "custom_prices");
    } finally {
      setSavingCustomPrice(false);
    }
  };

  // Delete Custom Price Tariff
  const handleDeleteCustomPrice = async (priceId: string) => {
    try {
      await deleteDoc(doc(db, "custom_prices", priceId));
    } catch (err: any) {
      console.error("Error deleting custom price", err);
      handleFirestoreError(err, OperationType.DELETE, `custom_prices/${priceId}`);
    }
  };

  // Selection Helper Methods
  const selectedCount = useMemo(() => {
    return Object.values(selectedCustIds).filter(Boolean).length;
  }, [selectedCustIds]);

  const handleSelectAll = () => {
    const allSelected = customers.length > 0 && customers.every(c => selectedCustIds[c.id]);
    setSelectedCustIds(prev => {
      const next = { ...prev };
      customers.forEach(c => {
        next[c.id] = !allSelected;
      });
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedCustIds({});
  };

  const handleSelectAllInSalon = (salonId: string) => {
    const list = groupedCustomers[salonId] || [];
    if (list.length === 0) return;
    
    const allInSalonSelected = list.every(c => selectedCustIds[c.id]);
    setSelectedCustIds(prev => {
      const next = { ...prev };
      list.forEach(c => {
        next[c.id] = !allInSalonSelected;
      });
      return next;
    });
  };

  const isAllInSalonSelected = (salonId: string) => {
    const list = groupedCustomers[salonId] || [];
    if (list.length === 0) return false;
    return list.every(c => selectedCustIds[c.id]);
  };

  // EXCEL EXPORT
  const handleExportXLSX = async () => {
    if (!ownerId) return;

    try {
      // 1. Gating check based on current plan limits
      const planKey = businessSettings?.userPlan || "network";
      const limit = PLAN_LIMITS[planKey]?.maxReportsPerMonth ?? Infinity;
      
      if (limit !== Infinity && monthlyReportCount >= limit) {
        alert(`Spiacenti! Il tuo piano attuale (${PLAN_LIMITS[planKey]?.name || planKey}) consente un massimo di ${limit} report Excel al mese.\n\nHai già effettuato ${monthlyReportCount} esportazioni questo mese.\n\nAggiorna il tuo abbonamento nel tuo Profilo (scheda Abbonamento) per sbloccare esportazioni illimitate!`);
        return;
      }

      // 2. Perform Excel generation
      const activeSelection = customers.filter(c => selectedCustIds[c.id]);
      const targets = activeSelection.length > 0 ? activeSelection : customers;
      
      const rows = targets.map(c => ({
        "Nome": c.name,
        "Telefono": c.phone,
        "Email": c.email || "",
        "Sede Associata": salonsMap[c.salonId] || "Tutti / Nessuna",
        "Note Tecniche": c.notes || ""
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clienti");
      
      // Auto-adjust column widths for readability
      ws["!cols"] = [
        { wch: 25 }, // Nome
        { wch: 20 }, // Telefono
        { wch: 30 }, // Email
        { wch: 25 }, // Sede Associata
        { wch: 45 }  // Note Tecniche
      ];

      // File name reflecting whether it's full or filtered
      const suffix = activeSelection.length > 0 ? `Selezionati_${activeSelection.length}` : "Tutti";
      XLSX.writeFile(wb, `SforbiciaSmart_Clienti_${suffix}_${new Date().toISOString().slice(0,10)}.xlsx`);

      // 3. Log the export in reports_history to increment count
      await addDoc(collection(db, "reports_history"), {
        ownerId,
        type: "excel_customers",
        createdAt: new Date().toISOString()
      });

    } catch (err) {
      console.error("Export failure", err);
      alert("Errore nella generazione del foglio Excel o nella verifica dei limiti di abbonamento.");
    }
  };

  // EXCEL DOWNLOAD EMPTY TEMPLATE
  const handleDownloadTemplate = () => {
    try {
      const rows = [
        {
          "Nome": "Alessia Romano",
          "Telefono": "+39 347 1122334",
          "Email": "alessia.romano@example.com",
          "Sede Associata": "Sede Centrale",
          "Note Tecniche": "Colore 7.3 caldo (riflessi dorati), tempo di posa 35min, shampoo barriera"
        },
        {
          "Nome": "Gianluca Russo",
          "Telefono": "+39 333 9988776",
          "Email": "gianluca.russo@example.com",
          "Sede Associata": "Sede Catania",
          "Note Tecniche": "Taglio sfumato medio, cera opaca, cute secca"
        },
        {
          "Nome": "Cristina Esposito",
          "Telefono": "+39 328 5544332",
          "Email": "cristina.esposito@example.com",
          "Sede Associata": "Sede Centrale",
          "Note Tecniche": "Schiariture balayage platino, trattamento ricostruttivo alla cheratina"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Modello Clienti");
      
      // Auto-adjust column widths for readability
      ws["!cols"] = [
        { wch: 25 }, // Nome
        { wch: 20 }, // Telefono
        { wch: 30 }, // Email
        { wch: 25 }, // Sede Associata
        { wch: 45 }  // Note Tecniche
      ];

      XLSX.writeFile(wb, "Template_Importazione_Clienti.xlsx");
    } catch (err) {
      console.error("Template download failure", err);
      alert("Errore nella generazione del template XLSX.");
    }
  };

  // EXCEL IMPORT
  const handleImportXLSX = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        
        // Parse JSON
        const rawJson = XLSX.utils.sheet_to_json(ws);
        if (rawJson.length === 0) {
          alert("L'Excel importato appare vuoto.");
          return;
        }

        let importCount = 0;
        let activeSalons = [...salons];
        const skippedSalonNames = new Set<string>();

        const planKey = businessSettings?.userPlan || "network";
        const limit = PLAN_LIMITS[planKey]?.maxSalons || 6;

        for (let i = 0; i < rawJson.length; i++) {
          const row = rawJson[i] as any;
          const nomeClean = row["Nome"] || row["name"] || row["Nome Cliente"];
          if (!nomeClean || !String(nomeClean).trim()) continue;
          
          const phoneClean = row["Telefono"] || row["phone"] || row["Cellulare"] || "0000000";
          const emailClean = row["Email"] || row["email"] || "";
          const noteClean = row["Note Tecniche"] || row["notes"] || row["Note"] || "";
          
          // Try matching salon ID
          const parsedSedeName = row["Sede Associata"] || row["Sede"] || row["salon"];
          let mappedSalonId = "";
          
          if (parsedSedeName && String(parsedSedeName).trim()) {
            const cleanedSedeName = String(parsedSedeName).trim();
            const lowerSede = cleanedSedeName.toLowerCase();
            
            // Deduplicate placeholder / empty salons representing no salon assignment
            const isPlaceholderSede = 
              lowerSede === "tutti / nessuna" || 
              lowerSede === "tutti/nessuna" || 
              lowerSede === "tutti" || 
              lowerSede === "nessuna" ||
              lowerSede === "nessuna sede" ||
              lowerSede === "tutti i saloni";

            if (!isPlaceholderSede) {
              const normalizedInput = normalizeSalonName(cleanedSedeName);
              
              // Try to find matching salon (exact normalized match first to prevent duplicates!)
              let foundSalon = activeSalons.find(s => 
                normalizeSalonName(s.name || "") === normalizedInput
              );
              
              if (!foundSalon && normalizedInput.length >= 3) {
                // Try finding with moderate includes under normalization
                foundSalon = activeSalons.find(s => {
                  const normName = normalizeSalonName(s.name || "");
                  return normName.includes(normalizedInput) || normalizedInput.includes(normName);
                });
              }

              if (!foundSalon) {
                if (activeSalons.length < limit) {
                  const finalSedeName = cleanedSedeName.slice(0, 128);
                  const newSalonPayload = {
                    name: finalSedeName,
                    address: "",
                    phone: "",
                    hours: "Lunedì, Martedì, Mercoledì, Giovedì, Venerdì, Sabato: 09:00 - 19:00",
                    ownerId: ownerId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  };
                  
                  let docRef;
                  try {
                    docRef = await addDoc(collection(db, "salons"), newSalonPayload);
                  } catch (salonErr) {
                    console.error(`Error auto-creating salon "${finalSedeName}" for row #${i + 1}:`, salonErr);
                    handleFirestoreError(salonErr, OperationType.CREATE, "salons");
                  }

                  if (docRef) {
                    const newlyCreatedSalon = {
                      id: docRef.id,
                      ...newSalonPayload
                    };
                    activeSalons.push(newlyCreatedSalon);
                    foundSalon = newlyCreatedSalon;
                  }
                } else {
                  skippedSalonNames.add(cleanedSedeName);
                }
              }

              if (foundSalon) {
                mappedSalonId = foundSalon.id;
              }
            }
          }

          if (!mappedSalonId) {
            mappedSalonId = activeSalons[0]?.id || "";
          }

           // Create customer payload matching what is validated in firestore.rules
          const newCustomerPayload = {
            name: String(nomeClean).trim().slice(0, 128),
            phone: String(phoneClean).trim().slice(0, 32),
            email: String(emailClean).trim().slice(0, 128),
            notes: String(noteClean).trim().slice(0, 1000),
            salonId: mappedSalonId,
            ownerId: ownerId,
            updatedAt: new Date()
          };

          try {
            await addDoc(collection(db, "customers"), {
              ...newCustomerPayload,
              createdAt: new Date()
            });
          } catch (custErr) {
            console.error(`Error creating customer "${newCustomerPayload.name}" for row #${i + 1}:`, custErr);
            handleFirestoreError(custErr, OperationType.CREATE, "customers");
          }

          importCount++;
        }

        let alertMessage = `Importazione completata! ${importCount} clienti aggiunti con successo.`;
        if (skippedSalonNames.size > 0) {
          const namesStr = Array.from(skippedSalonNames).join(", ");
          alertMessage += `\n\nAttenzione: le seguenti sedi non sono state create perché è stato superato il limite massimo del tuo piano (${PLAN_LIMITS[planKey]?.name || planKey}): ${namesStr}.\nI relativi clienti sono stati associati alla tua prima sede o lasciati senza sede.`;
        }
        alert(alertMessage);
      } catch (err: any) {
        console.error("Importation error detail:", err);
        alert(`Errore nell'importazione dei dati:\n${err.message || String(err)}`);
      }
    };
    reader.readAsBinaryString(file);
    // reset input element
    e.target.value = "";
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 h-96 skeleton" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-pageFade">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1a2035]">
            Anagrafica Clienti e Schede Tecniche
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Visualizza e gestisci le schede dei clienti raggruppate per sede, importa listini, ed assegna prezzi speciali dedicati.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Dynamic Monthly Report Limit Indicator */}
          {!loadingReportCount && (
            <div className={`px-3.5 py-2 rounded-2xl border flex items-center gap-2.5 shadow-2xs font-medium transition-all ${
              businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3
                ? "bg-rose-50/80 border-rose-200 text-rose-800"
                : "bg-[#eef2ff] border-[#1a3a8f]/15 text-[#1a3a8f]"
            }`}>
              <FileSpreadsheet className={`w-4 h-4 shrink-0 ${businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3 ? "text-rose-500 animate-pulse" : "text-[#1a3a8f]"}`} />
              <div className="text-left leading-tight">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Report Mensili</span>
                <span className="text-xs font-semibold">
                  {businessSettings?.userPlan === "solo_pro" ? (
                    <span>
                      {monthlyReportCount} / 3 <span className="text-[10px] font-normal text-slate-500">({Math.max(0, 3 - monthlyReportCount)} rimasti)</span>
                    </span>
                  ) : (
                    <span>
                      {monthlyReportCount} / ∞ <span className="text-[10px] font-medium text-emerald-600">(Illimitati)</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExportXLSX}
            disabled={customers.length === 0}
            className="flex-1 sm:flex-none border border-slate-200/80 bg-[#eef2ff] hover:bg-[#e0e7ff] text-[#1a3a8f] rounded-2xl px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-2xs disabled:opacity-50"
            title={selectedCount > 0 ? `Esporta ${selectedCount} clienti selezionati in .XLSX` : "Esporta tutti i clienti in .XLSX"}
          >
            <Download className="w-4 h-4" />
            {selectedCount > 0 ? `Esporta Selezionati (${selectedCount})` : "Esporta Tutti"}
          </button>
          
          {/* Import element */}
          <label className="flex-1 sm:flex-none border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-2xs text-center">
            <Upload className="w-4 h-4" />
            <span>Importa Excel</span>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              className="hidden" 
              onChange={handleImportXLSX} 
            />
          </label>

          <button
            onClick={openCreateModal}
            className="flex-1 sm:flex-none bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-2xl px-5 py-2.5 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nuovo Cliente
          </button>
        </div>
      </div>

      {/* Alert if Monthly Report Limit is Reached */}
      {!loadingReportCount && businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3 && (
        <div className="bg-amber-50/90 border border-amber-200/80 text-amber-900 rounded-3xl p-4.5 flex items-start gap-3.5 shadow-2xs animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Limite Report Mensili Raggiunto</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              Hai raggiunto il limite massimo di <strong>3 esportazioni Excel</strong> per questo mese consentite dal tuo piano <strong>Solo Pro</strong>. 
              Per poter generare ed esportare nuovi report anagrafici, effettua l'upgrade al piano <strong>Network</strong> o <strong>Elite AI</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Help block explaining customer Excel import structure */}
      {showImportGuide && (
        <div className="bg-slate-50/90 border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-2xs relative animate-fadeIn overflow-hidden backdrop-blur-xs">
          <button 
            onClick={() => setShowImportGuide(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-2xl hover:bg-slate-200/60 transition-all active:scale-95 cursor-pointer"
            title="Nascondi Guida"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3.5 max-w-4xl">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 flex items-center justify-center font-bold shadow-2xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#1a2035] tracking-tight">
                  Guida alla compilazione del file per l'importazione
                </h3>
              </div>
              
              <p className="text-slate-500 text-xs leading-relaxed">
                Per caricare massivamente la tua lista dei clienti, puoi preparare un foglio di calcolo (<span className="font-semibold text-slate-700">XLS, XLSX o CSV</span>). Se nel file inserisci una <span className="font-semibold text-[#1a3a8f]">Sede Associata non ancora presente</span> sul portale, il sistema provvederà a <span className="underline font-semibold text-[#1a3a8f]">crearla automaticamente senza creare duplicati</span>!
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                <div className="bg-white border border-slate-200/70 rounded-2xl p-3.5 shadow-2xs">
                  <span className="block text-xs font-bold text-slate-800 mb-1">Nome / Cognome</span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    <span className="text-red-500 font-bold">* Richiesto</span>. Nome completo del cliente o della ditta (es: <span className="italic">Alessia Romano</span>).
                  </p>
                </div>
                
                <div className="bg-white border border-slate-200/70 rounded-2xl p-3.5 shadow-2xs">
                  <span className="block text-xs font-bold text-slate-800 mb-1">Telefono / Email</span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Recapito cliente. In mancanza di Telefono verrà inizializzato come <span className="italic">"0000000"</span>.
                  </p>
                </div>

                <div className="bg-white border border-slate-200/70 rounded-2xl p-3.5 col-span-1 sm:col-span-2 md:col-span-1 shadow-2xs">
                  <span className="block text-xs font-bold text-[#1a3a8f] mb-1 flex items-center justify-between">
                    <span>Sede Associata</span>
                    <span className="text-[9px] bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 px-2 py-0.5 rounded-full font-bold">Auto-creazione</span>
                  </span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Se indicata, collega il cliente. Se non presente, <span className="font-semibold text-[#1a3a8f]">la creiamo all'istante</span> senza duplicazioni!
                  </p>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex flex-col gap-1.5 justify-center">
              <button
                onClick={handleDownloadTemplate}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" />
                Scarica Modello Excel
              </button>
              <span className="text-[10px] text-slate-400 font-medium text-center">
                Modello precompilato di esempio
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Container: Centered full-width list layout */}
      <div className="w-full max-w-4xl mx-auto space-y-4">
        
        {/* Bulk Selection control bar for Exporting */}
        {customers.length > 0 && (
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs backdrop-blur-xs">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700">
              <div className="bg-[#1a3a8f] text-white px-3 py-1 rounded-full text-[11px] font-bold shadow-2xs">
                {selectedCount} su {customers.length} selezionati
              </div>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-medium text-[11px]">
                {selectedCount > 0 
                  ? "Esporta scaricherà solo i clienti spuntati" 
                  : "Spunta i clienti desiderati oppure esporta l'intera lista"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] bg-white hover:bg-slate-50 border border-slate-200/80 text-[#1a2035] font-bold px-3.5 py-1.5 rounded-2xl transition-all active:scale-[0.98] cursor-pointer shadow-2xs select-none"
              >
                {selectedCount === customers.length ? "Deseleziona Tutti" : "Seleziona Tutti"}
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-[11px] bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3.5 py-1.5 rounded-2xl border border-red-200/80 transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
                >
                  Azzera Selezione
                </button>
              )}
            </div>
          </div>
        )}
        
        {salons.length === 0 && (
          <div className="p-4.5 rounded-3xl bg-amber-50/90 border border-amber-200/80 text-amber-800 text-xs font-semibold flex items-start gap-3 shadow-2xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">Nessun salone disponibile!</p>
              <p className="font-medium mt-0.5 text-amber-900/80 leading-relaxed">
                Crea almeno un salone per visualizzare e raggruppare i clienti in modo corretto.
              </p>
            </div>
          </div>
        )}

        {/* Render regular list grouped dynamically */}
        {salons.map((salon) => {
          const list = groupedCustomers[salon.id] || [];
          const isOpen = openAccordionIds[salon.id];
          return (
            <div 
              key={salon.id}
              className="bg-white border border-slate-200/80 rounded-3xl shadow-2xs overflow-hidden"
            >
              {/* Accordion Trigger Header */}
              <div
                onClick={() => toggleAccordion(salon.id)}
                className="w-full bg-slate-50/80 hover:bg-slate-100/70 px-6 py-4.5 flex items-center justify-between text-base font-bold text-[#1a2035] tracking-tight transition-all border-b border-slate-100 text-left cursor-pointer select-none backdrop-blur-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 flex items-center justify-center shadow-2xs">
                    <Store className="w-4 h-4" />
                  </div>
                  <span>{salon.name}</span>
                  <span className="text-xs text-slate-500 bg-white border border-slate-200/70 rounded-full px-2.5 py-0.5 leading-none font-semibold shadow-2xs">
                    {list.length} {list.length === 1 ? "cliente" : "clienti"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {list.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAllInSalon(salon.id);
                      }}
                      className="text-[11px] bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 hover:bg-[#e0e7ff] font-bold px-3 py-1 rounded-xl transition-all active:scale-95 cursor-pointer whitespace-nowrap shadow-2xs"
                    >
                      {isAllInSalonSelected(salon.id) ? "Deseleziona Negozio" : "Seleziona Tutti"}
                    </button>
                  )}
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {/* Collapsible item list */}
              {isOpen && (
                <div className="divide-y divide-slate-100 animate-fadeIn">
                  {list.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 font-medium">
                      Nessun cliente registrato a questa sede. Clicca su "Nuovo Cliente" per aggiungerne uno.
                    </div>
                  ) : (
                    list.map((cust) => {
                      const count = customPrices.filter(cp => cp.customerId === cust.id).length;
                      return (
                        <div 
                          key={cust.id}
                          onClick={() => {
                            setActiveCustDetailsId(cust.id);
                            setShowTechSheetModal(true);
                          }}
                          className={`p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/70 cursor-pointer duration-75 text-sm gap-4 transition-colors ${
                            activeCustDetailsId === cust.id && (showTechSheetModal || showCustomPricesModal) ? "bg-[#eef2ff]/40 border-l-4 border-l-[#1a3a8f]" : ""
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            {/* Individual Checkbox */}
                            <input
                              type="checkbox"
                              checked={!!selectedCustIds[cust.id]}
                              onChange={(e) => {
                                setSelectedCustIds(prev => ({
                                  ...prev,
                                  [cust.id]: !prev[cust.id]
                                }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded text-[#1a3a8f] border-slate-300 focus:ring-[#1a3a8f] cursor-pointer accent-[#1a3a8f] shrink-0"
                            />
                            <div className="w-10 h-10 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-2xs">
                              {cust.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-bold text-[#1a2035] text-sm tracking-tight truncate">
                                  {cust.name}
                                </h4>
                                {count > 0 && (
                                  <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200/80 text-amber-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full shadow-2xs" title={`${count} tariffe speciali attive`}>
                                    <Coins className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>{count} {count === 1 ? "Tariffa Spec." : "Tariffe Spec."}</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {cust.phone || "---"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 ml-7 sm:ml-0">
                            {cust.email && (
                              <span className="hidden md:inline text-xs text-slate-400 font-medium truncate max-w-[140px] mr-1.5">
                                {cust.email}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCustDetailsId(cust.id);
                                setShowTechSheetModal(true);
                              }}
                              className="p-1 px-3 py-1.5 border border-[#1a3a8f]/15 bg-[#eef2ff] hover:bg-[#e0e7ff] text-[#1a3a8f] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                              title="Apri immediatamente la scheda tecnica"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Scheda</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCustDetailsId(cust.id);
                                setShowCustomPricesModal(true);
                              }}
                              className="p-1 px-3 py-1.5 border border-amber-200/80 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                              title="Gestisci tariffe speciali dedicate"
                            >
                              <Coins className="w-3.5 h-3.5 text-amber-600" />
                              <span>Tariffe</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => openEditModal(cust, e)}
                              className="p-1 px-3 py-1.5 border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                              title="Modifica Anagrafica"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                              <span>Modifica</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCust(cust, e)}
                              className="p-1 px-2.5 py-1.5 border border-red-200/60 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                              title="Elimina definitivo"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                              <span>Elimina</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassociated Customers if any exist */}
        {groupedCustomers["unassociated"]?.length > 0 && (
          <div className="bg-white border border-slate-200/80 rounded-3xl shadow-2xs overflow-hidden">
            <div
              onClick={() => toggleAccordion("unassociated")}
              className="w-full bg-amber-50/40 hover:bg-amber-50/70 px-6 py-4.5 flex items-center justify-between text-base font-bold text-[#1a2035] tracking-tight border-b border-slate-100 cursor-pointer select-none backdrop-blur-xs"
            >
              <div className="flex items-center gap-3">
                <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <div className="w-8 h-8 rounded-xl bg-amber-100/70 text-amber-800 border border-amber-200/60 flex items-center justify-center shadow-2xs">
                  <Users className="w-4 h-4 text-amber-700" />
                </div>
                <span>Senza Sede Specificata</span>
                <span className="text-xs text-slate-500 bg-white border border-slate-200/70 rounded-full px-2.5 py-0.5 leading-none font-semibold shadow-2xs">
                  {groupedCustomers["unassociated"].length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAllInSalon("unassociated");
                  }}
                  className="text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 font-bold px-3 py-1 rounded-xl transition-all active:scale-95 cursor-pointer whitespace-nowrap shadow-2xs"
                >
                  {isAllInSalonSelected("unassociated") ? "Deseleziona Negozio" : "Seleziona Tutti"}
                </button>
                {openAccordionIds["unassociated"] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </div>

            {openAccordionIds["unassociated"] && (
              <div className="divide-y divide-slate-100 animate-fadeIn">
                {groupedCustomers["unassociated"].map((cust) => {
                  const count = customPrices.filter(cp => cp.customerId === cust.id).length;
                  return (
                    <div 
                      key={cust.id}
                      onClick={() => {
                        setActiveCustDetailsId(cust.id);
                        setShowTechSheetModal(true);
                      }}
                      className={`p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/70 cursor-pointer duration-75 text-sm gap-4 transition-colors ${
                        activeCustDetailsId === cust.id && (showTechSheetModal || showCustomPricesModal) ? "bg-[#eef2ff]/40 border-l-4 border-l-[#1a3a8f]" : ""
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!selectedCustIds[cust.id]}
                          onChange={(e) => {
                            setSelectedCustIds(prev => ({
                              ...prev,
                              [cust.id]: !prev[cust.id]
                            }));
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded text-[#1a3a8f] border-slate-300 focus:ring-[#1a3a8f] cursor-pointer accent-[#1a3a8f] shrink-0"
                        />
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-2xs">
                          {cust.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-[#1a2035] text-sm tracking-tight truncate">
                              {cust.name}
                            </h4>
                            {count > 0 && (
                              <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200/80 text-amber-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full shadow-2xs" title={`${count} tariffe speciali attive`}>
                                <Coins className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>{count} {count === 1 ? "Tariffa Spec." : "Tariffe Spec."}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {cust.phone || "---"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 ml-7 sm:ml-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCustDetailsId(cust.id);
                            setShowTechSheetModal(true);
                          }}
                          className="p-1 px-3 py-1.5 border border-[#1a3a8f]/15 bg-[#eef2ff] hover:bg-[#e0e7ff] text-[#1a3a8f] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                          title="Apri immediatamente la scheda tecnica"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Scheda</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCustDetailsId(cust.id);
                            setShowCustomPricesModal(true);
                          }}
                          className="p-1 px-3 py-1.5 border border-amber-200/80 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                          title="Gestisci tariffe speciali dedicate"
                        >
                          <Coins className="w-3.5 h-3.5 text-amber-600" />
                          <span>Tariffe</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => openEditModal(cust, e)}
                          className="p-1 px-3 py-1.5 border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                          title="Modifica Anagrafica"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Modifica</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCust(cust, e)}
                          className="p-1 px-2.5 py-1.5 border border-red-200/60 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 shadow-2xs text-xs font-semibold active:scale-95"
                          title="Elimina definitivo"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          <span>Elimina</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Customer Create/Edit Modal in Stile Apple */}
      {custModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 md:pt-20 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setCustModalOpen(false)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-lg rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
            {/* Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/80 backdrop-blur-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] block">
                  {selectedCust ? "Aggiornamento Anagrafica" : "Nuovo Cliente"}
                </span>
                <h3 className="text-xl font-bold text-[#1a2035] tracking-tight">
                  {selectedCust ? "Modifica Scheda Cliente" : "Crea Nuova Anagrafica Cliente"}
                </h3>
              </div>
              <button 
                onClick={() => setCustModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 rounded-2xl transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error display */}
            {errorMsgCust && (
              <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200/80 text-red-700 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsgCust}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveCust} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Cognome e Nome *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es: Gramegna Emanuele"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium text-[#1a2035]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                     Recapito Cellulare *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={custPhonePrefix}
                      onChange={(e) => setCustPhonePrefix(e.target.value)}
                      className="bg-slate-50/80 border border-slate-200/80 rounded-2xl px-3 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all font-medium text-[#1a2035] shrink-0 cursor-pointer"
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
                      required
                      placeholder="Es: 3456789012"
                      value={custPhoneBody}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, "");
                        setCustPhoneBody(cleaned);
                      }}
                      className="flex-1 min-w-0 bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium text-[#1a2035]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Indirizzo Email
                  </label>
                  <input
                    type="email"
                    placeholder="Es: client@example.com"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium text-[#1a2035]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Sede Preferenziale di Riferimento *
                </label>
                <select
                  required
                  value={custSalonId}
                  onChange={(e) => setCustSalonId(e.target.value)}
                  className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all font-medium text-[#1a2035] cursor-pointer"
                >
                  <option value="" disabled>Seleziona sede</option>
                  {salons.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {salons.length === 0 && (
                  <p className="text-red-500 text-[10px] font-bold mt-1.5 leading-tight">
                    Devi configurare almeno un salone prima di poter associare o salvare clienti.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Note Tecniche, Formula Colore e Storico Capello
                </label>
                <textarea
                  placeholder="Annota formule chimiche, spessori, shampoo preferito, taglio solito..."
                  value={custNotes}
                  onChange={(e) => setCustNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium text-[#1a2035]"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setCustModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl px-5 py-2.5 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={savingCust || salons.length === 0}
                  className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:opacity-50 text-white rounded-2xl px-6 py-2.5 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  {savingCust ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Salvataggio...
                    </>
                  ) : (
                    "Salva Cliente"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scheda Tecnica Overlay Modal in Stile Apple */}
      {showTechSheetModal && activeCustomer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 md:pt-20 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowTechSheetModal(false)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-2xl rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
            {/* Header */}
            <div className="px-6 py-4.5 md:px-8 md:py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-xs">
              <div>
                <span className="text-[10px] bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 px-3 py-1 rounded-full font-bold uppercase tracking-wider select-none shadow-2xs">
                  Scheda Tecnica Cliente
                </span>
                <h3 className="text-2xl font-bold text-[#1a2035] tracking-tight mt-1.5 leading-tight">
                  {activeCustomer.name}
                </h3>
              </div>
              <button 
                onClick={() => setShowTechSheetModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 rounded-2xl transition-all active:scale-95 cursor-pointer"
                title="Chiudi Scheda"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-6 md:p-8 space-y-6">
              
              {/* Formula & Tech Notes Panel with High Contrast and Copy/Quick Save */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#1a3a8f]" />
                    Note Tecniche, Formule Capelli & Storico
                  </label>
                  {activeCustomer.notes && (
                    <button
                      onClick={() => handleCopyNotes(activeCustomer.notes || "")}
                      className="text-[11px] font-bold text-[#1a3a8f] hover:text-[#152f73] flex items-center gap-1.5 cursor-pointer select-none bg-[#eef2ff] border border-[#1a3a8f]/10 px-3 py-1 rounded-full transition-all active:scale-95 shadow-2xs"
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

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-md text-slate-100">
                  {activeCustomer.notes ? (
                    <p className="text-sm whitespace-pre-wrap font-mono leading-relaxed select-text font-medium text-slate-100">
                      {activeCustomer.notes}
                    </p>
                  ) : (
                    <p className="text-xs italic text-slate-400 font-medium">
                      Nessuna nota tecnica inserita. Puoi inserirla cliccando su "Modifica" per salvare formule colore o trattamenti specifici.
                    </p>
                  )}
                </div>
              </div>

              {/* Reference to Custom Prices */}
              <div className="pt-4 border-t border-slate-100">
                <div className="bg-amber-50/60 border border-amber-200/70 rounded-3xl p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 border border-amber-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                      <Coins className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-800">Tariffe Speciali Personalizzate</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Le tariffe concordate e i listini speciali dedicati sono gestibili in modo rapido e indipendente.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTechSheetModal(false);
                      setShowCustomPricesModal(true);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white rounded-2xl px-4 py-2 text-xs font-semibold cursor-pointer transition-all active:scale-[0.98] shrink-0 flex items-center gap-1.5 shadow-2xs"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    Gestisci Tariffe
                  </button>
                </div>
              </div>

            </div>

            {/* Footer with edit trigger and close */}
            <div className="px-6 py-4.5 md:px-8 md:py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-xs">
              <button
                onClick={(e) => {
                  setShowTechSheetModal(false);
                  openEditModal(activeCustomer, e);
                }}
                className="bg-white hover:bg-slate-100 border text-slate-700 border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98] shadow-2xs"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                Modifica Anagrafica e Note
              </button>
              
              <button
                onClick={() => setShowTechSheetModal(false)}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-2xl px-6 py-2.5 text-xs font-semibold cursor-pointer transition-all active:scale-[0.98] shadow-sm shadow-[#1a3a8f]/20"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tariffe Speciali Dedicated Modal in Stile Apple */}
      {showCustomPricesModal && activeCustomer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 md:pt-20 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowCustomPricesModal(false)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-xl rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
            {/* Header */}
            <div className="px-6 py-4.5 md:px-8 md:py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 border border-amber-200/80 flex items-center justify-center shadow-2xs">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-3 py-0.5 rounded-full font-bold uppercase tracking-wider select-none border border-amber-200/80 shadow-2xs">
                    Tariffe Speciali Cliente
                  </span>
                  <h3 className="text-xl font-bold text-[#1a2035] tracking-tight mt-1 leading-tight">
                    {activeCustomer.name}
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setShowCustomPricesModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 rounded-2xl transition-all active:scale-95 cursor-pointer"
                title="Chiudi Tariffe"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-6 md:p-8 space-y-6">
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Qui puoi definire un prezzo speciale personalizzato (ribassato o maggiorato) su servizi specifici per questo cliente. Durante la prenotazione o il pagamento in cassa, verrà applicata automaticamente questa tariffa concordata anziché quella del listino standard.
                  </p>
                </div>

                {businessSettings?.userPlan === "solo_pro" ? (
                  <div className="bg-slate-50/90 border border-slate-200/80 rounded-3xl p-6 text-center shadow-2xs space-y-4 relative overflow-hidden">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 mx-auto shadow-2xs">
                      <Lock className="w-6 h-6" />
                    </div>

                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wider border border-amber-200">
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
                          setShowCustomPricesModal(false);
                          setCurrentTab("account_info");
                        }}
                        className="bg-[#1a3a8f] hover:bg-[#152f73] text-white text-xs font-semibold px-5 py-2.5 rounded-2xl shadow-sm shadow-[#1a3a8f]/20 transition-all active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        Sblocca ora <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Subform to add custom price */}
                    {services.length === 0 ? (
                      <p className="text-xs text-red-500 italic">Crea almeno un trattamento nei servizi per sbloccare i prezzi speciali.</p>
                    ) : (
                      <form onSubmit={handleAddCustomPrice} className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-50/80 border border-slate-200/80 p-4.5 rounded-3xl shadow-2xs">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Trattamento</label>
                          <select
                            required
                            value={customPriceServiceId}
                            onChange={(e) => setCustomPriceServiceId(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:border-[#1a3a8f] outline-none font-medium text-[#1a2035] cursor-pointer"
                          >
                            <option value="" disabled>Seleziona Trattamento</option>
                            {services.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name} (€{s.price?.toFixed(2)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Prezzo Dedicato</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-semibold">€</span>
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder="0.00"
                              value={customPriceValue}
                              onChange={(e) => setCustomPriceValue(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-xs focus:border-[#1a3a8f] outline-none font-semibold text-[#1a2035] font-mono"
                            />
                          </div>
                        </div>
                        <div className="sm:col-span-2 flex items-end">
                          <button
                            type="submit"
                            disabled={savingCustomPrice}
                            className="w-full bg-[#1a3a8f] hover:bg-[#152f73] text-white py-2 text-xs rounded-xl cursor-pointer flex items-center justify-center font-semibold h-[34px] shadow-2xs active:scale-95 transition-all select-none"
                            title="Associa o Modifica Tariffa Totale"
                          >
                            {savingCustomPrice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Associa"}
                          </button>
                        </div>
                      </form>
                    )}

                    {activeCustPrices.length === 0 ? (
                      <p className="text-xs text-slate-400 italic bg-slate-50/60 border border-slate-200/60 rounded-2xl p-4 text-center">
                        Nessuna tariffa speciale è attualmente associata a questo cliente. I trattamenti seguono il prezzo standard del listino.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tariffe Attive ({activeCustPrices.length})</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {activeCustPrices.map((cp) => (
                            <div 
                              key={cp.id}
                              className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-3.5 flex items-center justify-between text-xs font-semibold hover:bg-amber-50 duration-75 shadow-2xs"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="text-slate-800 truncate font-semibold" title={cp.serviceName}>{cp.serviceName}</p>
                                <p className="text-[10px] text-slate-500 font-medium">Prezzo personalizzato</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-xl border border-amber-200/80 font-mono shadow-2xs">
                                  €{cp.price?.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomPrice(cp.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all cursor-pointer active:scale-95"
                                  title="Elimina Tariffa Dedicata"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4.5 md:px-8 md:py-5 border-t border-slate-100 flex items-center justify-end bg-slate-50/80 backdrop-blur-xs">
              <button
                onClick={() => setShowCustomPricesModal(false)}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-2xl px-6 py-2.5 text-xs font-semibold cursor-pointer transition-all active:scale-[0.98] shadow-sm shadow-[#1a3a8f]/20"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Confirmation Modal in Stile Apple */}
      {custToDelete && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setCustToDelete(null)} />
          <div className="relative bg-white border border-slate-200/80 w-full max-w-md rounded-3xl shadow-2xl z-10 p-6 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-2xl shrink-0 border border-red-200/60 shadow-2xs">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[#1a2035] tracking-tight">
                  Elimina Anagrafica Cliente
                </h3>
                <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                  Sei sicuro di voler eliminare definitivamente l'anagrafica di <strong>{custToDelete.name}</strong>?
                  Questa operazione cancellerà tutte le sue note tecniche, formule colore e listini personalizzati. L'azione è irreversibile.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCustToDelete(null)}
                className="px-5 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={executeDeleteCust}
                className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-5 py-2.5 text-xs font-semibold shadow-sm shadow-red-600/20 cursor-pointer flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                {deletingCust ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Eliminazione...
                  </>
                ) : (
                  "Conferma ed Elimina"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
