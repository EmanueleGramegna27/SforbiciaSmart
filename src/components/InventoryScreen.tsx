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
  writeBatch
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
  Percent
} from "lucide-react";
import { Salon } from "../types";

interface InventoryItem {
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
  const { user, salons, ownerId, userRole, userSalonIds } = useBusiness();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Filter by Salon
  const [selectedSalonId, setSelectedSalonId] = useState<string>("all");

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

  const categoriesList = ["Shampoo", "Balsamo", "Tinta/Colore", "Trattamenti", "Attrezzatura", "Altro"];

  // Filter salons allowed for the current logged-in user (receptionist constraint)
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

  // Backward compatibility: Retrieve stock quantity for a salon, fall back gracefully
  const getStockForSalon = (item: InventoryItem, salonId: string, salonsList: Salon[]): number => {
    if (item.salonStocks && item.salonStocks[salonId] !== undefined) {
      return item.salonStocks[salonId];
    }
    // Backward compatibility fallback: If salonStocks is completely missing, 
    // assign the legacy quantity to the first salon in the business list.
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
        { name: "Shampoo Keratina Professionale", brand: "L'Oréal", category: "Shampoo", minQuantity: 5, price: 18.5 },
        { name: "Balsamo Protettivo Colore", brand: "Wella", category: "Balsamo", minQuantity: 3, price: 14.0 },
        { name: "Gel Forte Modellante", brand: "Kérastase", category: "Altro", minQuantity: 2, price: 21.0 },
        { name: "Tinta Castano Naturale 5.0", brand: "L'Oréal", category: "Tinta/Colore", minQuantity: 4, price: 9.5 },
        { name: "Maschera Riparatrice Profonda", brand: "Moroccanoil", category: "Trattamenti", minQuantity: 3, price: 32.0 },
        { name: "Forbici Ergonometriche Taglio", brand: "Yasaka", category: "Attrezzatura", minQuantity: 1, price: 150.0 }
      ];

      const batch = writeBatch(db);
      sampleItems.forEach((baseItem) => {
        const docRef = doc(collection(db, "inventory"));
        
        // Initialize random stock values for each salon
        const sampleStocks: { [salonId: string]: number } = {};
        let totalQty = 0;
        salons.forEach(s => {
          const sQty = Math.floor(Math.random() * 15) + 3; // random quantity 3-17
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
      // If no salon is filtered, open the Refill Modal to specify where to add/remove
      openRefillModal(item, amount > 0 ? "add" : "remove");
    } else {
      // Direct adjustment on the filtered salon
      try {
        const docRef = doc(db, "inventory", item.id);
        const currentStocks = item.salonStocks || {};
        const currentVal = getStockForSalon(item, selectedSalonId, salons);
        const nextVal = Math.max(0, currentVal + amount);
        
        const updatedStocks: { [salonId: string]: number } = {
          ...currentStocks,
          [selectedSalonId]: nextVal
        };

        // Recalculate total quantity
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
    
    // Initialize stocks to "0" for each allowed salon
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
    
    // Prepopulate starting stocks
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

  // Save Inventory item (with separate quantities)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !ownerId) return;
    if (!name.trim()) {
      setErrorMsg("Il nome del prodotto è obbligatorio");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    // Compile stock quantities map for all allowed salons
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
      quantity: totalQty, // Save the cumulative total for general queries/sorting
      ownerId: ownerId
    };

    try {
      const savePromise = selectedItem
        ? updateDoc(doc(db, "inventory", selectedItem.id), payload)
        : addDoc(collection(db, "inventory"), payload);

      // Se siamo offline, o se la rete impiega più di 800ms,
      // chiudiamo il modal e lasciamo che la cache locale di Firestore aggiorni la UI.
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

  // Refill / Load / Unload stock transaction logic
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

      // Recalculate cumulative total quantity
      const totalQty = Object.values(updatedStocks).reduce((a: number, b: number) => a + b, 0);

      const savePromise = updateDoc(docRef, {
        salonStocks: updatedStocks,
        quantity: totalQty
      });

      // Se siamo offline, o se la rete impiega più di 800ms,
      // chiudiamo il modal e lasciamo che la cache locale di Firestore aggiorni la UI.
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

  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const handleDeleteItem = async (item: InventoryItem) => {
    try {
      await deleteDoc(doc(db, "inventory", item.id));
      setDeletingItemId(null);
    } catch (err: any) {
      console.error("Error deleting inventory item:", err);
      handleFirestoreError(err, OperationType.DELETE, `inventory/${item.id}`);
    }
  };

  // Filter items matching the search query and selected category
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, selectedCategory]);

  // Statistics calculation depending on the selected salon filter
  const stats = useMemo(() => {
    let totalProducts = items.length;
    let lowStock = 0;
    let totalValue = 0;

    items.forEach((item) => {
      let qty = 0;
      if (selectedSalonId === "all") {
        qty = item.salonStocks && Object.keys(item.salonStocks).length > 0
          ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0)
          : item.quantity || 0;
      } else {
        qty = getStockForSalon(item, selectedSalonId, salons);
      }

      totalValue += item.price * qty;
      if (qty <= item.minQuantity) {
        lowStock++;
      }
    });

    return { totalProducts, lowStock, totalValue };
  }, [items, selectedSalonId, salons]);

  return (
    <div className="space-y-6 animate-pageFade pb-12" id="inventory-screen">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Gestione Magazzino
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#1a2035] md:text-3xl">
            Inventario Prodotti
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Monitora e distribuisci scorte separatamente per ciascuna delle tue sedi professionali.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => openRefillModal(null, "add")}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-150 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin-slow" />
            Carica / Scarica Prodotti
          </button>
          
          {userRole === "owner" && (
            <button
              onClick={openCreateModal}
              className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-5 py-2.5 text-xs font-semibold shadow-md shadow-blue-900/10 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuovo Prodotto
            </button>
          )}
        </div>
      </div>

      {/* Salon Filter Selector Bar */}
      <div className="bg-[#1a3a8f]/5 border border-slate-100 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-[#1a3a8f] uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Store className="w-3.5 h-3.5" />
            Sede visualizzata:
          </span>
          
          {userRole !== "receptionist" && (
            <button
              onClick={() => setSelectedSalonId("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                selectedSalonId === "all"
                  ? "bg-[#1a3a8f] text-white shadow-sm"
                  : "bg-white text-gray-500 hover:bg-slate-100/50 border border-slate-150"
              }`}
            >
              Tutte le Sedi (Cumulativo)
            </button>
          )}

          {allowedSalons.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedSalonId(s.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                selectedSalonId === s.id
                  ? "bg-[#1a3a8f] text-white shadow-sm"
                  : "bg-white text-gray-500 hover:bg-slate-100/50 border border-slate-150"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 shrink-0">
          <Info className="w-3.5 h-3.5 text-[#1a3a8f]" />
          <span>Le statistiche e le scorte mostrate sotto si adattano alla sede selezionata.</span>
        </div>
      </div>

      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-[#1a3a8f] shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Prodotti Monitorati</span>
            <span className="text-2xl font-bold text-gray-900">{stats.totalProducts}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm/5 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${stats.lowStock > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Scorte in Esaurimento</span>
            <span className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {stats.lowStock}
              {stats.lowStock > 0 && (
                <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-100 animate-pulse">
                  Controlla
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Valore Magazzino Filtrato</span>
            <span className="text-2xl font-bold text-gray-900">€{stats.totalValue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Main filter & search bar */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm/5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Search bar */}
          <div className="relative max-w-md w-full">
            <input
              type="text"
              placeholder="Cerca per nome prodotto o brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-10 py-2.5 rounded-xl outline-none transition-all placeholder:text-gray-400"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* Categories filter */}
          <div className="flex flex-wrap items-center gap-1.5 self-start lg:self-auto">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === "all"
                  ? "bg-[#1a3a8f] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              Tutti
            </button>
            {categoriesList.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-[#1a3a8f] text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Loading Spinner or Empty State */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full border-4 border-slate-100 border-t-[#1a3a8f] animate-spin" />
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Caricamento in corso...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-14 border border-dashed border-gray-150 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-slate-50/40">
            <Package className="w-10 h-10 text-gray-300 mb-3" />
            <h4 className="font-serif text-sm font-bold text-gray-700">Nessun prodotto trovato</h4>
            <p className="text-xs text-gray-400 max-w-sm mt-1">
              {items.length === 0 
                ? "Il tuo inventario è attualmente vuoto. Inizia inserendo il tuo primo prodotto professionale o pre-popola con alcuni articoli di prova." 
                : "Nessun prodotto corrisponde ai criteri di ricerca selezionati."}
            </p>
            {items.length === 0 && userRole === "owner" && (
              <div className="flex gap-4 mt-4">
                <button
                  onClick={openCreateModal}
                  className="bg-[#1a3a8f] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-[#152f73]"
                >
                  Crea Prodotto
                </button>
                <button
                  onClick={handlePrepopulate}
                  className="bg-indigo-50 text-[#1a3a8f] border border-indigo-100 text-xs font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-indigo-100 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Pre-popola Sedi
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Table Layout for Desktop / Cards for Mobile */
          <div className="border border-gray-150 rounded-2xl overflow-hidden mt-2">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-gray-150 text-xs font-bold uppercase tracking-wider text-gray-400">
                    <th className="py-3.5 px-6">Prodotto</th>
                    <th className="py-3.5 px-6">Categoria</th>
                    <th className="py-3.5 px-6">Quantità e Sedi</th>
                    <th className="py-3.5 px-6 text-right">Prezzo</th>
                    <th className="py-3.5 px-6 text-right">Carica / Scarica</th>
                    <th className="py-3.5 px-6 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {filteredItems.map((item) => {
                    // Decide if low stock applies based on current filter
                    let currentQty = 0;
                    let isLow = false;

                    if (selectedSalonId === "all") {
                      currentQty = item.salonStocks && Object.keys(item.salonStocks).length > 0
                        ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0)
                        : item.quantity || 0;
                      isLow = currentQty <= item.minQuantity;
                    } else {
                      currentQty = getStockForSalon(item, selectedSalonId, salons);
                      isLow = currentQty <= item.minQuantity;
                    }

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-semibold text-gray-950">{item.name}</div>
                          <div className="text-xs text-gray-400 font-medium">{item.brand}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-col gap-1">
                            <span className="inline-block w-max px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-gray-600">
                              {item.category}
                            </span>
                            {item.commissionPercentage !== undefined && item.commissionPercentage > 0 && (
                              <span className="inline-block w-max px-2 py-0.5 rounded bg-indigo-50 border border-indigo-150 text-[#1a3a8f] text-[9px] font-extrabold">
                                Provv: {item.commissionPercentage}%
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-col">
                            {selectedSalonId === "all" ? (
                              <span className={`text-sm font-extrabold ${isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                                {currentQty} <span className="text-[10px] font-semibold text-gray-400">totali</span>
                              </span>
                            ) : (
                              <span className={`text-sm font-extrabold ${isLow ? 'text-amber-600 font-black' : 'text-gray-900'}`}>
                                {currentQty} <span className="text-[10px] font-semibold text-gray-400">in sede</span>
                              </span>
                            )}
                            
                            <div className="flex flex-wrap gap-1 mt-1.5 max-w-[280px]">
                              {allowedSalons.map(s => {
                                const stockVal = getStockForSalon(item, s.id, salons);
                                const isSelected = selectedSalonId === s.id;
                                return (
                                  <span 
                                    key={s.id} 
                                    className={`text-[9px] font-black px-2 py-0.5 rounded border transition-all ${
                                      isSelected
                                        ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-xs'
                                        : stockVal <= item.minQuantity 
                                          ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                          : 'bg-slate-50 text-slate-500 border-slate-150'
                                    }`}
                                    title={`${s.name}: ${stockVal} pz`}
                                  >
                                    {s.name}: {stockVal}
                                  </span>
                                );
                              })}
                            </div>
                            
                            {selectedSalonId !== "all" && (
                              <span className="text-[10px] text-gray-400 mt-1">
                                Soglia min: {item.minQuantity} | Aziendale: {item.salonStocks ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0) : item.quantity || 0}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right font-mono font-bold text-gray-900">
                          €{item.price.toFixed(2)}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleQuickAdjust(item, -1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all cursor-pointer"
                              title={selectedSalonId === "all" ? "Scarica quantità..." : "Diminuisci scorta sede"}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            
                            <button
                              onClick={() => handleQuickAdjust(item, 1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all cursor-pointer"
                              title={selectedSalonId === "all" ? "Carica quantità..." : "Aumenta scorta sede"}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => openRefillModal(item, "add")}
                              className="px-2 py-1 rounded-lg border border-[#1a3a8f]/10 bg-[#1a3a8f]/5 text-[#1a3a8f] text-[10px] font-bold uppercase tracking-wider hover:bg-[#1a3a8f]/10 transition-all ml-1"
                              title="Gestisci Rifornimento avanzato"
                            >
                              Carica/Rifornisci
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {userRole === "owner" ? (
                              deletingItemId === item.id ? (
                                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200/60 p-1 rounded-xl text-xs animate-fadeIn">
                                  <span className="text-red-700 font-bold px-1 select-none text-[10px] uppercase">Eliminare?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                                  >
                                    Sì
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingItemId(null)}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openEditModal(item)}
                                    className="p-1 px-2.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#1a3a8f] hover:bg-[#eef2ff] hover:border-indigo-100 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Modifica
                                  </button>
                                  <button
                                    onClick={() => setDeletingItemId(item.id)}
                                    className="p-1 px-2.5 rounded-lg border border-gray-250 text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Elimina
                                  </button>
                                </>
                              )
                            ) : (
                              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100 uppercase tracking-wider">
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

            {/* Mobile Cards */}
            <div className="grid grid-cols-1 divide-y divide-gray-100 md:hidden">
              {filteredItems.map((item) => {
                let currentQty = 0;
                let isLow = false;

                if (selectedSalonId === "all") {
                  currentQty = item.salonStocks && Object.keys(item.salonStocks).length > 0
                    ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0)
                    : item.quantity || 0;
                  isLow = currentQty <= item.minQuantity;
                } else {
                  currentQty = getStockForSalon(item, selectedSalonId, salons);
                  isLow = currentQty <= item.minQuantity;
                }

                return (
                  <div key={item.id} className="p-4 space-y-3 bg-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex gap-1 mb-1">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-gray-600 uppercase tracking-widest block self-start w-max">
                            {item.category}
                          </span>
                          {item.commissionPercentage !== undefined && item.commissionPercentage > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[#1a3a8f] text-[9px] font-extrabold uppercase tracking-wider block self-start w-max">
                              Provv: {item.commissionPercentage}%
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-gray-900 text-sm leading-tight">{item.name}</h4>
                        <span className="text-xs text-gray-500">{item.brand}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900">€{item.price.toFixed(2)}</span>
                    </div>

                    {/* Stock status blocks */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">
                            {selectedSalonId === "all" ? "Quantità Totale Azienda" : `Quantità in Sede`}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-base font-black ${isLow ? 'text-amber-600' : 'text-slate-850'}`}>
                              {currentQty} pz
                            </span>
                            {selectedSalonId !== "all" && isLow && (
                              <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">
                                Low Stock
                              </span>
                            )}
                          </div>
                        </div>

                        {selectedSalonId !== "all" && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleQuickAdjust(item, -1)}
                              className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100 cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleQuickAdjust(item, 1)}
                              className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100 cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-150">
                        {allowedSalons.map(s => {
                          const stockVal = getStockForSalon(item, s.id, salons);
                          const isSelected = selectedSalonId === s.id;
                          return (
                            <div 
                              key={s.id} 
                              className={`flex justify-between items-center text-[10px] p-1.5 rounded transition-all ${
                                isSelected 
                                  ? 'bg-[#1a3a8f] text-white font-bold px-2' 
                                  : 'text-gray-500 font-medium'
                              }`}
                            >
                              <span className="truncate pr-1">{s.name}:</span>
                              <span className={isSelected ? 'text-white font-extrabold' : stockVal <= item.minQuantity ? 'text-amber-600 font-bold' : 'text-gray-800 font-bold'}>
                                {stockVal} pz
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[9px] text-gray-400 pt-1 border-t border-slate-150/50 flex justify-between">
                        <span>Soglia min: {item.minQuantity}</span>
                        <span>Totale Azienda: {item.salonStocks ? Object.values(item.salonStocks).reduce((a: number, b: number) => a + b, 0) : item.quantity || 0} pz</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1.5">
                      <button
                        onClick={() => openRefillModal(item, "add")}
                        className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 border border-emerald-150 rounded-xl"
                      >
                        Carica / Rifornisci
                      </button>

                      <div className="flex items-center gap-2">
                        {userRole === "owner" ? (
                          deletingItemId === item.id ? (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1.5 rounded-xl text-xs animate-fadeIn">
                              <span className="text-red-700 font-bold px-1 select-none text-[10px]">Elimina?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item)}
                                className="bg-red-600 text-white font-bold px-2 py-0.5 rounded text-[10px] uppercase cursor-pointer"
                              >
                                Sì
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingItemId(null)}
                                className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openEditModal(item)}
                                className="text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200"
                              >
                                Modifica
                              </button>
                              <button
                                onClick={() => setDeletingItemId(item.id)}
                                className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl border border-red-100"
                              >
                                Elimina
                              </button>
                            </>
                          )
                        ) : (
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 uppercase tracking-wider">
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

      {/* 1. Add / Edit Modal Overlay (Supports Quantities Per Salon) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 md:pt-16 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          
          <div className="relative bg-white border border-gray-100 w-full max-w-lg rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh] animate-fadeIn">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-serif text-xl font-bold text-[#1a2035]">
                {selectedItem ? "Modifica Prodotto" : "Aggiungi Nuovo Prodotto"}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error messaging */}
            {errorMsg && (
              <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveItem} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Nome del Prodotto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="E.g., Shampoo alla Keratina Professional"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Brand / Produttore
                  </label>
                  <input
                    type="text"
                    placeholder="E.g., L'Oréal"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all cursor-pointer"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price and Min Alert Threshold */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Soglia Minima Allerta (pz) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={minQuantity}
                    onChange={(e) => setMinQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Prezzo al Pubblico (€) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Percentuale Collaboratore (%)
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
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all pr-10"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Percent className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  La percentuale di commissione spettante al collaboratore che vende questo prodotto al dettaglio.
                </p>
              </div>

              {/* Multi-Salon stock configuration (This implements the user's specific requirement) */}
              <div className="border-t border-slate-100 pt-4 mt-2">
                <span className="block text-xs font-black uppercase tracking-widest text-[#1a3a8f] mb-3">
                  Scorta e Quantità per Sede
                </span>
                
                <div className="space-y-3 bg-slate-50/70 p-4 border border-slate-100 rounded-2xl">
                  {allowedSalons.map(salon => (
                    <div key={salon.id} className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-gray-800 block truncate">{salon.name}</span>
                        <span className="text-[10px] text-gray-400 block truncate">{salon.address}</span>
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
                            className="w-full text-right bg-white border border-gray-200 focus:border-[#1a3a8f] text-xs font-bold px-3 py-2 rounded-lg outline-none pr-7"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">pz</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {allowedSalons.length === 0 && (
                    <div className="text-center p-3 text-xs text-gray-400 font-medium">
                      Nessun salone configurato. Configura prima i tuoi saloni nella sezione dedicata.
                    </div>
                  )}
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
                  {selectedItem ? "Salva Modifiche" : "Crea Prodotto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Refill / Load Quantities (Carica Scorte) Modal */}
      {refillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRefillModalOpen(false)} />
          
          <div className="relative bg-white border border-gray-100 w-full max-w-md rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col animate-fadeIn">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-serif text-xl font-bold text-[#1a2035]">
                Carica / Scarica Prodotti (Rifornimento)
              </h3>
              <button 
                onClick={() => setRefillModalOpen(false)}
                className="p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message inside Refill */}
            {refillError && (
              <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{refillError}</span>
              </div>
            )}

            <form onSubmit={handleRefillStock} className="p-6 space-y-4">
              
              {/* Product Selection (only if refilling from top button, otherwise read-only) */}
              {refillProduct ? (
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-[9px] font-black uppercase text-[#1a3a8f] tracking-widest block">Prodotto selezionato</span>
                  <span className="text-sm font-bold text-gray-900 block mt-0.5">{refillProduct.name}</span>
                  <span className="text-xs text-gray-400 block">{refillProduct.brand} - {refillProduct.category}</span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Seleziona Prodotto *
                  </label>
                  <select
                    required
                    value={refillProduct?.id || ""}
                    onChange={(e) => {
                      const selected = items.find(i => i.id === e.target.value);
                      setRefillProduct(selected || null);
                    }}
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all cursor-pointer"
                  >
                    <option value="" disabled>-- Scegli un prodotto --</option>
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
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Operazione *
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRefillType("add")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      refillType === "add"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-gray-500 hover:bg-white/50"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Carica (Aggiungi)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefillType("remove")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      refillType === "remove"
                        ? "bg-amber-500 text-white shadow-xs"
                        : "text-gray-500 hover:bg-white/50"
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                    Scarica (Preleva)
                  </button>
                </div>
              </div>

              {/* Sede Select */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Sede di destinazione / origine *
                </label>
                <select
                  required
                  value={refillSalonId}
                  onChange={(e) => setRefillSalonId(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all cursor-pointer"
                >
                  <option value="" disabled>-- Seleziona sede --</option>
                  {allowedSalons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Quantity Amount to load */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Quantità (Pezzi) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="1"
                    value={refillAmount}
                    onChange={(e) => setRefillAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 focus:border-[#1a3a8f] focus:bg-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all font-bold"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">pezzi</span>
                </div>
              </div>

              {/* Information Alert */}
              {refillProduct && refillSalonId && (
                <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-blue-900 text-xs leading-relaxed">
                  Scorta attuale nella sede <strong>{salons.find(s => s.id === refillSalonId)?.name}</strong>:{" "}
                  <strong>{getStockForSalon(refillProduct, refillSalonId, salons)} pz</strong>. <br />
                  La nuova scorta stimata sarà:{" "}
                  <strong>
                    {refillType === "add" 
                      ? getStockForSalon(refillProduct, refillSalonId, salons) + (parseInt(refillAmount) || 0)
                      : Math.max(0, getStockForSalon(refillProduct, refillSalonId, salons) - (parseInt(refillAmount) || 0))
                    } pz
                  </strong>.
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setRefillModalOpen(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={refillSaving || !refillProduct}
                  className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:bg-indigo-300 text-white rounded-xl px-5 py-2 text-xs font-semibold shadow-md shadow-indigo-900/10 flex items-center gap-1.5 transition-all cursor-pointer"
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
