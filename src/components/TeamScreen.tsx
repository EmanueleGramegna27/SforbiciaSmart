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
  Edit2, 
  Trash2, 
  AlertCircle, 
  Tag, 
  Check, 
  Briefcase,
  Star,
  UserCheck,
  FileSpreadsheet,
  Download,
  Upload,
  Loader2,
  Eye,
  EyeOff
} from "lucide-react";
import * as XLSX from "xlsx";
import { PLAN_LIMITS } from "../lib/plans";
import { COUNTRY_PREFIXES, splitPhoneNumber } from "./CustomersScreen";

const normalizeSalonName = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ""); // Remove spaces and punctuation for strict deduplication
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

  // Filter state
  const [filterSalonId, setFilterSalonId] = useState<string>("all");

  const allowedSalons = useMemo(() => {
    if (userRole === "owner") return salons;
    const allowedIds = userSalonIds || [];
    return salons.filter(s => allowedIds.includes(s.id));
  }, [salons, userRole, userSalonIds]);

  const filteredMembers = useMemo(() => {
    if (filterSalonId === "all") return members;
    return members.filter(m => m.salonIds && m.salonIds.includes(filterSalonId));
  }, [members, filterSalonId]);

  const filteredStats = useMemo(() => {
    const total = filteredMembers.length;
    // Count unique roles in the filtered list
    const uniqueRoles = new Set(filteredMembers.map(m => m.role)).size;
    // Count unique associations for the filtered list
    const associations = filterSalonId === "all"
      ? filteredMembers.reduce((sum, m) => sum + (m.salonIds ? m.salonIds.length : 0), 0)
      : filteredMembers.length;

    return { total, uniqueRoles, associations };
  }, [filteredMembers, filterSalonId]);

  useEffect(() => {
    if (filterSalonId !== "all" && !allowedSalons.some(s => s.id === filterSalonId)) {
      setFilterSalonId("all");
    }
  }, [allowedSalons, filterSalonId]);

  // Selection states for custom Excel exporting
  const [selectedMemberIds, setSelectedMemberIds] = useState<Record<string, boolean>>({});
  // Help Guide Box state
  const [showImportGuide, setShowImportGuide] = useState(true);
  // Delete confirmation overlay state
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // form fields
  const [name, setName] = useState("");
  const [role, setRole] = useState("Specialista Colore");
  const [phone, setPhone] = useState("");
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

  // Map salons for quick lookup
  const salonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    salons.forEach((s) => {
      if (s.id && s.name) map[s.id] = s.name;
    });
    return map;
  }, [salons]);

  // Fetch team members real-time
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
        
        // Deduplicate team members by email to prevent showing clones (e.g. self-healed UID doc)
        const uniqueMap = new Map<string, TeamMember>();
        fetched.forEach(m => {
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

  // Pre-populate mock team members if dry
  const handlePrepopulate = async () => {
    if (!user) return;
    try {
      const salonIds = salons.map(s => s.id);
      const defaultTeam = [
        { name: "Emanuele Gramegna", role: "Hair Stylist Senior", phone: "+39 328 123 4567", email: "emanuele@salonflow.it", salonIds: salonIds.slice(0, 2), ownerId: user.uid },
        { name: "Chiara Russo", role: "Specialista Colore", phone: "+39 333 987 6543", email: "chiara@salonflow.it", salonIds: salonIds.slice(0, 1), ownerId: user.uid },
        { name: "Marco Bianchi", role: "Taglio Uomo & Barba", phone: "+39 349 444 8888", email: "marco@salonflow.it", salonIds: salonIds, ownerId: user.uid }
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

  const openCreateModal = () => {
    setSelectedMember(null);
    setName("");
    setRole("Specialista Colore");
    setPhone("");
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
    setPhone(member.phone || "");
    const parsed = splitPhoneNumber(member.phone || "");
    setPhonePrefix(parsed.prefix);
    setPhoneBody(parsed.number);
    setEmail(member.email || "");
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

    // Validation for Receptionist
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

    // If we are in create mode, and both email and password are provided, register the user
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
          console.warn("Could not initialize temporary Firestore with settings, falling back:", dbErr);
          tempDb = getFirestore(tempApp);
        }
        
        const userCredential = await createUserWithEmailAndPassword(
          tempAuth,
          emailClean,
          password.trim()
        );
        newUid = userCredential.user.uid;
        
        // Write /users/{newUid} document using the secondary app's firestore context
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
        
        console.log("Successfully auto-registered Auth user & user doc:", newUid);
      } catch (regErr: any) {
        console.error("Error auto-registering user in Auth:", regErr);
        setErrorMsg(`Errore registrazione utente: ${regErr.message || String(regErr)}`);
        setSaving(false);
        try {
          await deleteApp(tempApp);
        } catch (delErr) {}
        return;
      }
      
      try {
        await deleteApp(tempApp);
      } catch (delErr) {}
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
        // Edit
        if (emailClean && selectedMember.id !== emailClean) {
          // If the old document ID is not the lowercase email, we delete the old doc and save with the email as the ID
          const p1 = deleteDoc(doc(db, "team", selectedMember.id));
          const p2 = setDoc(doc(db, "team", emailClean), payload);
          savePromise = Promise.all([p1, p2]);
        } else {
          const docRef = doc(db, "team", selectedMember.id);
          savePromise = updateDoc(docRef, payload);
        }
      } else {
        // Create
        if (role === "Receptionist" && !emailClean) {
          setErrorMsg("L'indirizzo Email è obbligatorio per il ruolo Receptionist");
          setSaving(false);
          return;
        }

        if (emailClean) {
          // Save document with the email (lowercase) as the ID to allow deterministic lookups in rules
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
          // Standard member without email can just be a random ID
          savePromise = addDoc(collection(db, "team"), payload);
        }
      }

      // Se siamo offline, o se la rete impiega più di 800ms,
      // chiudiamo il modal e lasciamo che la cache locale di Firestore aggiorni la UI.
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

  const handleDeselectAll = () => {
    setSelectedMemberIds({});
  };

  const handleDeleteMember = (member: TeamMember) => {
    setDeleteError("");
    setDeleteTarget(member);
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

  // EXCEL EXPORT
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
        { wch: 25 }, // Nome
        { wch: 25 }, // Ruolo
        { wch: 20 }, // Telefono
        { wch: 30 }, // Email
        { wch: 35 }  // Sedi Associate
      ];

      const suffix = activeSelection.length > 0 ? `Selezionati_${activeSelection.length}` : "Tutti";
      XLSX.writeFile(wb, `SforbiciaSmart_Team_${suffix}_${new Date().toISOString().slice(0,10)}.xlsx`);

      // Log the export in reports_history to increment count
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
        },
        {
          "Nome": "Marco Bianchi",
          "Ruolo": "Taglio Uomo & Barba",
          "Telefono": "+39 349 444 8888",
          "Email": "marco@salonflow.it",
          "Sedi Associate": "Sede Catania"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Modello Team");
      
      ws["!cols"] = [
        { wch: 25 }, // Nome
        { wch: 25 }, // Ruolo
        { wch: 20 }, // Telefono
        { wch: 30 }, // Email
        { wch: 35 }  // Sedi Associate
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
          
          // Sedi associate list (can be comma-separated list of salon names)
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
                  // Auto-create salon
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
                    console.error(`Error auto-creating salon "${sName}" for team row #${i + 1}:`, salonErr);
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
                  skippedSalonNames.add(sName);
                }
              }

              if (foundSalon && foundSalon.id) {
                salonIdsToAssign.push(foundSalon.id);
              }
            }
          }

          // If no salon found or associated, default to first available salon
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
            console.error(`Error creating team member "${newMemberPayload.name}" for row #${i + 1}:`, memberErr);
            handleFirestoreError(memberErr, OperationType.CREATE, "team");
          }
        }

        let alertMessage = `Importazione completata! ${importCount} collaboratori aggiunti con successo.`;
        if (skippedSalonNames.size > 0) {
          const namesStr = Array.from(skippedSalonNames).join(", ");
          alertMessage += `\n\nAttenzione: le seguenti sedi non sono state create perché è stato superato il limite massimo del tuo piano (${PLAN_LIMITS[planKey]?.name || planKey}): ${namesStr}.\nI relativi collaboratori sono stati associati alla tua prima sede disponibile.`;
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

  const selectedCount = useMemo(() => {
    return Object.values(selectedMemberIds).filter(Boolean).length;
  }, [selectedMemberIds]);

  return (
    <div className="space-y-6 animate-pageFade" id="team-screen">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Organico Aziendale
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#1a2035] md:text-3xl">
            Gestione Collaboratori e Team
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Gestisci l'organico dei tuoi saloni, assegna ruoli professionali e imposta le sedi operative.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Dynamic Monthly Report Limit Indicator */}
          {!loadingReportCount && (
            <div className={`px-3 py-2 rounded-xl border flex items-center gap-2.5 shadow-sm font-medium transition-all ${
              businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-indigo-50/50 border-indigo-100/60 text-[#1a3a8f]"
            }`}>
              <FileSpreadsheet className={`w-4 h-4 shrink-0 ${businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3 ? "text-rose-500 animate-pulse" : "text-indigo-500"}`} />
              <div className="text-left leading-tight">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Report Mensili</span>
                <span className="text-[11px] font-semibold">
                  {businessSettings?.userPlan === "solo_pro" ? (
                    <span>
                      {monthlyReportCount} / 3 <span className="text-[9px] font-normal text-gray-500">({Math.max(0, 3 - monthlyReportCount)} rimasti)</span>
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
            disabled={members.length === 0}
            className="flex-1 sm:flex-none border border-gray-200 bg-[#eef2ff] hover:bg-[#eef2ff]/80 text-[#1a3a8f] border-[#1a3a8f]/20 rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            title={selectedCount > 0 ? `Esporta ${selectedCount} collaboratori selezionati in .XLSX` : "Esporta tutto il team in .XLSX"}
          >
            <Download className="w-4 h-4" />
            {selectedCount > 0 ? `Esporta Selezionati (${selectedCount})` : "Esporta Tutti"}
          </button>
          
          {userRole === "owner" && (
            <>
              {/* Import element */}
              <label className="flex-1 sm:flex-none border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all text-center">
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
                className="flex-1 sm:flex-none bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-5 py-2.5 text-xs font-semibold shadow-md shadow-blue-900/10 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nuovo Collaboratore
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alert if Monthly Report Limit is Reached */}
      {!loadingReportCount && businessSettings?.userPlan === "solo_pro" && monthlyReportCount >= 3 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Limite Report Mensili Raggiunto</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              Hai raggiunto il limite massimo di <strong>3 esportazioni Excel</strong> per questo mese consentite dal tuo piano <strong>Solo Pro</strong>. 
              Per poter generare ed esportare nuovi report dei collaboratori, effettua l'upgrade al piano <strong>Network</strong> o <strong>Elite AI</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Help block explaining team Excel import structure */}
      {showImportGuide && (
        <div className="bg-gradient-to-r from-slate-50 to-indigo-50/30 border border-slate-200/80 rounded-2xl p-5 shadow-sm relative animate-fadeIn overflow-hidden">
          <button 
            onClick={() => setShowImportGuide(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-slate-100/80 transition-all cursor-pointer"
            title="Nascondi Guida"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-4xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#1a3a8f]/10 text-[#1a3a8f] flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="font-serif text-sm font-bold text-[#1a2035]">
                  Guida alla compilazione del file per l'importazione collaboratori
                </h3>
              </div>
              
              <p className="text-gray-400 text-xs leading-relaxed">
                Per caricare massivamente i tuoi collaboratori, puoi preparare un foglio Excel o CSV. Se inserisci delle <span className="font-semibold text-[#1a3a8f]">Sedi Associate non ancora esistenti</span> sul portale, verranno <span className="underline font-semibold text-[#1a3a8f]">generate automaticamente all'istante</span>! Puoi assegnare un collaboratore a più sedi separandone i nomi con una virgola.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <span className="block text-xs font-bold text-gray-800 mb-0.5">Nome</span>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    <span className="text-red-500 font-bold">* Richiesto</span>. Nome completo (es: <span className="italic whitespace-nowrap">Chiara Russo</span>).
                  </p>
                </div>

                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <span className="block text-xs font-bold text-gray-800 mb-0.5">Ruolo</span>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    Specializzazione del collaboratore (es: <span className="italic whitespace-nowrap">Specialista Colore</span>).
                  </p>
                </div>
                
                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <span className="block text-xs font-bold text-gray-800 mb-0.5">Contatti</span>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    Telefono ed Email del membro dello staff per ricevere prenotazioni.
                  </p>
                </div>

                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <span className="block text-xs text-[#1a3a8f] font-bold mb-0.5 flex items-center justify-between">
                    <span>Sedi (Multi-sede)</span>
                  </span>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    Associa a più sedi separandole con virgole (es: <span className="italic whitespace-nowrap">Sede Centrale, Sede Catania</span>).
                  </p>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex flex-col gap-1.5 justify-center">
              <button
                onClick={handleDownloadTemplate}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-4 py-2.5 text-xs font-semibold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" />
                Scarica Modello Excel
              </button>
              <span className="text-[10px] text-gray-400 font-medium text-center">
                Modello precompilato di esempio
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Salon Filter Selector */}
      {allowedSalons.length > 1 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center border border-indigo-100/50">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-xs font-bold text-gray-800 uppercase tracking-wider">Filtra per Sede</span>
              <span className="text-[10px] text-gray-400">Seleziona una sede per visualizzare e gestire i collaboratori assegnati</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterSalonId("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                filterSalonId === "all"
                  ? "bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-sm"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white"
              }`}
            >
              Tutte le sedi ({members.length})
            </button>
            {allowedSalons.map((salon) => {
              const salonCount = members.filter(m => m.salonIds && m.salonIds.includes(salon.id)).length;
              return (
                <button
                  key={salon.id}
                  onClick={() => setFilterSalonId(salon.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    filterSalonId === salon.id
                      ? "bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-sm"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white"
                  }`}
                >
                  {salon.name} ({salonCount})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bulk Selection control bar for Exporting */}
      {filteredMembers.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-gray-700">
            <div className="bg-[#1a3a8f] text-white px-2.5 py-1 rounded-lg text-[11px] font-bold">
              {selectedCount} su {filteredMembers.length} selezionati
            </div>
            <span className="text-gray-300">|</span>
            <span className="text-gray-400 font-medium text-[11px]">
              {selectedCount > 0 
                ? "L'esportazione includerà solo i collaboratori spuntati" 
                : "Spunta i collaboratori desiderati sulle schede, oppure esporta l'intera lista"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] bg-white hover:bg-gray-100 border border-gray-200 text-[#1a2035] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm select-none"
            >
              {selectedCount === filteredMembers.length ? "Deseleziona Tutti" : "Seleziona Tutti"}
            </button>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-[11px] bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                Azzera Selezione
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-[#1a3a8f] shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
              {filterSalonId === "all" ? "Collaboratori Totali" : "Collaboratori Sede"}
            </span>
            <span className="text-2xl font-bold text-gray-900">{filteredStats.total}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-[#1a3a8f] shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
              {filterSalonId === "all" ? "Sedi Operative Associate" : "Presenze Salone"}
            </span>
            <span className="text-2xl font-bold text-gray-900 font-mono">
              {filteredStats.associations}
            </span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Star className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Specializzazioni</span>
            <span className="text-2xl font-bold text-gray-900">
              {filteredStats.uniqueRoles}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 rounded-full border-4 border-slate-100 border-t-[#1a3a8f] animate-spin" />
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Caricamento in corso...</span>
        </div>
      ) : members.length === 0 ? (
        <div className="py-14 border border-dashed border-gray-150 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-slate-50/40">
          <Users className="w-10 h-10 text-gray-300 mb-3" />
          <h4 className="font-serif text-sm font-bold text-gray-700">Nessun collaboratore registrato</h4>
          <p className="text-xs text-gray-400 max-w-sm mt-1">
            Gestisci la forza lavoro della tua azienda. Puoi inserire i recapiti dei parrucchieri e dei receptionist o pre-popolare con dati di esempio.
          </p>
          <div className="flex gap-4 mt-5">
            <button
              onClick={openCreateModal}
              className="bg-[#1a3a8f] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-[#152f73]"
            >
              Nuovo Membro Team
            </button>
            <button
              onClick={handlePrepopulate}
              className="bg-indigo-50 text-[#1a3a8f] border border-indigo-100 text-xs font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-indigo-100 flex items-center gap-1.5"
            >
              Pre-popola Esempio
            </button>
          </div>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="py-14 border border-dashed border-gray-150 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-slate-50/40">
          <Users className="w-10 h-10 text-gray-300 mb-3" />
          <h4 className="font-serif text-sm font-bold text-gray-700">Nessun collaboratore in questa sede</h4>
          <p className="text-xs text-gray-400 max-w-sm mt-1">
            Non ci sono collaboratori associati alla sede selezionata. Puoi modificare un collaboratore esistente per associarlo oppure inserirne uno nuovo.
          </p>
          <div className="flex gap-4 mt-5">
            <button
              onClick={openCreateModal}
              className="bg-[#1a3a8f] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-[#152f73] cursor-pointer"
            >
              Aggiungi Collaboratore qui
            </button>
            <button
              onClick={() => setFilterSalonId("all")}
              className="bg-indigo-50 text-[#1a3a8f] border border-indigo-100 text-xs font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-indigo-100 cursor-pointer"
            >
              Mostra Tutte le Sedi
            </button>
          </div>
        </div>
      ) : (
        /* Team Members Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMembers.map((member) => {
            const isSelected = !!selectedMemberIds[member.id];
            return (
              <div 
                key={member.id} 
                className={`bg-white border rounded-3xl p-6 shadow-sm hover:shadow-md transition-all relative flex flex-col justify-between ${
                  isSelected ? "border-[#1a3a8f] ring-2 ring-[#1a3a8f]/15" : "border-gray-100"
                }`}
              >
                {/* Selection Checkbox in corner */}
                <div 
                  onClick={() => toggleSelectMember(member.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full border bg-white flex items-center justify-center shadow-md cursor-pointer hover:scale-105 transition-all z-10"
                  title="Seleziona per esportazione"
                >
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${isSelected ? "bg-[#1a3a8f] text-white" : "bg-transparent border border-gray-305"}`}>
                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[4]" />}
                  </div>
                </div>

                {/* Badge for Role */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div 
                      className="w-12 h-12 rounded-full bg-gradient-to-tr from-slate-100 to-indigo-50/10 flex items-center justify-center text-[#1a3a8f] font-serif font-extrabold text-base border border-slate-100 shadow-sm select-none shrink-0 cursor-pointer"
                      onClick={() => toggleSelectMember(member.id)}
                    >
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                    
                    <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#eef2ff] border border-indigo-100/60 text-[#1a3a8f] max-w-[150px] truncate">
                      {member.role}
                    </span>
                  </div>

                {/* Name */}
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#1a2035]">{member.name}</h3>
                </div>

                {/* Details layout */}
                <div className="space-y-2.5 text-xs text-gray-500 pt-2 border-t border-gray-50">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>{member.phone || "Nessun recapito"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{member.email || "Nessuna email"}</span>
                  </div>
                  
                  {/* Salons List */}
                  <div className="flex items-start gap-2 pt-1">
                    <Store className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {member.salonIds && member.salonIds.length > 0 ? (
                        member.salonIds.map((sid) => (
                          <span 
                            key={sid} 
                            className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-gray-700 text-[9px] font-semibold border border-slate-200 truncate"
                          >
                            {salonsMap[sid] || "Sede Sconosciuta"}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] italic text-gray-400">Nessuna sede assegnata</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-5 mt-5 border-t border-gray-50 shrink-0">
                {userRole === "owner" ? (
                  <>
                    <button
                      onClick={() => openEditModal(member)}
                      className="p-1 px-3 rounded-lg border border-gray-200 text-gray-500 hover:text-[#1a3a8f] hover:bg-[#eef2ff] text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      Modifica
                    </button>
                    <button
                      onClick={() => handleDeleteMember(member)}
                      className="p-1 px-3 rounded-lg border border-gray-250 text-gray-400 hover:text-red-650 hover:bg-red-50 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Rimuovi
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100 uppercase tracking-wider">
                    Sola lettura
                  </span>
                )}
              </div>

            </div>
          ); })}
        </div>
      )}

      {/* Add/Edit Modal Overlay */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          
          <div className="relative bg-white border border-gray-100 w-full max-w-lg rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-serif text-xl font-bold text-[#1a2035]">
                {selectedMember ? "Modifica Collaboratore" : "Inserisci Collaboratore"}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error notifications */}
            {errorMsg && (
              <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveMember} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  Cognome e Nome *
                </label>
                <input
                  type="text"
                  required
                  placeholder="E.g., Emanuele Rossi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  Ruolo / Specializzazione
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all cursor-pointer"
                >
                  {rolesList.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                    Recapito Telefonico
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={phonePrefix}
                      onChange={(e) => setPhonePrefix(e.target.value)}
                      className="bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] text-sm px-3 py-2.5 rounded-xl outline-none transition-all font-medium shrink-0"
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
                      placeholder="Es: 3334455666"
                      value={phoneBody}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, "");
                        setPhoneBody(cleaned);
                      }}
                      className="flex-1 min-w-0 bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                    Indirizzo Email
                  </label>
                  <input
                    type="email"
                    autoComplete="new-email"
                    placeholder="E.g., email@salonflow.it"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all"
                  />
                </div>
              </div>

              {!selectedMember && role === "Receptionist" && (
                <div className="bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100/50 space-y-2 animate-fadeIn">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#1a3a8f] mb-1">
                    Password di Accesso (Opzionale)
                  </label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? "text" : "password"}
                      autoComplete="new-password"
                      name="new-receptionist-password"
                      placeholder="E.g., Minimo 6 caratteri"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white border border-gray-200 focus:border-[#1a3a8f] text-sm px-4 py-2.5 pr-11 rounded-xl outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-450 hover:text-[#1a3a8f] cursor-pointer"
                    >
                      {showFormPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium leading-normal">
                    Se inserita, l'account di accesso verrà generato all'istante con questa email e password, consentendo al receptionist di effettuare l'accesso direttamente sul portale senza ulteriori registrazioni.
                  </p>
                </div>
              )}

              {/* Salons Selection Area */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  Sedi operative di appartenenza *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-4 rounded-2xl border border-gray-150">
                  {salons.map((salon) => {
                    const isSelected = selectedSalonIds.includes(salon.id);
                    return (
                      <button
                        key={salon.id}
                        type="button"
                        onClick={() => toggleSalonSelection(salon.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-white border-[#1a3a8f] text-[#1a3a8f] shadow-sm"
                            : "bg-white/40 border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        <span className="truncate">{salon.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#1a3a8f] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 mt-6 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl px-5 py-2.5 text-xs font-semibold transition-all cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:bg-indigo-300 text-white rounded-xl px-6 py-2.5 text-xs font-semibold shadow-md shadow-indigo-900/10 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {selectedMember ? "Salva Modifiche" : "Crea Collaboratore"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          
          <div className="relative bg-white border border-gray-100 w-full max-w-md rounded-2xl shadow-xl z-10 overflow-hidden p-6 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                <AlertCircle className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-serif text-lg font-bold text-gray-900 leading-tight text-red-600">
                  Rimuovi Collaboratore
                </h3>
                
                <p className="text-xs text-gray-500 leading-relaxed font-sans mt-1">
                  Sei sicuro di voler rimuovere definitivamente <strong className="text-gray-800">"{deleteTarget.name}"</strong> dall'organico aziendale? Questa azione lo scollegherà da tutte le sedi operative. L'operazione non potrà essere annullata.
                </p>

                {deleteError && (
                  <p className="text-xs font-semibold text-red-600 mt-2 bg-red-50 p-2 rounded-lg border border-red-100">
                    {deleteError}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-xs font-bold shadow-md shadow-red-900/10 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Rimozione...
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
