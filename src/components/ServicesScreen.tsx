import React, { useState, useMemo } from "react";
import { useBusiness } from "../context/BusinessContext";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  Grid, 
  Tag, 
  Scissors, 
  DollarSign, 
  Clock, 
  Store, 
  Edit2, 
  Trash2, 
  Plus, 
  Loader2,
  X,
  AlertCircle,
  Filter,
  Percent
} from "lucide-react";
import { Service, Category } from "../types";

export default function ServicesScreen() {
  const { user, salons, services, categories, loading, userRole } = useBusiness();
  
  // Category management inline states
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

  // Service modal states
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Service form fields
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceDuration, setServiceDuration] = useState("30");
  const [serviceCategoryId, setServiceCategoryId] = useState("");
  const [serviceCommissionPercentage, setServiceCommissionPercentage] = useState("0");
  const [selectedSalonIds, setSelectedSalonIds] = useState<string[]>([]);

  const [savingService, setSavingService] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Delete confirmation overlay state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: "service" | "category" | "category_blocked"; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Categories map for quick name lookup
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (categories && Array.isArray(categories)) {
      categories.forEach((cat) => {
        if (cat.id && cat.name) map[cat.id] = cat.name;
      });
    }
    return map;
  }, [categories]);

  // Salons map for quick name lookup
  const salonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (salons && Array.isArray(salons)) {
      salons.forEach((s) => {
        if (s.id && s.name) map[s.id] = s.name;
      });
    }
    return map;
  }, [salons]);

  // Filtered Services List
  const filteredServices = useMemo(() => {
    if (!services || !Array.isArray(services)) return [];
    const servs = services.filter((s) => s.name); // anti-crash filter
    if (selectedCategoryFilter === "all") {
      return servs;
    }
    return servs.filter((s) => s.categoryId === selectedCategoryFilter);
  }, [services, selectedCategoryFilter]);

  // Form Reset
  const openCreateServiceModal = () => {
    setSelectedService(null);
    setServiceName("");
    setServicePrice("");
    setServiceDuration("30");
    setServiceCategoryId(categories.length > 0 ? categories[0].id : "");
    setServiceCommissionPercentage("0");
    setSelectedSalonIds(salons.map(s => s.id)); // Default allocate to all salons
    setErrorMsg("");
    setServiceModalOpen(true);
  };

  const openEditServiceModal = (service: Service) => {
    setSelectedService(service);
    setServiceName(service.name);
    setServicePrice(service.price.toString());
    setServiceDuration(service.duration.toString());
    setServiceCategoryId(service.categoryId);
    setServiceCommissionPercentage(service.commissionPercentage !== undefined ? service.commissionPercentage.toString() : "0");
    setSelectedSalonIds(service.salonIds || []);
    setErrorMsg("");
    setServiceModalOpen(true);
  };

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newCatName.trim()) return;

    setSavingCat(true);
    try {
      const savePromise = addDoc(collection(db, "categories"), {
        name: newCatName.trim(),
        ownerId: user.uid,
        createdAt: new Date()
      });

      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);
      setNewCatName("");
    } catch (err: any) {
      console.error("Error creating category", err);
      handleFirestoreError(err, OperationType.CREATE, "categories");
    } finally {
      setSavingCat(false);
    }
  };

  // Delete Category (Trigger dialog)
  const handleDeleteCategory = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;

    const hasDependencies = services.some(s => s.categoryId === catId);
    if (hasDependencies) {
      setDeleteTarget({
        id: catId,
        type: "category_blocked",
        name: cat.name
      });
      return;
    }

    setDeleteTarget({
      id: catId,
      type: "category",
      name: cat.name
    });
  };

  // Handle Multi-salon checkbox selection
  const toggleSalonSelection = (salonId: string) => {
    setSelectedSalonIds((prev) => 
      prev.includes(salonId) 
        ? prev.filter(id => id !== salonId) 
        : [...prev, salonId]
    );
  };

  // Save Service
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!serviceName.trim()) {
      setErrorMsg("Il nome del servizio è obbligatorio.");
      return;
    }
    const priceNum = parseFloat(servicePrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg("Inserisci un prezzo valido maggiore di zero.");
      return;
    }
    const durationNum = parseInt(serviceDuration);
    if (isNaN(durationNum) || durationNum <= 0) {
      setErrorMsg("Inserisci una durata valida (in minuti).");
      return;
    }
    if (!serviceCategoryId) {
      setErrorMsg("Crea e seleziona una categoria valida prima di salvare.");
      return;
    }
    if (selectedSalonIds.length === 0) {
      setErrorMsg("Associa il servizio ad almeno un salone.");
      return;
    }

    setSavingService(true);
    setErrorMsg("");

    try {
      const catName = categoryMap[serviceCategoryId] || "";
      const commPercentageNum = Math.max(0, Math.min(100, parseFloat(serviceCommissionPercentage) || 0));
      const payload = {
        name: serviceName.trim(),
        price: priceNum,
        duration: durationNum,
        categoryId: serviceCategoryId,
        categoryName: catName,
        salonIds: selectedSalonIds,
        commissionPercentage: commPercentageNum,
        ownerId: user.uid,
        updatedAt: new Date()
      };

      const savePromise = selectedService
        ? updateDoc(doc(db, "services", selectedService.id), payload)
        : addDoc(collection(db, "services"), {
            ...payload,
            createdAt: new Date()
          });

      // Se siamo offline, oppure se il server impiega più di 800ms,
      // chiudiamo il modal e lasciamo che la cache offline aggiorni la UI.
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, timeoutPromise]);
      setServiceModalOpen(false);
    } catch (err: any) {
      console.error("Error saving service", err);
      handleFirestoreError(err, selectedService ? OperationType.UPDATE : OperationType.CREATE, "services");
      setErrorMsg("Errore del database nel salvataggio del servizio.");
    } finally {
      setSavingService(false);
    }
  };

  // Delete Service (Trigger dialog)
  const handleDeleteService = (serviceId: string) => {
    const s = services.find(item => item.id === serviceId);
    if (!s) return;
    setDeleteTarget({ id: serviceId, type: "service", name: s.name });
  };

  // Perform actual deletion when confirmed
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError("");

    try {
      if (deleteTarget.type === "service") {
        await deleteDoc(doc(db, "services", deleteTarget.id));
      } else if (deleteTarget.type === "category") {
        await deleteDoc(doc(db, "categories", deleteTarget.id));
        if (selectedCategoryFilter === deleteTarget.id) {
          setSelectedCategoryFilter("all");
        }
      }
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Error during deletion:", err);
      setDeleteError("Impossibile procedere con l'eliminazione. Riprova.");
      handleFirestoreError(err, OperationType.DELETE, `${deleteTarget.type === "service" ? "services" : "categories"}/${deleteTarget.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 h-96 skeleton lg:col-span-1 shadow-2xs" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:col-span-3">
            {[1, 2, 4].map(n => (
              <div key={n} className="bg-white border border-slate-200/80 rounded-3xl p-6 h-40 skeleton shadow-2xs" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-pageFade">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1a2035]">
            Servizi di Trattamento & Listini
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Definisci i servizi del salone, i prezzi di listino, i tempi di posa e le sedi in cui sono operabili.
          </p>
        </div>
        {userRole === "owner" && (
          <button
            onClick={openCreateServiceModal}
            disabled={categories.length === 0}
            className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-5 py-2.5 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nuovo Servizio
          </button>
        )}
      </div>

      {/* Horizontal scrollable categories filter on mobile/tablet */}
      <div className="lg:hidden bg-white/90 backdrop-blur-xs border border-slate-200/80 rounded-3xl p-4 md:p-5 shadow-2xs mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1a2035] flex items-center gap-2 tracking-tight">
            <div className="w-7 h-7 rounded-xl bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 flex items-center justify-center shadow-2xs">
              <Tag className="w-3.5 h-3.5" />
            </div>
            Categorie Trattamenti
          </h3>
          {userRole === "owner" && (
            <form onSubmit={handleCreateCategory} className="flex gap-1.5 max-w-[170px] sm:max-w-xs w-full min-w-0">
              <input
                type="text"
                required
                placeholder="Nuova..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full min-w-0 bg-slate-50/80 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs focus:bg-white focus:border-[#1a3a8f] outline-none text-[#1a2035] transition-all"
              />
              <button
                type="submit"
                disabled={savingCat}
                className="bg-[#1a3a8f] text-white p-1.5 rounded-xl hover:bg-[#152f73] cursor-pointer shrink-0 flex items-center justify-center transition-all active:scale-95 shadow-2xs"
              >
                {savingCat ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </form>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin select-none">
          <button
            onClick={() => setSelectedCategoryFilter("all")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              selectedCategoryFilter === "all"
                ? "bg-[#1a3a8f] text-white shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Tutti ({services.length})
          </button>
          {categories.map((cat) => {
            const serviceCount = services.filter(s => s.categoryId === cat.id).length;
            const isSelected = selectedCategoryFilter === cat.id;
            return (
              <div 
                key={cat.id} 
                className={`relative flex items-center shrink-0 gap-1 rounded-full pl-3.5 pr-2 py-1 transition-all ${
                  isSelected ? "bg-[#eef2ff] border border-[#1a3a8f]/20 shadow-2xs" : "bg-slate-100 border border-transparent"
                }`}
              >
                <button
                  onClick={() => setSelectedCategoryFilter(cat.id)}
                  className={`text-xs font-semibold whitespace-nowrap transition-all ${
                    isSelected ? "text-[#1a3a8f] font-bold" : "text-slate-600"
                  }`}
                >
                  {cat.name} ({serviceCount})
                </button>
                {userRole === "owner" && (
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-all active:scale-95 cursor-pointer"
                    title="Cancella Categoria"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Categories panel (Left 1 Col) - Hidden on mobile, shown on large screens */}
        <div className="hidden lg:block space-y-6 lg:col-span-1">
          {/* Create Category form card */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/10 flex items-center justify-center shadow-2xs">
                <Tag className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#1a2035] tracking-tight">
                Categorie Trattamenti
              </h3>
            </div>

            {userRole === "owner" ? (
              <form onSubmit={handleCreateCategory} className="flex gap-2 w-full min-w-0">
                <input
                  type="text"
                  required
                  placeholder="Es: Taglio, Colore..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-50/80 border border-slate-200/80 rounded-2xl px-3.5 py-2 text-xs focus:bg-white focus:border-[#1a3a8f] outline-none w-full text-[#1a2035] transition-all placeholder:text-slate-400 font-medium"
                />
                <button
                  type="submit"
                  disabled={savingCat}
                  className="bg-[#1a3a8f] text-white p-2 rounded-2xl hover:bg-[#152f73] cursor-pointer shrink-0 flex items-center justify-center transition-all active:scale-95 shadow-2xs"
                >
                  {savingCat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5 text-center text-[10px] font-semibold text-slate-400">
                Sola lettura (Accesso limitato)
              </div>
            )}

            {/* List and Selector filters combined */}
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Filtra / Gestisci
              </label>
              
              <button
                onClick={() => setSelectedCategoryFilter("all")}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-xs font-semibold text-left transition-all active:scale-[0.98] ${
                  selectedCategoryFilter === "all"
                    ? "bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 shadow-2xs font-bold"
                    : "text-slate-600 hover:bg-slate-50 border border-transparent"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5" />
                  Mostra Tutti
                </span>
                <span className="bg-white px-2 py-0.5 rounded-full text-[10px] text-slate-600 border border-slate-200/80 font-bold min-w-5 text-center shadow-2xs">
                  {services.length}
                </span>
              </button>

              {categories.map((cat) => {
                const serviceCount = services.filter(s => s.categoryId === cat.id).length;
                const isSelected = selectedCategoryFilter === cat.id;
                return (
                  <div key={cat.id} className="group/cat flex items-center justify-between rounded-2xl hover:bg-slate-50 transition-colors">
                    <button
                      onClick={() => setSelectedCategoryFilter(cat.id)}
                      className={`flex-1 flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-left rounded-2xl transition-all ${
                        isSelected
                          ? "bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 shadow-2xs font-bold"
                          : "text-slate-600 border border-transparent"
                      }`}
                    >
                      <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{cat.name}</span>
                    </button>
                    <div className="flex items-center gap-1 pr-2">
                      <span className="bg-white px-2 py-0.5 rounded-full text-[9px] text-slate-500 border border-slate-200/80 font-bold min-w-5 text-center shadow-2xs">
                        {serviceCount}
                      </span>
                      {userRole === "owner" && (
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all text-center cursor-pointer opacity-0 group-hover/cat:opacity-100 active:scale-95"
                          title="Cancella Categoria"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Services List (Right 3 Cols) */}
        <div className="lg:col-span-3 space-y-4">
          
          {categories.length === 0 && (
            <div className="p-4.5 rounded-3xl bg-amber-50/90 border border-amber-200/80 text-amber-800 text-xs font-semibold flex items-start gap-3 shadow-2xs">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">Nessuna categoria inserita!</p>
                <p className="font-medium mt-0.5 text-amber-900/80 leading-relaxed">
                  Crea una categoria nel pannello di sinistra con l'apposito tasto "+" prima di poter inserire o configurare servizi.
                </p>
              </div>
            </div>
          )}

          {filteredServices.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200/60 flex items-center justify-center mx-auto mb-4 text-slate-400 shadow-2xs">
                <Scissors className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#1a2035] tracking-tight mb-1">
                Nessun servizio in questa categoria
              </h3>
              <p className="text-slate-500 text-xs max-w-xs mx-auto mb-5 leading-relaxed">
                Utilizza il pulsante in alto a destra "Nuovo Servizio" per inserire la prima voce di listino.
              </p>
              {categories.length > 0 && (
                <button
                  onClick={openCreateServiceModal}
                  className="bg-[#1a3a8f] text-white rounded-2xl text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 px-5 py-2.5 hover:bg-[#152f73] transition-all active:scale-[0.98] cursor-pointer"
                >
                  Crea Servizio
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredServices.map((service) => (
                <div 
                  key={service.id}
                  className="bg-white border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group relative"
                >
                  {/* Actions inside card */}
                  {userRole === "owner" && (
                    <div className="absolute top-4.5 right-4.5 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditServiceModal(service)}
                        className="p-2 text-slate-400 hover:text-[#1a3a8f] hover:bg-slate-100 rounded-xl transition-all active:scale-95 shadow-2xs border border-transparent hover:border-slate-200/80"
                        title="Modifica Servizio"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteService(service.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95 shadow-2xs border border-transparent hover:border-red-200/60"
                        title="Elimina Servizio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div>
                    {/* Header info */}
                    <div className="pr-20 mb-3">
                      <span className="inline-block px-3 py-0.5 bg-[#eef2ff] text-[#1a3a8f] border border-[#1a3a8f]/15 rounded-full text-[9px] font-bold uppercase tracking-wider mb-2 shadow-2xs">
                        {categoryMap[service.categoryId] || "Altro"}
                      </span>
                      <h4 className="text-base font-bold text-[#1a2035] tracking-tight leading-snug">
                        {service.name}
                      </h4>
                    </div>

                    {/* Specifications */}
                    <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-semibold">
                      <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50/90 px-3 py-1 rounded-full border border-emerald-200/70 shadow-2xs">
                        <DollarSign className="w-3.5 h-3.5 shrink-0" />
                        <span>€{service.price?.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/70 text-slate-700 px-3 py-1 rounded-full shadow-2xs">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span>{service.duration} Min</span>
                      </div>
                      {service.commissionPercentage !== undefined && service.commissionPercentage > 0 && (
                        <div className="flex items-center gap-1 bg-[#eef2ff] border border-[#1a3a8f]/15 text-[#1a3a8f] px-3 py-1 rounded-full shadow-2xs">
                          <Percent className="w-3.5 h-3.5 shrink-0 text-[#1a3a8f]" />
                          <span>Provv: {service.commissionPercentage}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sedi in cui è disponibile */}
                  <div className="pt-3 border-t border-slate-100">
                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Store className="w-3 h-3 text-slate-400" />
                      Sedi operative associate:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {salons.length === 0 ? (
                        <span className="text-[10px] text-red-500 font-medium">Nessun salone configurato</span>
                      ) : (
                        service.salonIds?.map(id => {
                          const sName = salonsMap[id];
                          if (!sName) return null;
                          return (
                            <span 
                              key={id}
                              className="px-2.5 py-0.5 bg-[#eef2ff]/70 text-[#1a3a8f] border border-[#1a3a8f]/15 rounded-xl text-[10px] font-semibold shadow-2xs"
                            >
                              {sName}
                            </span>
                          );
                        })
                      )}
                      {(!service.salonIds || service.salonIds.length === 0) && (
                        <span className="text-[10px] text-amber-600 font-semibold italic">Nessun salone collegato!</span>
                      )}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Service create/edit modal */}
      {serviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 md:pt-20 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setServiceModalOpen(false)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-lg rounded-3xl shadow-2xl z-10 overflow-hidden animate-fadeIn flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-xs flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3a8f] block">
                  {selectedService ? "Modifica Listino" : "Nuovo Trattamento"}
                </span>
                <h3 className="text-xl font-bold text-[#1a2035] tracking-tight">
                  {selectedService ? "Modifica Servizio Trattamento" : "Aggiungi Servizio nel Listino"}
                </h3>
              </div>
              <button 
                onClick={() => setServiceModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 rounded-2xl transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error callout */}
            {errorMsg && (
              <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200/80 text-red-700 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveService} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Nome Servizio *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es: Taglio Capelli Sfumato, Barba Premium & Panno Caldo"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium text-[#1a2035]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Prezzo (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="Es: 25.00"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium text-[#1a2035]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Durata Stimata (Minuti) *
                  </label>
                  <select
                    value={serviceDuration}
                    onChange={(e) => setServiceDuration(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all font-medium text-[#1a2035] cursor-pointer"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min (1 ora)</option>
                    <option value="90">90 min</option>
                    <option value="120">120 min (2 ore)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Percentuale Collaboratore (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="Es: 10"
                    value={serviceCommissionPercentage}
                    onChange={(e) => setServiceCommissionPercentage(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium text-[#1a2035] pr-10"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Percent className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  La percentuale di provvigione spettante al collaboratore che esegue questo servizio.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Categoria Trattamento *
                </label>
                <select
                  required
                  value={serviceCategoryId}
                  onChange={(e) => setServiceCategoryId(e.target.value)}
                  className="w-full bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-sm focus:border-[#1a3a8f] focus:bg-white outline-none transition-all font-medium text-[#1a2035] cursor-pointer"
                >
                  <option value="" disabled>Seleziona una categoria</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Visibilità e Associazione Sedi *
                </label>
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
                  {salons.map((salon) => (
                    <label 
                      key={salon.id}
                      className="flex items-center gap-3 text-xs font-semibold text-slate-700 cursor-pointer hover:text-[#1a3a8f] selection:bg-none"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSalonIds.includes(salon.id)}
                        onChange={() => toggleSalonSelection(salon.id)}
                        className="w-4 h-4 text-[#1a3a8f] border-slate-300 rounded focus:ring-0 cursor-pointer accent-[#1a3a8f]"
                      />
                      <span>{salon.name} <span className="text-[10px] text-slate-400 font-normal">({salon.address})</span></span>
                    </label>
                  ))}
                  {salons.length === 0 && (
                    <p className="text-red-500 text-xs font-bold leading-tight">
                      Devi creare almeno una sede operativa nella pagina "I miei Saloni" per associare il servizio.
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 mt-6">
                <div>
                  {selectedService && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteService(selectedService.id);
                        setServiceModalOpen(false);
                      }}
                      className="px-3.5 py-2 border border-red-200/80 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 text-red-700 rounded-2xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Elimina Servizio
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setServiceModalOpen(false)}
                    className="px-4 py-2 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={savingService || salons.length === 0}
                    className="bg-[#1a3a8f] hover:bg-[#152f73] disabled:opacity-50 text-white rounded-2xl px-5 py-2 text-xs font-semibold shadow-sm shadow-[#1a3a8f]/20 flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {savingService ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Salvataggio...
                      </>
                    ) : (
                      "Salva Servizio"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Custom delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setDeleteTarget(null)} />
          
          <div className="relative bg-white border border-slate-200/80 w-full max-w-md rounded-3xl shadow-2xl z-10 overflow-hidden p-6 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200/60 flex items-center justify-center text-red-600 shrink-0 shadow-2xs">
                <AlertCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="text-lg font-bold text-[#1a2035] tracking-tight leading-tight">
                  {deleteTarget.type === "category_blocked" 
                    ? "Eliminazione Categoria Bloccata" 
                    : deleteTarget.type === "category" 
                      ? "Conferma Eliminazione Categoria" 
                      : "Conferma Eliminazione Servizio"}
                </h3>
                
                <p className="text-xs text-slate-500 leading-relaxed">
                  {deleteTarget.type === "category_blocked" ? (
                    <>
                      Impossibile eliminare la categoria <strong className="text-slate-800">"{deleteTarget.name}"</strong> perché ci sono ancora trattamenti o servizi ad essa associati. Riassegna o elimina prima tutti i servizi appartenenti a questa categoria.
                    </>
                  ) : deleteTarget.type === "category" ? (
                    <>
                      Sei sicuro di voler eliminare definitivamente la categoria <strong className="text-slate-800">"{deleteTarget.name}"</strong>? Questa operazione non potrà essere annullata.
                    </>
                  ) : (
                    <>
                      Sei sicuro di voler eliminare dal listino il servizio <strong className="text-slate-800">"{deleteTarget.name}"</strong>? Questa operazione rimuoverà il servizio da tutte le sedi operative collegate.
                    </>
                  )}
                </p>

                {deleteError && (
                  <p className="text-xs font-semibold text-red-600 mt-2 bg-red-50 p-2.5 rounded-2xl border border-red-200/80">
                    {deleteError}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              {deleteTarget.type === "category_blocked" ? (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="bg-[#1a3a8f] text-white hover:bg-[#152f73] rounded-2xl px-5 py-2 text-xs font-semibold cursor-pointer transition-all active:scale-[0.98] shadow-sm shadow-[#1a3a8f]/20"
                >
                  Ho capito
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setDeleteTarget(null)}
                    className="bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-600 rounded-2xl px-4 py-2 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-2xs"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleConfirmDelete}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-5 py-2 text-xs font-bold shadow-sm shadow-red-900/20 flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Eliminazione...
                      </>
                    ) : (
                      "Conferma ed Elimina"
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
