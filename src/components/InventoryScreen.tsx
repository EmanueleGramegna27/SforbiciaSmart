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
import { 
  Package, 
  Search, 
  Plus, 
  Minus, 
  Edit2, 
  Trash2, 
  AlertTriangle, 
  X, 
  AlertCircle,
  DollarSign,
  Sparkles,
  Store,
  RefreshCw,
  Info,
  Percent,
  Download,
  Upload,
  FileSpreadsheet,
  Check,
  ChevronDown,
  ChevronUp,
  Tag,
  Boxes,
  TrendingUp,
  ShieldAlert
} from "lucide-react";
import * as XLSX from "xlsx";
import { Salon } from "../types";
import { PLAN_LIMITS } from "../lib/plans";

const normalizeSalonName = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
};

export interface InventoryItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  quantity: number; // Sum of all stocks
  minQuantity: number;
  price: number;
  ownerId: string;
  salonStocks?: { [salonId: string]: number };
  commissionPercentage?: number;
}

export default function InventoryScreen() {
  const { user, salons, ownerId, userRole, userSalonIds, businessSettings } = useBusiness();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Filter by Salon
  const [selectedSalonId, setSelectedSalonId] = useState<string>("all");

  // Guide accordion toggle
  const [showGuide, setShowGuide] = useState(false);

  // Selection states for custom Excel exporting
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});

  // Product Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  
  // Refill (Carica Scorte) Modal
  const [refillModalOpen, setRefillModalOpen] = useState(false);
  const [refillProduct, setRefillProduct] = useState<InventoryItem | null>(null);
  const [refillSalonId, setRefillSalonId] = useState("");
  const [refillAmount, setRefillAmount] = useState("5");
  const [refillType, setRefillType] = useState<"add" | "remove">("add");
  const [refillSaving, setRefillSaving] = useState(false);
  const [refillError, setRefillError] = useState("");

  // Product Form Fields
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("Shampoo");
  const [minQuantity, setMinQuantity] = useState("3");
  const [price, setPrice] = useState("15");
  const [commissionPercentage, setCommissionPercentage] = useState("0");
  const [formSalonStocks, setFormSalonStocks] = useState<{ [salonId: string]: string }>({});
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Delete inline confirmation
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const categoriesList = ["Shampoo", "Balsamo", "Tinta/Colore", "Trattamenti", "Attrezzatura", "Altro"];

  // Salons map
  const salonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    salons.forEach((s) => {
      if (s.id && s.name) map[s.id] = s.name;
    });
    return map;
  }, [salons]);

  // Filter salons allowed for the current logged-in user
  const allowedSalons = useMemo(() => {
    if (userRole === "receptionist") {
      const allowedIds = userSalonIds || [];
      return salons.filter(s => allowedIds.includes(s.id));
    }
    return salons;
  }, [salons, userRole, userSalonIds]);

  // Set default salon filter if receptionist can only access specific salons
  useEffect(() => {
    if (userRole === "receptionist" && allowedSalons.length > 0 && selectedSalonId === "all") {
      setSelectedSalonId(allowedSalons[0].id);
    }
  }, [allowedSalons, userRole, selectedSalonId]);

  // Fetch inventory in real-time
  useEffect(() => {
    if (!user || !ownerId) return;

    setLoading(true);
    const q = query(collection(db, "inventory"), where("ownerId", "==", ownerId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as InventoryItem[];
        
        setItems(fetched.sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching inventory:", error);
        handleFirestoreError(error, OperationType.LIST, "inventory");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, ownerId]);

  // Retrieve stock quantity for a salon, fall back gracefully
  const getStockForSalon = (item: InventoryItem, salonId: string, salonsList: Salon[]): number => {
    if (item.salonStocks && item.salonStocks[salonId] !== undefined) {
      return item.salonStocks[salonId];
    }
    if (!item.salonStocks || Object.keys(item.salonStocks).length === 0) {
      if (salonsList.length > 0 && salonsList[0].id === salonId) {
        return item.quantity || 0;
      }
    }
    return 0;
  };

  // Pre-populate mock products if the list is completely empty
  const handlePrepopulate = async () => {
    if (!user || !ownerId) return;
    try {
      const sampleItems = [
        { name: "Shampoo Keratina Professionale", brand: "L'Oréal", category: "Shampoo", minQuantity: 5, price: 18.5, commissionPercentage: 10 },
        { name: "Balsamo Protettivo Colore", brand: "Wella", category: "Balsamo", minQuantity: 3, price: 14.0, commissionPercentage: 8 },
        { name: "Gel Forte Modellante", brand: "Kérastase", category: "Altro", minQuantity: 2, price: 21.0, commissionPercentage: 12 },
        { name: "Tinta Castano Naturale 5.0", brand: "L'Oréal", category: "Tinta/Colore", minQuantity: 4, price: 9.5, commissionPercentage: 5 },
        { name: "Maschera Riparatrice Profonda", brand: "Moroccanoil", category: "Trattamenti", minQuantity: 3, price: 32.0, commissionPercentage: 15 },
        { name: "Forbici Ergonometriche Taglio", brand: "Yasaka", category: "Attrezzatura", minQuantity: 1, price: 150.0, commissionPercentage: 0 }
      ];

      const batch = writeBatch(db);
      sampleItems.forEach((baseItem) => {
        const docRef = doc(collection(db, "inventory"));
        
        const sampleStocks: { [salonId: string]: number } = {};
        let totalQty = 0;
        salons.forEach(s => {
          const sQty = Math.floor(Math.random() * 12) + 3;
          sampleStocks[s.id] = sQty;
          totalQty += sQty;
        });

        const itemPayload = {
          ...baseItem,
          salonStocks: sampleStocks,
          quantity: totalQty,
          ownerId: ownerId
        };
        
        batch.set(docRef, itemPayload);
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to pre-populate inventory:", err);
    }
  };

  // Quick quantity updates (inline increment/decrement)
  const handleQuickAdjust = async (item: InventoryItem, amount: number) => {
    if (selectedSalonId === "all") {
      openRefillModal(item, amount > 0 ? "add" : "remove");
    } else {
      try {
        const docRef = doc(db, "inventory", item.id);
        const currentStocks = item.salonStocks || {};
        const currentVal = getStockForSalon(item, selectedSalonId, salons);
        const nextVal = Math.max(0, currentVal + amount);
        
        const updatedStocks: { [salonId: string]: number } = {
          ...currentStocks,
          [selectedSalonId]: nextVal
        };

        const totalQty = Object.values(updatedStocks).reduce((a: number, b: number) => a + b, 0);

        await updateDoc(docRef, { 
          salonStocks: updatedStocks,
          quantity: totalQty
        });
      } catch (err: any) {
        console.error("Error adjusting inventory quantity:", err);
        handleFirestoreError(err, OperationType.UPDATE, `inventory/${item.id}`);
      }
    }
  };

  // Open creation modal
  const openCreateModal = () => {
    setSelectedItem(null);
    setName("");
    setBrand("");
    setCategory("Shampoo");
    setMinQuantity("3");
    setPrice("15");
    setCommissionPercentage("0");
    
    const initialStocks: { [salonId: string]: string } = {};
    allowedSalons.forEach(s => {
      initialStocks[s.id] = "0";
    });
    setFormSalonStocks(initialStocks);

    setErrorMsg("");
    setModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setName(item.name);
    setBrand(item.brand);
    setCategory(item.category);
    setMinQuantity(item.minQuantity.toString());
    setPrice(item.price.toString());
    setCommissionPercentage(item.commissionPercentage !== undefined ? item.commissionPercentage.toString() : "0");
    
    const initialStocks: { [salonId: string]: string } = {};
    allowedSalons.forEach(s => {
      const stockVal = getStockForSalon(item, s.id, salons);
      initialStocks[s.id] = stockVal.toString();
    });
    setFormSalonStocks(initialStocks);

    setErrorMsg("");
    setModalOpen(true);
  };

  // Open refill/load modal
  const openRefillModal = (item: InventoryItem | null = null, type: "add" | "remove" = "add") => {
    setRefillProduct(item);
    setRefillType(type);
    setRefillAmount("5");
    setRefillError("");

    if (selectedSalonId !== "all") {
      setRefillSalonId(selectedSalonId);
    } else if (allowedSalons.length > 0) {
      setRefillSalonId(allowedSalons[0].id);
    } else {
      setRefillSalonId("");
    }

    setRefillModalOpen(true);
  };

  // Save Inventory item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !ownerId) return;
    if (!name.trim()) {
      setErrorMsg("Il nome del prodotto è obbligatorio");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const parsedSalonStocks: { [salonId: string]: number } = {};
    let totalQty = 0;
    
    allowedSalons.forEach(s => {
      const val = Math.max(0, parseInt(formSalonStocks[s.id] || "0") || 0);
      parsedSalonStocks[s.id] = val;
      totalQty += val;
    });

    const commPercentageNum = Math.max(0, Math.min(100, parseFloat(commissionPercentage) || 0));

    const payload = {
      name: name.trim(),
      brand: brand.trim() || "Nessun brand",
      category,
      minQuantity: Math.max(0, parseInt(minQuantity) || 0),
      price: Math.max(0, parseFloat(price) || 0),
      commissionPercentage: commPercentageNum,
      salonStocks: parsedSalonStocks,
      quantity: totalQty,
      ownerId: ownerId
    };

    try {
      const savePromise = selectedItem
        ? updateDoc(doc(db, "inventory", selectedItem.id), payload)
        : addDoc(collection(db, "inventory"), payload);

      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);
      setModalOpen(false);
    } catch (err: any) {
      console.error("Error saving inventory item:", err);
      setErrorMsg("Impossibile salvare il prodotto. Riprova.");
      handleFirestoreError(err, selectedItem ? OperationType.UPDATE : OperationType.CREATE, "inventory");
    } finally {
      setSaving(false);
    }
  };

  // Refill / Load / Unload stock transaction
  const handleRefillStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refillProduct) return;

    const amount = parseInt(refillAmount);
    if (isNaN(amount) || amount <= 0) {
      setRefillError("La quantità deve essere maggiore di zero");
      return;
    }

    if (!refillSalonId) {
      setRefillError("Seleziona una sede");
      return;
    }

    setRefillSaving(true);
    setRefillError("");

    try {
      const docRef = doc(db, "inventory", refillProduct.id);
      const currentStocks = refillProduct.salonStocks || {};
      const currentVal = getStockForSalon(refillProduct, refillSalonId, salons);

      let newVal = currentVal;
      if (refillType === "add") {
        newVal = currentVal + amount;
      } else {
        newVal = Math.max(0, currentVal - amount);
      }

      const updatedStocks: { [salonId: string]: number } = {
        ...currentStocks,
        [refillSalonId]: newVal
      };

      const totalQty = Object.values(updatedStocks).reduce((a: number, b: number) => a + b, 0);

      const savePromise = updateDoc(docRef, {
        salonStocks: updatedStocks,
        quantity: totalQty
      });

      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);

      setRefillModalOpen(false);
    } catch (err: any) {
      console.error("Error updating stock refill:", err);
      setRefillError("Errore nel salvataggio. Riprova.");
    } finally {
      setRefillSaving(false);
    }
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    try {
      await deleteDoc(doc(db, "inventory", item.id));
      setDeletingItemId(null);
    } catch (err: any) {
      console.error("Error deleting inventory item:", err);
      handleFirestoreError(err, OperationType.DELETE, `inventory/${item.id}`);
    }
  };

  // EXCEL EXPORT
  const handleExportXLSX = () => {
    if (items.length === 0) return;

    const activeSelection = items.filter(i => selectedItemIds[i.id]);
    const targets = activeSelection.length > 0 ? activeSelection : items;

    const rows = targets.map((item) => {
      const rowData: Record<string, any> = {
        "Nome Prodotto": item.name,
        "Brand": item.brand,
        "Categoria": item.category,
        "Prezzo (€)": item.price.toFixed(2),
        "Soglia Minima Allerta": item.minQuantity,
        "Provvigione (%)": item.commissionPercentage !== undefined ? `${item.commissionPercentage}%` : "0%",
        "Totale Scorte Aziendali": item.salonStocks 
          ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0) 
          : item.quantity || 0
      };

      // Breakdown per salon
      allowedSalons.forEach(s => {
        const qty = getStockForSalon(item, s.id, salons);
        rowData[`Scorta: ${s.name}`] = qty;
      });

      return rowData;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Magazzino");

    const suffix = activeSelection.length > 0 ? `Selezionati_${activeSelection.length}` : "Completo";
    XLSX.writeFile(wb, `Inventario_${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // EXCEL DOWNLOAD TEMPLATE
  const handleDownloadTemplate = () => {
    try {
      const sampleRows = [
        {
          "Nome Prodotto": "Shampoo Keratina Professional",
          "Brand": "L'Oréal",
          "Categoria": "Shampoo",
          "Prezzo (€)": 18.50,
          "Soglia Minima": 3,
          "Provvigione (%)": 10,
          "Quantità Iniziale": 15,
          "Sede": salons[0]?.name || "Sede Principale"
        },
        {
          "Nome Prodotto": "Maschera Idratante Profonda",
          "Brand": "Moroccanoil",
          "Categoria": "Trattamenti",
          "Prezzo (€)": 32.00,
          "Soglia Minima": 2,
          "Provvigione (%)": 15,
          "Quantità Iniziale": 8,
          "Sede": salons[0]?.name || "Sede Principale"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Modello Inventario");
      XLSX.writeFile(wb, "Template_Importazione_Magazzino.xlsx");
    } catch (err) {
      console.error("Template error:", err);
      alert("Errore nella generazione del modello Excel.");
    }
  };

  // EXCEL IMPORT
  const handleImportXLSX = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !ownerId) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];

        const rawJson = XLSX.utils.sheet_to_json(ws);
        if (rawJson.length === 0) {
          alert("Il file Excel importato risulta vuoto.");
          return;
        }

        let importCount = 0;
        let activeSalons = [...salons];
        const planKey = businessSettings?.userPlan || "network";
        const limit = PLAN_LIMITS[planKey]?.maxSalons || 6;

        for (let i = 0; i < rawJson.length; i++) {
          const row = rawJson[i] as any;
          const nameClean = row["Nome Prodotto"] || row["Nome"] || row["name"] || row["Prodotto"];
          if (!nameClean || !String(nameClean).trim()) continue;

          const brandClean = row["Brand"] || row["Marca"] || row["brand"] || "Nessun brand";
          const categoryClean = row["Categoria"] || row["category"] || "Shampoo";
          const priceClean = parseFloat(String(row["Prezzo (€)"] || row["Prezzo"] || row["price"] || "15").replace(",", ".")) || 15;
          const minQtyClean = parseInt(String(row["Soglia Minima"] || row["Soglia"] || row["minQuantity"] || "3")) || 3;
          const commClean = parseFloat(String(row["Provvigione (%)"] || row["Provvigione"] || row["commissionPercentage"] || "0").replace("%", "").replace(",", ".")) || 0;
          const initialQty = parseInt(String(row["Quantità Iniziale"] || row["Quantità"] || row["Scorta"] || row["quantity"] || "5")) || 5;

          // Sede mapping
          const rawSede = row["Sede"] || row["Sede Associata"] || row["Salone"] || "";
          const salonStocksMap: { [salonId: string]: number } = {};

          if (rawSede && String(rawSede).trim()) {
            const sName = String(rawSede).trim();
            const normalizedInput = normalizeSalonName(sName);
            let foundSalon = activeSalons.find(s => normalizeSalonName(s.name || "") === normalizedInput);

            if (!foundSalon && normalizedInput.length >= 3) {
              foundSalon = activeSalons.find(s => {
                const normName = normalizeSalonName(s.name || "");
                return normName.includes(normalizedInput) || normalizedInput.includes(normName);
              });
            }

            if (!foundSalon && activeSalons.length < limit) {
              const newSalonPayload = {
                name: sName.slice(0, 128),
                address: "",
                phone: "",
                hours: "Lunedì, Martedì, Mercoledì, Giovedì, Venerdì, Sabato: 09:00 - 19:00",
                ownerId: ownerId,
                createdAt: new Date(),
                updatedAt: new Date()
              };
              try {
                const docRef = await addDoc(collection(db, "salons"), newSalonPayload);
                const newlyCreated = { id: docRef.id, ...newSalonPayload };
                activeSalons.push(newlyCreated);
                foundSalon = newlyCreated;
              } catch (sErr) {
                console.error("Error creating salon from inventory import:", sErr);
              }
            }

            if (foundSalon && foundSalon.id) {
              salonStocksMap[foundSalon.id] = initialQty;
            }
          }

          // Fallback to first salon if none assigned
          if (Object.keys(salonStocksMap).length === 0 && activeSalons[0]?.id) {
            salonStocksMap[activeSalons[0].id] = initialQty;
          }

          const totalQty = Object.values(salonStocksMap).reduce((a, b) => a + b, 0);

          const payload = {
            name: String(nameClean).trim().slice(0, 128),
            brand: String(brandClean).trim().slice(0, 128),
            category: String(categoryClean).trim(),
            minQuantity: Math.max(0, minQtyClean),
            price: Math.max(0, priceClean),
            commissionPercentage: Math.max(0, Math.min(100, commClean)),
            salonStocks: salonStocksMap,
            quantity: totalQty,
            ownerId: ownerId
          };

          try {
            await addDoc(collection(db, "inventory"), payload);
            importCount++;
          } catch (itemErr) {
            console.error("Error adding imported inventory item:", itemErr);
          }
        }

        alert(`Importazione completata! ${importCount} prodotti inseriti con successo nel magazzino.`);
      } catch (err: any) {
        console.error("Error importing inventory XLSX:", err);
        alert(`Errore nell'importazione dei dati:\n${err.message || String(err)}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // Selection toggle
  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSelectAll = (currentFiltered: InventoryItem[]) => {
    const allSelected = currentFiltered.length > 0 && currentFiltered.every(i => selectedItemIds[i.id]);
    setSelectedItemIds(prev => {
      const next = { ...prev };
      currentFiltered.forEach(i => {
        next[i.id] = !allSelected;
      });
      return next;
    });
  };

  const selectedCount = useMemo(() => {
    return Object.values(selectedItemIds).filter(Boolean).length;
  }, [selectedItemIds]);

  // Helper to check if an item is low on stock based on current salon filter
  const isItemLowStock = (item: InventoryItem, salonId: string): { isLow: boolean; lowSalonNames: string[] } => {
    if (salonId !== "all") {
      const qty = getStockForSalon(item, salonId, salons);
      return {
        isLow: qty <= item.minQuantity,
        lowSalonNames: qty <= item.minQuantity ? [salons.find(s => s.id === salonId)?.name || "Sede"] : []
      };
    }

    // When viewing "all" salons: check if any allowed salon has stock <= minQuantity OR if total stock <= minQuantity
    const lowSalons: string[] = [];
    allowedSalons.forEach(s => {
      const qty = getStockForSalon(item, s.id, salons);
      if (qty <= item.minQuantity) {
        lowSalons.push(s.name);
      }
    });

    const totalQty = item.salonStocks && Object.keys(item.salonStocks).length > 0
      ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0)
      : item.quantity || 0;

    const isLow = lowSalons.length > 0 || totalQty <= item.minQuantity;

    return { isLow, lowSalonNames: lowSalons };
  };

  // Filter items matching the search query, category and low stock toggle
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;

      if (!matchesSearch || !matchesCategory) return false;

      if (onlyLowStock) {
        const { isLow } = isItemLowStock(item, selectedSalonId);
        return isLow;
      }
      
      return true;
    });
  }, [items, searchQuery, selectedCategory, onlyLowStock, selectedSalonId, salons, allowedSalons]);

  // Statistics calculation depending on the selected salon filter
  const stats = useMemo(() => {
    let totalProducts = items.length;
    let lowStock = 0;
    let totalValue = 0;
    let totalStockUnits = 0;

    items.forEach((item) => {
      let qty = 0;
      if (selectedSalonId === "all") {
        qty = item.salonStocks && Object.keys(item.salonStocks).length > 0
          ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0)
          : item.quantity || 0;
      } else {
        qty = getStockForSalon(item, selectedSalonId, salons);
      }

      totalStockUnits += qty;
      totalValue += item.price * qty;
      
      const { isLow } = isItemLowStock(item, selectedSalonId);
      if (isLow) {
        lowStock++;
      }
    });

    return { totalProducts, lowStock, totalValue, totalStockUnits };
  }, [items, selectedSalonId, salons, allowedSalons]);

  return (
    <div className="space-y-6 animate-pageFade max-w-7xl mx-auto pb-12" id="inventory-screen">
      
      {/* 1. Header con palette ufficiale (#1a2035 e #1a3a8f) in stile Apple */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 text-xs font-semibold tracking-wide shadow-2xs">
              <Package className="w-3.5 h-3.5 text-[#1a3a8f]" />
              <span>Logistica & Magazzino</span>
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#1a2035] tracking-tight">
            Inventario Prodotti
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Gestisci le scorte professionali, controlla le quantità per singola sede e monitora le vendite al dettaglio con relative provvigioni.
          </p>
        </div>

        {/* Action Controls Header in stile Apple */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Pulsante "Come Funziona" */}
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer border ${
              showGuide 
                ? "bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-xs" 
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
            }`}
            title="Istruzioni sul funzionamento del magazzino e importazione Excel"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Come Funziona</span>
          </button>

          {/* Export Excel */}
          <button
            type="button"
            onClick={handleExportXLSX}
            disabled={items.length === 0}
            className="px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-2xs disabled:opacity-40"
            title={selectedCount > 0 ? `Esporta ${selectedCount} prodotti selezionati` : "Esporta tutti i prodotti"}
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

              {/* Refill Quick Movement */}
              <button
                type="button"
                onClick={() => openRefillModal(null, "add")}
                className="px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100/70 shadow-2xs"
                title="Carica o scarica quantità velocemente da una sede"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-700" />
                <span>Carica / Scarica</span>
              </button>

              {/* Primary CTA - Nuovo Prodotto */}
              <button
                type="button"
                onClick={openCreateModal}
                className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-2xl px-5 py-2 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuovo Prodotto</span>
              </button>
            </>
          )}

        </div>
      </div>

      {/* 2. Guida Informativa Collapsible in stile Apple */}
      {showGuide && (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs animate-fadeIn space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#1a2035] tracking-tight flex items-center gap-2">
                <Package className="w-4 h-4 text-[#1a3a8f]" />
                Guida al Magazzino Multi-Sede e Importazione Excel
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                Il magazzino consente di gestire le scorte su più sedi in tempo reale, calcolare le provvigioni sulle vendite al banco e sincronizzare i prodotti da file Excel.
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="px-3.5 py-1.5 bg-[#eef2ff] hover:bg-[#e0e7ff] text-[#1a3a8f] text-xs font-semibold rounded-2xl transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shrink-0 border border-[#1a3a8f]/10 shadow-2xs"
              title="Scarica un file Excel di esempio precompilato"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Scarica Modello Excel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">1. Scorte per Sede</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Ogni prodotto ha quantitativi dedicati per ciascun salone, con somma aziendale automatica.</p>
            </div>
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">2. Allerta Sotto Scorta</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Imposta la soglia minima: il sistema evidenzia in arancione i prodotti da riordinare.</p>
            </div>
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">3. Provvigioni al Banco</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Definisci la % collaboratore: al momento del check-out la cassa accredita automaticamente l'incentivo.</p>
            </div>
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-1">
              <span className="text-xs font-bold text-[#1a2035] block">4. Carico & Scarico Rapido</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">Usa i tasti rapidi +/- in tabella oppure il modal <em>Carica / Scarica</em> per movimenti massivi.</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. KPI Bento Grid con Brand Gradient (#1a3a8f -> indigo-950) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Total Stock Value Card with Rich Blue Gradient */}
        <div className="bg-gradient-to-br from-[#1a3a8f] via-[#163380] to-[#0f2259] p-5 sm:p-6 rounded-3xl text-white shadow-sm shadow-[#1a3a8f]/20 relative overflow-hidden flex flex-col justify-between group transition-all duration-300 hover:shadow-md">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-15 transition-transform duration-500 group-hover:scale-110">
            <TrendingUp className="w-32 h-32 stroke-[1.2]" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold tracking-wider text-blue-200/90 block">
              Valore Merci in Magazzino
            </span>
            <h3 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">
              €{stats.totalValue.toFixed(2)}
            </h3>
          </div>
          <p className="text-xs text-blue-200/80 mt-4 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            {selectedSalonId === "all" ? "Valutazione cumulativa tutte le sedi" : `Valore merci: ${salons.find(s => s.id === selectedSalonId)?.name || "Sede"}`}
          </p>
        </div>

        {/* Monitored Products Card */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Articoli & Prodotti Unici
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-[#1a2035] tracking-tight mt-2">
              {stats.totalProducts} <span className="text-xs font-semibold text-slate-400">({stats.totalStockUnits} pz totali)</span>
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a3a8f] bg-[#eef2ff] px-3 py-1.5 rounded-2xl border border-[#1a3a8f]/10 w-max mt-4 shadow-2xs">
            <Package className="w-3.5 h-3.5" />
            <span>Catalogo Attivo</span>
          </div>
        </div>

        {/* Low Stock Alerts Card */}
        <div 
          onClick={() => setOnlyLowStock(!onlyLowStock)}
          className={`p-5 sm:p-6 rounded-3xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
            stats.lowStock > 0 
              ? 'bg-amber-50/50 border-amber-200/80 hover:bg-amber-50/80 shadow-2xs' 
              : 'bg-white border-slate-200/80 hover:shadow-xs shadow-2xs'
          }`}
          title="Clicca per filtrare solo i prodotti sotto scorta"
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Scorte in Esaurimento
            </span>
            <div className="flex items-center gap-2 mt-2">
              <h3 className={`text-2xl sm:text-3xl font-bold tracking-tight ${stats.lowStock > 0 ? 'text-amber-700' : 'text-[#1a2035]'}`}>
                {stats.lowStock}
              </h3>
              {stats.lowStock > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-300/80 shadow-2xs">
                  Attenzione
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mt-4">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className={`w-3.5 h-3.5 ${stats.lowStock > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              <span className="text-xs">{onlyLowStock ? "Filtro attivo (mostra tutti)" : "Filtra sotto scorta"}</span>
            </div>
            {onlyLowStock && (
              <span className="text-[10px] bg-amber-600 text-white font-bold px-2 py-0.5 rounded-full shadow-2xs">ON</span>
            )}
          </div>
        </div>

      </div>

      {/* 4. Barra Filtri Apple Style: Ricerca, Sede, Categorie e Pillole */}
      <div className="space-y-3 bg-white p-3 sm:p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
        
        {/* Riga superiore: Search + Sede Filter + Multi-Select Trigger */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Search bar */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cerca per nome prodotto, brand o categoria..."
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

          {/* Sede selector & Low stock toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-50/90 hover:bg-slate-100/80 border border-slate-200/80 px-3.5 py-2 rounded-2xl transition shadow-2xs">
              <Store className="w-3.5 h-3.5 text-[#1a3a8f]" />
              <select
                value={selectedSalonId}
                onChange={(e) => setSelectedSalonId(e.target.value)}
                className="bg-transparent outline-none text-xs font-semibold text-[#1a2035] cursor-pointer"
              >
                {userRole !== "receptionist" && (
                  <option value="all">Tutte le Sedi (Cumulativo)</option>
                )}
                {allowedSalons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Low Stock Toggle */}
            <button
              type="button"
              onClick={() => setOnlyLowStock(!onlyLowStock)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5 border shadow-2xs ${
                onlyLowStock
                  ? 'bg-amber-100/90 text-amber-900 border-amber-300'
                  : 'bg-slate-50/90 hover:bg-slate-100/80 text-slate-600 border-slate-200/80'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${onlyLowStock ? 'text-amber-700' : 'text-slate-400'}`} />
              <span>Sotto Scorta</span>
            </button>
          </div>

        </div>

        {/* Riga inferiore: Categorie Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Tag className="w-3 h-3 text-slate-400" /> Categoria:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
              selectedCategory === "all"
                ? "bg-[#1a3a8f] text-white shadow-2xs"
                : "bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100"
            }`}
          >
            Tutti
          </button>
          {categoriesList.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                selectedCategory === cat
                  ? "bg-[#1a3a8f] text-white shadow-2xs"
                  : "bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

      </div>

      {/* 5. Main Content: Table on Desktop / Cards on Mobile in Stile Apple */}
      <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-2xs">
        
        {/* Table Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            {filteredItems.length > 0 && (
              <input
                type="checkbox"
                checked={filteredItems.length > 0 && filteredItems.every(i => selectedItemIds[i.id])}
                onChange={() => handleSelectAll(filteredItems)}
                className="w-4 h-4 text-[#1a3a8f] rounded border-slate-300 focus:ring-[#1a3a8f] cursor-pointer"
                title="Seleziona tutti per esportazione"
              />
            )}
            <h3 className="font-bold text-[#1a2035] text-base tracking-tight flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#1a3a8f]" />
              Elenco Articoli in Magazzino
            </h3>
          </div>
          <span className="text-xs bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 font-semibold px-3 py-1 rounded-full shadow-2xs">
            {filteredItems.length} Prodotti {searchQuery || selectedCategory !== "all" || onlyLowStock ? "Filtrati" : "Registrati"}
          </span>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full border-4 border-[#eef2ff] border-t-[#1a3a8f] animate-spin" />
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Caricamento inventario...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-medium space-y-3">
            <div className="w-14 h-14 rounded-3xl bg-[#eef2ff] text-[#1a3a8f] flex items-center justify-center mx-auto border border-[#1a3a8f]/10 shadow-2xs">
              <Package className="w-7 h-7 stroke-[1.75]" />
            </div>
            <h4 className="text-base font-bold text-[#1a2035] tracking-tight">Nessun prodotto trovato</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {items.length === 0 
                ? "Il magazzino è attualmente vuoto. Inserisci il tuo primo articolo professionale o pre-popola il database con una selezione campione." 
                : "Nessun prodotto corrisponde ai criteri o filtri di ricerca applicati."}
            </p>
            {items.length === 0 && userRole === "owner" && (
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={openCreateModal}
                  className="bg-[#1a3a8f] text-white text-xs font-semibold px-5 py-2.5 rounded-2xl shadow-sm shadow-[#1a3a8f]/20 hover:bg-[#152f73] transition-all active:scale-[0.98] cursor-pointer"
                >
                  Crea Prodotto
                </button>
                <button
                  onClick={handlePrepopulate}
                  className="bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 text-xs font-semibold px-5 py-2.5 rounded-2xl shadow-2xs hover:bg-[#e0e7ff] flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Pre-popola Magazzino
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4 w-10 text-center">Sel</th>
                    <th className="py-3.5 px-4">Prodotto & Brand</th>
                    <th className="py-3.5 px-4">Categoria & Provv.</th>
                    <th className="py-3.5 px-4">Scorte per Sede</th>
                    <th className="py-3.5 px-4 text-right">Prezzo</th>
                    <th className="py-3.5 px-4 text-center">Quantità Rapida</th>
                    <th className="py-3.5 px-4 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredItems.map((item) => {
                    let currentQty = 0;
                    const { isLow, lowSalonNames } = isItemLowStock(item, selectedSalonId);

                    if (selectedSalonId === "all") {
                      currentQty = item.salonStocks && Object.keys(item.salonStocks).length > 0
                        ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0)
                        : item.quantity || 0;
                    } else {
                      currentQty = getStockForSalon(item, selectedSalonId, salons);
                    }

                    const isSelected = !!selectedItemIds[item.id];

                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors ${isSelected ? 'bg-[#eef2ff]/40' : 'hover:bg-slate-50/60'}`}
                      >
                        {/* Selection Checkbox */}
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            className="w-4 h-4 text-[#1a3a8f] rounded border-slate-300 focus:ring-[#1a3a8f] cursor-pointer"
                          />
                        </td>

                        {/* Product Name & Brand */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#1a2035] text-sm tracking-tight">{item.name}</div>
                          <div className="text-xs text-slate-400 font-medium">{item.brand}</div>
                        </td>

                        {/* Category & Commission */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 border border-slate-200/80 text-slate-600">
                              {item.category}
                            </span>
                            {item.commissionPercentage !== undefined && item.commissionPercentage > 0 && (
                              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#eef2ff] border border-[#1a3a8f]/10 text-[#1a3a8f] text-[10px] font-bold">
                                {item.commissionPercentage}% Provv.
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Scorte per Sede */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${isLow ? 'text-amber-700' : 'text-slate-900'}`}>
                                {currentQty} pz {selectedSalonId === "all" ? "(totali azienda)" : "(in sede)"}
                              </span>
                              {isLow && (
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300/80" title={lowSalonNames.length > 0 ? `Sotto scorta in: ${lowSalonNames.join(', ')}` : undefined}>
                                  Sotto Scorta {selectedSalonId === "all" && lowSalonNames.length > 0 ? `(${lowSalonNames.length} ${lowSalonNames.length === 1 ? 'sede' : 'sedi'})` : `(min: ${item.minQuantity})`}
                                </span>
                              )}
                            </div>

                            {/* Salon breakdown pills */}
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {allowedSalons.map(s => {
                                const stockVal = getStockForSalon(item, s.id, salons);
                                const isHighlighted = selectedSalonId === s.id;
                                return (
                                  <span 
                                    key={s.id} 
                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-all ${
                                      isHighlighted
                                        ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-2xs'
                                        : stockVal <= item.minQuantity
                                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                                          : 'bg-slate-50 text-slate-600 border-slate-200/70'
                                    }`}
                                    title={`${s.name}: ${stockVal} pz`}
                                  >
                                    {s.name}: {stockVal}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </td>

                        {/* Price */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-xs">
                          €{item.price.toFixed(2)}
                        </td>

                        {/* Quick Adjust +/- and Refill */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickAdjust(item, -1)}
                              className="w-7 h-7 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center justify-center text-slate-600 transition-all active:scale-95 cursor-pointer shadow-2xs"
                              title={selectedSalonId === "all" ? "Scarica quantità..." : "Diminuisci scorta sede (-1)"}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => handleQuickAdjust(item, 1)}
                              className="w-7 h-7 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 flex items-center justify-center text-slate-600 transition-all active:scale-95 cursor-pointer shadow-2xs"
                              title={selectedSalonId === "all" ? "Carica quantità..." : "Aumenta scorta sede (+1)"}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openRefillModal(item, "add")}
                              className="px-2.5 py-1 rounded-xl border border-[#1a3a8f]/15 bg-[#eef2ff] text-[#1a3a8f] text-[10px] font-bold uppercase tracking-wider hover:bg-[#e0e7ff] transition-all active:scale-[0.98] cursor-pointer ml-1 shadow-2xs"
                              title="Rifornisci o scarica quantità personalizzata"
                            >
                              Rifornisci
                            </button>
                          </div>
                        </td>

                        {/* Actions: Edit & Delete */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {userRole === "owner" ? (
                              deletingItemId === item.id ? (
                                <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-2xl text-xs animate-fadeIn">
                                  <span className="text-red-700 font-bold px-1 select-none text-[10px] uppercase">Eliminare?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-0.5 rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                    Sì
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingItemId(null)}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2 py-0.5 rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item)}
                                    className="p-1.5 px-3 rounded-xl border border-slate-200 text-slate-600 hover:text-[#1a3a8f] hover:bg-[#eef2ff] hover:border-[#1a3a8f]/20 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Modifica
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingItemId(item.id)}
                                    className="p-1.5 px-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 text-xs font-semibold flex items-center gap-1 transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200 uppercase tracking-wider">
                                Sola lettura
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="grid grid-cols-1 divide-y divide-slate-100 md:hidden">
              {filteredItems.map((item) => {
                let currentQty = 0;
                const { isLow, lowSalonNames } = isItemLowStock(item, selectedSalonId);

                if (selectedSalonId === "all") {
                  currentQty = item.salonStocks && Object.keys(item.salonStocks).length > 0
                    ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0)
                    : item.quantity || 0;
                } else {
                  currentQty = getStockForSalon(item, selectedSalonId, salons);
                }

                const isSelected = !!selectedItemIds[item.id];

                return (
                  <div key={item.id} className={`p-4 sm:p-5 space-y-3.5 ${isSelected ? 'bg-[#eef2ff]/30' : 'bg-white'}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.id)}
                          className="w-4 h-4 text-[#1a3a8f] rounded border-slate-300 focus:ring-[#1a3a8f] mt-0.5 cursor-pointer"
                        />
                        <div>
                          <div className="flex gap-1.5 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-600 uppercase tracking-wider block">
                              {item.category}
                            </span>
                            {item.commissionPercentage !== undefined && item.commissionPercentage > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full bg-[#eef2ff] border border-[#1a3a8f]/10 text-[#1a3a8f] text-[10px] font-bold">
                                {item.commissionPercentage}% Provv.
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-[#1a2035] text-sm tracking-tight">{item.name}</h4>
                          <span className="text-xs text-slate-400 font-medium">{item.brand}</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold font-mono text-slate-900">€{item.price.toFixed(2)}</span>
                    </div>

                    {/* Stock overview */}
                    <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                            {selectedSalonId === "all" ? "Scorta Totale Aziendale" : "Scorta nella Sede"}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-base font-bold ${isLow ? 'text-amber-700' : 'text-slate-900'}`}>
                              {currentQty} pz
                            </span>
                            {isLow && (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300/80">
                                Sotto Scorta {selectedSalonId === "all" && lowSalonNames.length > 0 ? `(${lowSalonNames.length} ${lowSalonNames.length === 1 ? 'sede' : 'sedi'})` : `(min: ${item.minQuantity})`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick increment/decrement */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(item, -1)}
                            className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 active:scale-95 shadow-2xs cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(item, 1)}
                            className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 active:scale-95 shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Salon breakdown */}
                      <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-200/60">
                        {allowedSalons.map(s => {
                          const stockVal = getStockForSalon(item, s.id, salons);
                          const isHighlighted = selectedSalonId === s.id;
                          return (
                            <div 
                              key={s.id} 
                              className={`flex justify-between items-center text-[10px] p-2 rounded-xl transition-all ${
                                isHighlighted 
                                  ? 'bg-[#1a3a8f] text-white font-bold shadow-2xs' 
                                  : 'text-slate-600 bg-white border border-slate-200/70'
                              }`}
                            >
                              <span className="truncate pr-1">{s.name}:</span>
                              <span className={isHighlighted ? 'text-white font-bold' : stockVal <= item.minQuantity ? 'text-amber-700 font-bold' : 'text-slate-800 font-bold'}>
                                {stockVal} pz
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex justify-between items-center pt-1">
                      <button
                        type="button"
                        onClick={() => openRefillModal(item, "add")}
                        className="text-xs font-semibold text-[#1a3a8f] bg-[#eef2ff] px-3.5 py-1.5 border border-[#1a3a8f]/10 rounded-2xl active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
                      >
                        Rifornisci Scorte
                      </button>

                      <div className="flex items-center gap-1.5">
                        {userRole === "owner" ? (
                          deletingItemId === item.id ? (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-2xl text-xs">
                              <span className="text-red-700 font-bold px-1 select-none text-[10px]">Elimina?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item)}
                                className="bg-red-600 text-white font-bold px-2 py-0.5 rounded-xl text-[10px] uppercase active:scale-95 cursor-pointer shadow-2xs"
                              >
                                Sì
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingItemId(null)}
                                className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-xl text-[10px] uppercase active:scale-95 cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
                              >
                                Modifica
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingItemId(item.id)}
                                className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-2xl border border-red-200 active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
                              >
                                Elimina
                              </button>
                            </>
                          )
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200 uppercase tracking-wider">
                            Sola lettura
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: Nuovo / Modifica Prodotto in stile Apple */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 md:pt-16 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-lg rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh] animate-fadeIn">
            
            {/* Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/80 backdrop-blur-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] block">
                  {selectedItem ? "Aggiornamento Articolo" : "Nuova Anagrafica"}
                </span>
                <h3 className="text-xl font-bold text-[#1a2035] tracking-tight">
                  {selectedItem ? "Modifica Prodotto" : "Aggiungi Nuovo Prodotto"}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 rounded-2xl transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error messaging */}
            {errorMsg && (
              <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200/80 text-red-700 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveItem} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Nome del Prodotto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es: Shampoo Keratina Professional 500ml"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all font-medium text-[#1a2035]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Brand / Produttore
                  </label>
                  <input
                    type="text"
                    placeholder="Es: L'Oréal"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all font-medium text-[#1a2035]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all cursor-pointer font-medium text-[#1a2035]"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price and Min Alert Threshold */}
              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Soglia Minima Allerta (pz) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={minQuantity}
                    onChange={(e) => setMinQuantity(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all font-bold text-[#1a2035]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Prezzo al Pubblico (€) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all font-bold font-mono text-[#1a2035]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Provvigione Collaboratore Vendita Banco (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="Es: 10"
                    value={commissionPercentage}
                    onChange={(e) => setCommissionPercentage(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all pr-10 font-bold text-[#1a2035]"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Percent className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Percentuale di compenso spettante al collaboratore quando vende questo prodotto alla cassa.
                </p>
              </div>

              {/* Multi-Salon stock configuration */}
              <div className="border-t border-slate-200 pt-4 mt-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#1a3a8f] mb-3">
                  Scorta Iniziale per Ciascuna Sede
                </span>
                
                <div className="space-y-3 bg-slate-50/80 p-4 border border-slate-200/80 rounded-2xl">
                  {allowedSalons.map(salon => (
                    <div key={salon.id} className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-slate-800 block truncate">{salon.name}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{salon.address || "Sede operativa"}</span>
                      </div>
                      <div className="w-28 shrink-0">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            required
                            value={formSalonStocks[salon.id] || "0"}
                            onChange={(e) => {
                              setFormSalonStocks({
                                ...formSalonStocks,
                                [salon.id]: e.target.value
                              });
                            }}
                            className="w-full text-right bg-white border border-slate-200 focus:border-[#1a3a8f] text-xs font-bold px-3 py-2 rounded-xl outline-none pr-7 text-[#1a2035]"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">pz</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {allowedSalons.length === 0 && (
                    <div className="text-center p-3 text-xs text-slate-400 font-medium">
                      Nessun salone configurato. Configura prima le sedi nella sezione dedicata.
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl px-5 py-2.5 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:bg-indigo-300 text-white rounded-2xl px-6 py-2.5 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                >
                  {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {selectedItem ? "Salva Modifiche" : "Crea Prodotto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Refill / Carica & Scarica Scorte in stile Apple */}
      {refillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setRefillModalOpen(false)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-md rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col animate-fadeIn">
            
            {/* Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/80 backdrop-blur-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] block">
                  Movimentazione Magazzino
                </span>
                <h3 className="text-xl font-bold text-[#1a2035] tracking-tight">
                  Carica / Scarica Scorte
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setRefillModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 rounded-2xl transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {refillError && (
              <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200/80 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{refillError}</span>
              </div>
            )}

            <form onSubmit={handleRefillStock} className="p-6 space-y-4">
              
              {/* Product Selection */}
              {refillProduct ? (
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[#1a3a8f] tracking-wider block">Prodotto selezionato</span>
                  <span className="text-sm font-bold text-[#1a2035] block">{refillProduct.name}</span>
                  <span className="text-xs text-slate-500 block">{refillProduct.brand} - {refillProduct.category}</span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Seleziona Prodotto *
                  </label>
                  <select
                    required
                    value={refillProduct?.id || ""}
                    onChange={(e) => {
                      const selected = items.find(i => i.id === e.target.value);
                      setRefillProduct(selected || null);
                    }}
                    className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all cursor-pointer font-medium text-[#1a2035]"
                  >
                    <option value="" disabled>-- Scegli un prodotto dal catalogo --</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.brand})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Refill Type Action Toggle (Carica vs Scarica) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Tipo di Movimento *
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-1.5 rounded-2xl border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setRefillType("add")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      refillType === "add"
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "text-slate-600 hover:bg-white/60"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Carica (Aggiungi)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefillType("remove")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      refillType === "remove"
                        ? "bg-amber-600 text-white shadow-2xs"
                        : "text-slate-600 hover:bg-white/60"
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                    Scarica (Preleva)
                  </button>
                </div>
              </div>

              {/* Sede Select */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Sede di destinazione / origine *
                </label>
                <select
                  required
                  value={refillSalonId}
                  onChange={(e) => setRefillSalonId(e.target.value)}
                  className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all cursor-pointer font-medium text-[#1a2035]"
                >
                  <option value="" disabled>-- Seleziona sede --</option>
                  {allowedSalons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Quantity Amount to load */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Quantità da Movimentare (Pezzi) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="1"
                    value={refillAmount}
                    onChange={(e) => setRefillAmount(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-2xl outline-none transition-all font-bold text-[#1a2035]"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">pezzi</span>
                </div>
              </div>

              {/* Information Alert */}
              {refillProduct && refillSalonId && (
                <div className="p-3.5 bg-[#eef2ff] border border-[#1a3a8f]/10 rounded-2xl text-[#1a2035] text-xs leading-relaxed space-y-1">
                  <div>Scorta attuale nella sede <strong>{salons.find(s => s.id === refillSalonId)?.name}</strong>: <strong>{getStockForSalon(refillProduct, refillSalonId, salons)} pz</strong>.</div>
                  <div>
                    La nuova scorta stimata sarà:{" "}
                    <strong className="text-[#1a3a8f]">
                      {refillType === "add" 
                        ? getStockForSalon(refillProduct, refillSalonId, salons) + (parseInt(refillAmount) || 0)
                        : Math.max(0, getStockForSalon(refillProduct, refillSalonId, salons) - (parseInt(refillAmount) || 0))
                      } pz
                    </strong>.
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setRefillModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl px-5 py-2.5 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={refillSaving || !refillProduct}
                  className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:bg-indigo-300 text-white rounded-2xl px-5 py-2.5 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                >
                  {refillSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Conferma Rifornimento
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
