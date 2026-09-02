import React, { useState, useEffect, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc,
  writeBatch,
  setDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import firebaseConfig from "../../firebase-applet-config.json";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import { 
  Users, 
  Plus, 
  Phone, 
  Mail, 
  Store, 
  X, 
  Edit3, 
  Trash2, 
  AlertCircle, 
  Check, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  Loader2, 
  Eye, 
  EyeOff,
  Search,
  CheckCircle2,
  Info,
  ChevronDown,
  Sparkles
} from "lucide-react";
import * as XLSX from "xlsx";
import { PLAN_LIMITS } from "../lib/plans";
import { COUNTRY_PREFIXES, splitPhoneNumber } from "./CustomersScreen";

const normalizeSalonName = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
};

interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  salonIds: string[];
  ownerId: string;
}

export default function TeamScreen() {
  const { user, salons, ownerId, userRole, userSalonIds, businessSettings } = useBusiness();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSalonId, setFilterSalonId] = useState<string>("all");

  // Dynamic monthly report tracking
  const [monthlyReportCount, setMonthlyReportCount] = useState<number>(0);
  const [loadingReportCount, setLoadingReportCount] = useState<boolean>(true);

  // Guide accordion toggle
  const [showImportGuide, setShowImportGuide] = useState(false);

  // Selection states for custom Excel exporting
  const [selectedMemberIds, setSelectedMemberIds] = useState<Record<string, boolean>>({});

  // Delete confirmation overlay state
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [role, setRole] = useState("Specialista Colore");
  const [phonePrefix, setPhonePrefix] = useState("+39");
  const [phoneBody, setPhoneBody] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [selectedSalonIds, setSelectedSalonIds] = useState<string[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const rolesList = [
    "Hair Stylist Senior", 
    "Specialista Colore", 
    "Taglio Uomo & Barba", 
    "Stylist Junior", 
    "Receptionist", 
    "Tirocinante"
  ];

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

  const allowedSalons = useMemo(() => {
    if (userRole === "owner") return salons;
    const allowedIds = userSalonIds || [];
    return salons.filter(s => allowedIds.includes(s.id));
  }, [salons, userRole, userSalonIds]);

  const salonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    salons.forEach((s) => {
      if (s.id && s.name) map[s.id] = s.name;
    });
    return map;
  }, [salons]);

  // Real-time listener for team members
  useEffect(() => {
    if (!ownerId) return;

    setLoading(true);
    const q = query(collection(db, "team"), where("ownerId", "==", ownerId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as TeamMember[];
        
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
        const uniqueFetched = Array.from(uniqueMap.values());
        
        let filtered = uniqueFetched;
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = uniqueFetched.filter(t => t.salonIds && t.salonIds.some(id => allowedIds.includes(id)));
        }
        
        setMembers(filtered.sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching team:", error);
        handleFirestoreError(error, OperationType.LIST, "team");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [ownerId, userRole, userSalonIds]);

  // Filtered members by Salon and Search Query
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      // Salon match
      const matchSalon = filterSalonId === "all" || (m.salonIds && m.salonIds.includes(filterSalonId));
      if (!matchSalon) return false;

      // Search match
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchName = m.name?.toLowerCase().includes(q);
      const matchRole = m.role?.toLowerCase().includes(q);
      const matchEmail = m.email?.toLowerCase().includes(q);
      const matchPhone = m.phone?.toLowerCase().includes(q);
      return matchName || matchRole || matchEmail || matchPhone;
    });
  }, [members, filterSalonId, searchQuery]);

  const stats = useMemo(() => {
    const total = filteredMembers.length;
    const uniqueRoles = new Set(filteredMembers.map(m => m.role)).size;
    const associations = filterSalonId === "all"
      ? filteredMembers.reduce((sum, m) => sum + (m.salonIds ? m.salonIds.length : 0), 0)
      : filteredMembers.length;
    return { total, uniqueRoles, associations };
  }, [filteredMembers, filterSalonId]);

  const selectedCount = useMemo(() => {
    return Object.values(selectedMemberIds).filter(Boolean).length;
  }, [selectedMemberIds]);

  const openCreateModal = () => {
    setSelectedMember(null);
    setName("");
    setRole("Specialista Colore");
    setPhonePrefix("+39");
    setPhoneBody("");
    setEmail("");
    setPassword("");
    setSelectedSalonIds(filterSalonId === "all" ? salons.map(s => s.id) : [filterSalonId]);
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEditModal = (member: TeamMember) => {
    setSelectedMember(member);
    setName(member.name);
    setRole(member.role);
    const parsed = splitPhoneNumber(member.phone || "");
    setPhonePrefix(parsed.prefix);
    setPhoneBody(parsed.number);
    setEmail(member.email || "");
    setPassword("");
    setSelectedSalonIds(member.salonIds || []);
    setErrorMsg("");
    setModalOpen(true);
  };

  const toggleSalonSelection = (salonId: string) => {
    setSelectedSalonIds((prev) => 
      prev.includes(salonId) ? prev.filter(id => id !== salonId) : [...prev, salonId]
    );
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setErrorMsg("Il nome del collaboratore è obbligatorio");
      return;
    }
    if (selectedSalonIds.length === 0) {
      setErrorMsg("Seleziona almeno un salone di appartenenza");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const emailClean = email.trim().toLowerCase();

    if (!selectedMember && role === "Receptionist") {
      if (!emailClean) {
        setErrorMsg("L'indirizzo Email è obbligatorio per il ruolo Receptionist");
        setSaving(false);
        return;
      }
      if (!password.trim()) {
        setErrorMsg("La Password di Accesso è obbligatoria per creare l'account Receptionist");
        setSaving(false);
        return;
      }
    }

    let newUid = "";

    if (!selectedMember && emailClean && password.trim()) {
      if (password.trim().length < 6) {
        setErrorMsg("La password deve essere di almeno 6 caratteri");
        setSaving(false);
        return;
      }

      const tempAppName = `temp-register-${Date.now()}`;
      const tempApp = initializeApp(firebaseConfig, tempAppName);
      try {
        const tempAuth = getAuth(tempApp);
        let tempDb;
        try {
          tempDb = initializeFirestore(tempApp, {
            experimentalForceLongPolling: true,
          }, firebaseConfig.firestoreDatabaseId);
        } catch (dbErr) {
          tempDb = getFirestore(tempApp);
        }
        
        const userCredential = await createUserWithEmailAndPassword(
          tempAuth,
          emailClean,
          password.trim()
        );
        newUid = userCredential.user.uid;
        
        const userDocRef = doc(tempDb, "users", newUid);
        const isReceptionist = role === "Receptionist";
        await setDoc(userDocRef, {
          uid: newUid,
          name: name.trim(),
          email: emailClean,
          role: isReceptionist ? "receptionist" : "barbiere",
          tenant_id: user.uid,
          createdAt: new Date().toISOString()
        });
      } catch (regErr: any) {
        console.error("Error auto-registering user in Auth:", regErr);
        setErrorMsg(`Errore registrazione utente: ${regErr.message || String(regErr)}`);
        setSaving(false);
        try { await deleteApp(tempApp); } catch (delErr) {}
        return;
      }
      
      try { await deleteApp(tempApp); } catch (delErr) {}
    }

    const joinedPhone = phoneBody.trim() ? `${phonePrefix}${phoneBody.trim()}` : "";
    const payload = {
      name: name.trim(),
      role,
      phone: joinedPhone,
      email: emailClean || email.trim(),
      salonIds: selectedSalonIds,
      ownerId: user.uid,
      ...(newUid ? { uid: newUid } : {})
    };

    try {
      let savePromise: Promise<any>;
      if (selectedMember) {
        if (emailClean && selectedMember.id !== emailClean) {
          const p1 = deleteDoc(doc(db, "team", selectedMember.id));
          const p2 = setDoc(doc(db, "team", emailClean), payload);
          savePromise = Promise.all([p1, p2]);
        } else {
          const docRef = doc(db, "team", selectedMember.id);
          savePromise = updateDoc(docRef, payload);
        }
      } else {
        if (emailClean) {
          const docRef = doc(db, "team", emailClean);
          const p1 = setDoc(docRef, payload);
          if (newUid) {
            const uidDocRef = doc(db, "team", newUid);
            const p2 = setDoc(uidDocRef, payload);
            savePromise = Promise.all([p1, p2]);
          } else {
            savePromise = p1;
          }
        } else {
          savePromise = addDoc(collection(db, "team"), payload);
        }
      }

      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);
      setModalOpen(false);
    } catch (err: any) {
      console.error("Error saving team member:", err);
      setErrorMsg("Impossibile salvare il collaboratore. Riprova.");
      handleFirestoreError(err, selectedMember ? OperationType.UPDATE : OperationType.CREATE, "team");
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectMember = (id: string) => {
    setSelectedMemberIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSelectAll = () => {
    const allSelected = filteredMembers.length > 0 && filteredMembers.every(m => selectedMemberIds[m.id]);
    setSelectedMemberIds(prev => {
      const next = { ...prev };
      filteredMembers.forEach(m => {
        next[m.id] = !allSelected;
      });
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteDoc(doc(db, "team", deleteTarget.id));
      if (selectedMemberIds[deleteTarget.id]) {
        setSelectedMemberIds(prev => ({
          ...prev,
          [deleteTarget.id]: false
        }));
      }
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Error during deletion:", err);
      setDeleteError("Impossibile procedere con l'eliminazione. Riprova.");
      handleFirestoreError(err, OperationType.DELETE, `team/${deleteTarget.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Prepopulate sample team
  const handlePrepopulate = async () => {
    if (!user) return;
    try {
      const salonIds = salons.map(s => s.id);
      const defaultTeam = [
        { name: "Emanuele Gramegna", role: "Hair Stylist Senior", phone: "+393281234567", email: "emanuele@sforbiciasmart.it", salonIds: salonIds.slice(0, 2), ownerId: user.uid },
        { name: "Chiara Russo", role: "Specialista Colore", phone: "+393339876543", email: "chiara@sforbiciasmart.it", salonIds: salonIds.slice(0, 1), ownerId: user.uid },
        { name: "Marco Bianchi", role: "Taglio Uomo & Barba", phone: "+393494448888", email: "marco@sforbiciasmart.it", salonIds: salonIds, ownerId: user.uid }
      ];

      const batch = writeBatch(db);
      defaultTeam.forEach((t) => {
        const docRef = doc(collection(db, "team"));
        batch.set(docRef, t);
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to prepopulate team:", err);
    }
  };

  // EXCEL EXPORT
  const handleExportXLSX = async () => {
    if (!ownerId) return;

    try {
      const planKey = businessSettings?.userPlan || "network";
      const limit = PLAN_LIMITS[planKey]?.maxReportsPerMonth ?? Infinity;

      if (limit !== Infinity && monthlyReportCount >= limit) {
        alert(`Spiacenti! Il tuo piano attuale consente un massimo di ${limit} report Excel al mese.\nHai già effettuato ${monthlyReportCount} esportazioni questo mese.\nAggiorna il tuo abbonamento per sbloccare esportazioni illimitate.`);
        return;
      }

      const activeSelection = filteredMembers.filter(m => selectedMemberIds[m.id]);
      const targets = activeSelection.length > 0 ? activeSelection : filteredMembers;
      
      const rows = targets.map(m => {
        const associatedSalons = m.salonIds && m.salonIds.length > 0
          ? m.salonIds.map(sid => salonsMap[sid] || "Sede Sconosciuta").join(", ")
          : "";
          
        return {
          "Nome": m.name,
          "Ruolo": m.role,
          "Telefono": m.phone || "",
          "Email": m.email || "",
          "Sedi Associate": associatedSalons
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Collaboratori");
      
      ws["!cols"] = [
        { wch: 25 },
        { wch: 25 },
        { wch: 20 },
        { wch: 30 },
        { wch: 35 }
      ];

      const suffix = activeSelection.length > 0 ? `Selezionati_${activeSelection.length}` : "Tutti";
      XLSX.writeFile(wb, `Team_${suffix}_${new Date().toISOString().slice(0,10)}.xlsx`);

      await addDoc(collection(db, "reports_history"), {
        ownerId,
        reportType: "team_list",
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Export failure", err);
      alert("Errore nella generazione del foglio Excel.");
    }
  };

  // EXCEL DOWNLOAD EMPTY TEMPLATE
  const handleDownloadTemplate = () => {
    try {
      const rows = [
        {
          "Nome": "Emanuele Gramegna",
          "Ruolo": "Hair Stylist Senior",
          "Telefono": "+39 328 123 4567",
          "Email": "emanuele@salonflow.it",
          "Sedi Associate": "Sede Centrale, Sede Catania"
        },
        {
          "Nome": "Chiara Russo",
          "Ruolo": "Specialista Colore",
          "Telefono": "+39 333 987 6543",
          "Email": "chiara@salonflow.it",
          "Sedi Associate": "Sede Centrale"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Modello Team");
      
      ws["!cols"] = [
        { wch: 25 },
        { wch: 25 },
        { wch: 20 },
        { wch: 30 },
        { wch: 35 }
      ];

      XLSX.writeFile(wb, "Template_Importazione_Team.xlsx");
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
          const nameClean = row["Nome"] || row["name"] || row["Nome Collaboratore"];
          if (!nameClean || !String(nameClean).trim()) continue;
          
          const roleClean = row["Ruolo"] || row["role"] || "Specialista Colore";
          const phoneClean = row["Telefono"] || row["phone"] || "";
          const emailClean = row["Email"] || row["email"] || "";
          
          const rawSedi = row["Sedi Associate"] || row["Sede Associata"] || row["Sede"] || row["salons"] || "";
          const salonIdsToAssign: string[] = [];
          
          if (rawSedi && String(rawSedi).trim()) {
            const sediList = String(rawSedi)
              .split(",")
              .map(s => s.trim())
              .filter(s => {
                const ls = s.toLowerCase();
                return ls && ls !== "tutti" && ls !== "nessuna" && ls !== "tutti i saloni";
              });

            for (const sName of sediList) {
              const normalizedInput = normalizeSalonName(sName);
              let foundSalon = activeSalons.find(s => 
                normalizeSalonName(s.name || "") === normalizedInput
              );

              if (!foundSalon && normalizedInput.length >= 3) {
                 foundSalon = activeSalons.find(s => {
                   const normName = normalizeSalonName(s.name || "");
                   return normName.includes(normalizedInput) || normalizedInput.includes(normName);
                 });
              }

              if (!foundSalon) {
                if (activeSalons.length < limit) {
                  const newSalonPayload = {
                    name: sName.slice(0, 128),
                    address: "",
                    phone: "",
                    hours: "Lunedì, Martedì, Mercoledì, Giovedì, Venerdì, Sabato: 09:00 - 19:00",
                    ownerId: user.uid,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  };
                  
                  let docRef;
                  try {
                    docRef = await addDoc(collection(db, "salons"), newSalonPayload);
                  } catch (salonErr) {
                    console.error("Error creating salon:", salonErr);
                  }

                  if (docRef) {
                    const newlyCreatedSalon = { id: docRef.id, ...newSalonPayload };
                    activeSalons.push(newlyCreatedSalon);
                    foundSalon = newlyCreatedSalon;
                  }
                } else {
                  skippedSalonNames.add(sName);
                }
              }

              if (foundSalon && foundSalon.id) {
                salonIdsToAssign.push(foundSalon.id);
              }
            }
          }

          if (salonIdsToAssign.length === 0 && activeSalons[0]?.id) {
            salonIdsToAssign.push(activeSalons[0].id);
          }

          const newMemberPayload = {
            name: String(nameClean).trim().slice(0, 128),
            role: String(roleClean).trim().slice(0, 128),
            phone: String(phoneClean).trim().slice(0, 32),
            email: String(emailClean).trim().slice(0, 128),
            salonIds: salonIdsToAssign,
            ownerId: user.uid
          };

          try {
            const memberEmail = String(emailClean).trim().toLowerCase();
            if (memberEmail) {
              await setDoc(doc(db, "team", memberEmail), newMemberPayload);
            } else {
              await addDoc(collection(db, "team"), newMemberPayload);
            }
            importCount++;
          } catch (memberErr) {
            console.error("Error creating team member:", memberErr);
          }
        }

        let alertMessage = `Importazione completata! ${importCount} collaboratori aggiunti con successo.`;
        if (skippedSalonNames.size > 0) {
          const namesStr = Array.from(skippedSalonNames).join(", ");
          alertMessage += `\n\nAttenzione: le seguenti sedi non sono state create per limite del piano: ${namesStr}.`;
        }
        alert(alertMessage);
      } catch (err: any) {
        console.error("Importation error detail:", err);
        alert(`Errore nell'importazione dei dati:\n${err.message || String(err)}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6 animate-pageFade max-w-7xl mx-auto pb-12" id="team-screen">
      
      {/* 1. Header con palette originale (#1a2035 e #1a3a8f) in stile Apple */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 text-xs font-semibold tracking-wide shadow-2xs">
              <Users className="w-3.5 h-3.5 text-[#1a3a8f]" />
              <span>Risorse Umane & Organico</span>
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#1a2035] tracking-tight">
            Team & Collaboratori
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Gestisci l'organico dei tuoi saloni, assegna ruoli professionali e monitora la presenza nelle sedi operative.
          </p>
        </div>

        {/* Action Buttons in Stile Apple */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Quick Guide Trigger */}
          <button
            onClick={() => setShowImportGuide(!showImportGuide)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer border ${
              showImportGuide 
                ? "bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-xs" 
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
            }`}
            title="Istruzioni per l'importazione Excel"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Come Importare</span>
          </button>

          {/* Export Excel */}
          <button
            onClick={handleExportXLSX}
            disabled={members.length === 0}
            className="px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-2xs disabled:opacity-40"
            title={selectedCount > 0 ? `Esporta ${selectedCount} collaboratori selezionati` : "Esporta tutti"}
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>{selectedCount > 0 ? `Esporta (${selectedCount})` : "Esporta XLSX"}</span>
          </button>

          {userRole === "owner" && (
            <>
              {/* Import Excel */}
              <label className="px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-2xs">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Importa</span>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  className="hidden" 
                  onChange={handleImportXLSX} 
                />
              </label>

              {/* Primary Add Button con colore originale #1a3a8f in stile Apple */}
              <button
                onClick={openCreateModal}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-2xl px-4.5 py-2 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-sm shadow-[#1a3a8f]/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>Nuovo Collaboratore</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Guida Excel Collapsible in Stile Apple */}
      {showImportGuide && (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs animate-fadeIn space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#1a2035] tracking-tight flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#1a3a8f]" />
                Come strutturare il foglio Excel per l'importazione
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                Puoi caricare un file con le colonne indicate qui sotto. Se specifichi dei saloni non ancora registrati, verranno creati automaticamente nel rispetto dei limiti del tuo piano.
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="px-3.5 py-1.5 bg-[#eef2ff] hover:bg-[#e0e7ff] text-[#1a3a8f] text-xs font-semibold rounded-2xl transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shrink-0 border border-[#1a3a8f]/10 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              Scarica Modello (.XLSX)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">Nome *</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Nome e cognome (es. <em>Chiara Russo</em>).</p>
            </div>
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">Ruolo</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Specializzazione o mansione nel salone.</p>
            </div>
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">Contatti</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Telefono ed eventuale email aziendale.</p>
            </div>
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">Sedi Associate</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Nomi dei saloni separati da virgola.</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Bento KPI Cards con palette aziendale & Apple Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Blu Profondo #1a3a8f */}
        <div className="bg-gradient-to-br from-[#1a3a8f] via-[#163380] to-[#0f2259] p-5 sm:p-6 rounded-3xl text-white shadow-sm shadow-[#1a3a8f]/20 relative overflow-hidden flex flex-col justify-between group transition-all duration-300 hover:shadow-md">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-15 transition-transform duration-500 group-hover:scale-110">
            <Users className="w-32 h-32 stroke-[1.2]" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold tracking-wider text-blue-200/90 block">
              Collaboratori Totali
            </span>
            <h3 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">
              {stats.total}
            </h3>
          </div>
          <p className="text-xs text-blue-200/80 mt-4 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Membri registrati nell'organico
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Specializzazioni
            </span>
            <div className="text-2xl sm:text-3xl font-bold text-[#1a2035] tracking-tight">
              {stats.uniqueRoles}
            </div>
            <p className="text-xs text-slate-500">Ruoli distinti nel salone</p>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center shrink-0 border border-[#1a3a8f]/10 shadow-2xs">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Presenze nelle Sedi
            </span>
            <div className="text-2xl sm:text-3xl font-bold text-[#1a2035] tracking-tight">
              {stats.associations}
            </div>
            <p className="text-xs text-slate-500">Assegnazioni operative attive</p>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center shrink-0 border border-[#1a3a8f]/10 shadow-2xs">
            <Store className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 4. Barra di Ricerca & Segmented Control Apple-Style con colore aziendale */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-3xl border border-slate-200/80 shadow-2xs">
        
        {/* Search input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cerca collaboratore per nome, ruolo, telefono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50/80 hover:bg-slate-100/70 focus:bg-white text-xs pl-10 pr-8 py-2.5 rounded-2xl border border-slate-200/80 focus:border-[#1a3a8f] outline-none text-[#1a2035] font-medium transition"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Salon Segmented Control Apple Style */}
        {allowedSalons.length > 1 && (
          <div className="inline-flex p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60 overflow-x-auto self-start md:self-auto backdrop-blur-sm">
            <button
              onClick={() => setFilterSalonId("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                filterSalonId === "all"
                  ? "bg-[#1a3a8f] text-white shadow-2xs font-bold"
                  : "text-slate-600 hover:text-[#1a2035]"
              }`}
            >
              Tutte le sedi ({members.length})
            </button>
            {allowedSalons.map((salon) => {
              const count = members.filter(m => m.salonIds && m.salonIds.includes(salon.id)).length;
              return (
                <button
                  key={salon.id}
                  onClick={() => setFilterSalonId(salon.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    filterSalonId === salon.id
                      ? "bg-[#1a3a8f] text-white shadow-2xs font-bold"
                      : "text-slate-600 hover:text-[#1a2035]"
                  }`}
                >
                  {salon.name} ({count})
                </button>
              );
            })}
          </div>
        )}

      </div>

      {/* 5. Statistiche Compatte e Selezione Multipla */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs px-1">
        <div className="flex items-center gap-2 text-gray-500 font-medium">
          <span className="font-bold text-[#1a2035]">{stats.total}</span> collaboratori
          <span>•</span>
          <span className="font-bold text-[#1a2035]">{stats.uniqueRoles}</span> ruoli
          <span>•</span>
          <span className="font-bold text-[#1a2035]">{stats.associations}</span> presenze nelle sedi
        </div>

        {filteredMembers.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs font-semibold text-gray-600 hover:text-[#1a3a8f] underline underline-offset-2 cursor-pointer"
            >
              {selectedCount === filteredMembers.length ? "Deseleziona tutti" : "Seleziona tutti"}
            </button>
            {selectedCount > 0 && (
              <span className="bg-[#eef2ff] text-[#1a3a8f] font-bold px-2.5 py-0.5 rounded-full text-[11px] border border-[#1a3a8f]/15">
                {selectedCount} selezionati
              </span>
            )}
          </div>
        )}
      </div>

      {/* 6. Team Grid / Loading / Empty States */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 space-y-2">
          <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#1a3a8f]" />
          <p className="text-xs font-medium">Caricamento del team in corso...</p>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-10 text-center max-w-lg mx-auto shadow-2xs space-y-4">
          <div className="w-14 h-14 rounded-3xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center mx-auto border border-[#1a3a8f]/10 shadow-2xs">
            <Users className="w-7 h-7 stroke-[1.75]" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-[#1a2035] tracking-tight">
              {searchQuery ? "Nessun collaboratore trovato" : "Nessun collaboratore registrato"}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {searchQuery 
                ? "Prova a modificare i termini di ricerca o a selezionare un'altra sede."
                : "Aggiungi il tuo primo collaboratore o carica un file Excel per iniziare."}
            </p>
          </div>
          {!searchQuery && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={openCreateModal}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white text-xs font-bold px-5 py-2.5 rounded-2xl transition-all active:scale-[0.98] cursor-pointer shadow-sm shadow-[#1a3a8f]/20"
              >
                Aggiungi Collaboratore
              </button>
              <button
                onClick={handlePrepopulate}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-2xl transition-all active:scale-[0.98] cursor-pointer"
              >
                Dati di Esempio
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Team Members Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredMembers.map((member) => {
            const isSelected = !!selectedMemberIds[member.id];
            const initials = member.name
              .split(" ")
              .map(n => n[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase() || "C";

            return (
              <div
                key={member.id}
                className={`bg-white rounded-3xl border p-5 sm:p-6 transition-all duration-200 flex flex-col justify-between relative group ${
                  isSelected 
                    ? "border-[#1a3a8f] ring-2 ring-[#1a3a8f]/15 shadow-md" 
                    : "border-gray-200/80 hover:border-gray-300 shadow-xs hover:shadow-md"
                }`}
              >
                {/* Checkbox Selettore in alto a destra */}
                <button
                  type="button"
                  onClick={() => toggleSelectMember(member.id)}
                  className={`absolute top-4 right-4 w-5 h-5 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                    isSelected
                      ? "bg-[#1a3a8f] border-[#1a3a8f] text-white"
                      : "border-gray-300 bg-gray-50/50 hover:bg-gray-100 opacity-60 group-hover:opacity-100"
                  }`}
                  title="Seleziona"
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </button>

                <div className="space-y-4">
                  {/* Avatar & Header */}
                  <div className="flex items-center gap-3.5 pr-6">
                    <div className="w-12 h-12 rounded-2xl bg-[#eef2ff] text-[#1a3a8f] font-bold text-sm flex items-center justify-center shrink-0 border border-[#1a3a8f]/15 shadow-2xs">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[#1a2035] tracking-tight truncate">
                        {member.name}
                      </h3>
                      <span className="inline-block mt-1 text-[11px] font-semibold text-[#1a3a8f] bg-[#eef2ff] border border-[#1a3a8f]/15 px-2.5 py-0.5 rounded-full truncate max-w-[170px]">
                        {member.role}
                      </span>
                    </div>
                  </div>

                  {/* Recapiti Contatti */}
                  <div className="space-y-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 text-slate-400">
                        <Phone className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium truncate">{member.phone || "Nessun recapito telefonico"}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 text-slate-400">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium truncate">{member.email || "Nessun indirizzo email"}</span>
                    </div>
                  </div>

                  {/* Sedi Assegnate */}
                  <div className="pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      <Store className="w-3 h-3" />
                      <span>Sedi Operative</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {member.salonIds && member.salonIds.length > 0 ? (
                        member.salonIds.map((sid) => (
                          <span
                            key={sid}
                            className="inline-block text-[11px] font-medium bg-slate-50 text-[#1a2035] px-2.5 py-1 rounded-xl border border-slate-200/80 truncate"
                          >
                            {salonsMap[sid] || "Sede"}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Nessuna sede associata</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Azioni */}
                {userRole === "owner" && (
                  <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openEditModal(member)}
                      className="p-1.5 px-3.5 rounded-2xl border border-slate-200 text-slate-700 hover:text-[#1a3a8f] hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Modifica</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(member)}
                      className="p-1.5 px-3.5 rounded-2xl border border-rose-100 text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Elimina</span>
                    </button>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* 7. Modal Inserisci / Modifica Collaboratore in Stile Apple */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md transition-opacity" onClick={() => setModalOpen(false)} />
          
          <div className="relative bg-white border border-slate-100 w-full max-w-lg rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh] animate-scaleUp">
            
            {/* Header Modal */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
              <div>
                <h3 className="text-base font-bold text-[#1a2035] tracking-tight">
                  {selectedMember ? "Modifica Collaboratore" : "Nuovo Collaboratore"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inserisci i dettagli e le sedi di lavoro del membro del team.
                </p>
              </div>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner */}
            {errorMsg && (
              <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveMember} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              
              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome e Cognome *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Chiara Russo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-xs px-3.5 py-2.5 rounded-2xl outline-none font-medium text-[#1a2035] transition"
                />
              </div>

              {/* Ruolo */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Ruolo / Specializzazione
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-xs px-3.5 py-2.5 rounded-2xl outline-none font-medium text-[#1a2035] transition cursor-pointer"
                >
                  {rolesList.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Telefono & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Recapito Telefonico
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={phonePrefix}
                      onChange={(e) => setPhonePrefix(e.target.value)}
                      className="bg-slate-50 border border-slate-200/80 text-xs px-2.5 py-2.5 rounded-2xl outline-none font-medium text-[#1a2035] shrink-0 cursor-pointer"
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
                      placeholder="3331234567"
                      value={phoneBody}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, "");
                        setPhoneBody(cleaned);
                      }}
                      className="flex-1 min-w-0 bg-slate-50 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-xs px-3 py-2.5 rounded-2xl outline-none font-medium text-[#1a2035] transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Indirizzo Email
                  </label>
                  <input
                    type="email"
                    placeholder="email@salone.it"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-xs px-3.5 py-2.5 rounded-2xl outline-none font-medium text-[#1a2035] transition"
                  />
                </div>
              </div>

              {/* Receptionist Password */}
              {!selectedMember && role === "Receptionist" && (
                <div className="bg-[#eef2ff] p-4 rounded-2xl border border-[#1a3a8f]/20 space-y-2">
                  <label className="block text-xs font-bold text-[#1a3a8f]">
                    Password di Accesso Portale
                  </label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Minimo 6 caratteri"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-[#1a3a8f] text-xs px-3.5 py-2.5 pr-10 rounded-2xl outline-none font-medium text-[#1a2035]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Consentirà al receptionist di effettuare l'accesso con queste credenziali.
                  </p>
                </div>
              )}

              {/* Sedi Assegnate */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Sedi operative di appartenenza *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
                  {salons.map((salon) => {
                    const isSelected = selectedSalonIds.includes(salon.id);
                    return (
                      <button
                        key={salon.id}
                        type="button"
                        onClick={() => toggleSalonSelection(salon.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-white border-[#1a3a8f] text-[#1a3a8f] shadow-2xs font-bold"
                            : "bg-white/60 border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <span className="truncate">{salon.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#1a3a8f] shrink-0 stroke-[2.5]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 mt-5 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl px-4 py-2.5 text-xs font-semibold transition cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:bg-slate-300 text-white rounded-2xl px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-[#1a3a8f]/20"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{selectedMember ? "Salva Modifiche" : "Crea Collaboratore"}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 8. Modal Conferma Eliminazione in Stile Apple */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md transition-opacity" onClick={() => setDeleteTarget(null)} />
          
          <div className="relative bg-white border border-slate-100 w-full max-w-sm rounded-3xl shadow-2xl z-10 p-6 animate-scaleUp space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#1a2035] tracking-tight">
                Rimuovi Collaboratore
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sei sicuro di voler rimuovere <strong className="text-[#1a2035]">"{deleteTarget.name}"</strong>? L'azione lo scollegherà da tutte le sedi operative.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl px-4 py-2 text-xs font-semibold transition cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-2xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Elimina</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
