import React, { useState, useEffect, useMemo, useRef } from "react";
import { useBusiness } from "../context/BusinessContext";
import { 
  collection, 
  doc, 
  updateDoc, 
  setDoc,
  addDoc,
  query, 
  where, 
  onSnapshot,
  getDocs
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  X, 
  Loader2, 
  AlertCircle, 
  Calendar, 
  Clock, 
  User as UserIcon, 
  Scissors, 
  DollarSign, 
  CreditCard, 
  Banknote,
  FileCheck,
  Store,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  ShoppingCart,
  Plus,
  Trash2,
  Package,
  Sparkles,
  Zap
} from "lucide-react";
import { Appointment, CustomPrice, TeamMember, Service, ProductSaleItem } from "../types";
import { isFlashSlotAppointment } from "../utils/flashSlotClient";

interface FinalizeCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment;
  onSuccess: (updatedAppt: Appointment) => void;
}

export default function FinalizeCheckoutModal({ 
  isOpen, 
  onClose,
  appointment,
  onSuccess
}: FinalizeCheckoutModalProps) {
  const { user, salons, services, customers, ownerId, userRole, userSalonIds, businessSettings } = useBusiness();

  // Form Fields pre-filled with appointment values
  const [salonId, setSalonId] = useState(appointment.salonId || "");
  const [customerId, setCustomerId] = useState(appointment.customerId || "");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceCollaborators, setServiceCollaborators] = useState<Record<string, string[]>>({});
  const [isServicesDropdownOpen, setIsServicesDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedStaffNames, setSelectedStaffNames] = useState<string[]>([]);
  const [date, setDate] = useState(appointment.date || "");
  const [time, setTime] = useState(appointment.time || "");
  const [price, setPrice] = useState<number>(appointment.price || 0);
  const [paymentMethod, setPaymentMethod] = useState<"bancomat" | "contanti" | "">("");

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // AI Up-selling states
  const [upsellRecommendations, setUpsellRecommendations] = useState<any[]>([]);
  const [upsellLoading, setUpsellLoading] = useState(false);
  const [daysOfHistory, setDaysOfHistory] = useState<number>(0);

  // Product sales additions
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<ProductSaleItem[]>([]);
  const [currentProductId, setCurrentProductId] = useState("");
  const [currentProductQty, setCurrentProductQty] = useState(1);
  const [currentProductStaffs, setCurrentProductStaffs] = useState<string[]>([]);

  // Subscribe to real-time inventory list
  useEffect(() => {
    if (!ownerId || !isOpen) return;
    setInventoryLoading(true);
    const q = query(collection(db, "inventory"), where("ownerId", "==", ownerId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as any[];
        setInventoryItems(fetched.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
        setInventoryLoading(false);
      },
      (error) => {
        console.error("Error fetching inventory:", error);
        handleFirestoreError(error, OperationType.LIST, "inventory");
        setInventoryLoading(false);
      }
    );
    return () => unsubscribe();
  }, [ownerId, isOpen]);

  // Read stock for a salon helper
  const getProductStockForSalon = (item: any, sId: string): number => {
    if (item.salonStocks && item.salonStocks[sId] !== undefined) {
      return item.salonStocks[sId];
    }
    if (!item.salonStocks || Object.keys(item.salonStocks).length === 0) {
      if (salons.length > 0 && salons[0].id === sId) {
        return item.quantity || 0;
      }
    }
    return 0;
  };

  // Dynamic Services subtotal
  const servicesTotal = useMemo(() => {
    return selectedServiceIds.reduce((total, sId) => {
      const s = services.find(srv => srv.id === sId);
      return total + (s ? s.price : 0);
    }, 0);
  }, [selectedServiceIds, services]);

  // Dynamic Products subtotal
  const productsTotal = useMemo(() => {
    return selectedProducts.reduce((total, p) => {
      return total + (p.price * p.quantity);
    }, 0);
  }, [selectedProducts]);

  // Adapt overall checkout price dynamically based on services total and products total
  useEffect(() => {
    setPrice(servicesTotal + productsTotal);
  }, [servicesTotal, productsTotal]);

  const handleAddProduct = () => {
    if (!currentProductId) return;
    const product = inventoryItems.find(p => p.id === currentProductId);
    if (!product) return;

    if (currentProductQty <= 0) return;

    const stockInSalon = getProductStockForSalon(product, salonId);
    if (stockInSalon < currentProductQty) {
      if (!window.confirm(`Attenzione: Scorte insufficienti in questa sede (${stockInSalon} pz disponibili). Vuoi procedere comunque?`)) {
        return;
      }
    }

    const commPct = product.commissionPercentage || 0;
    const commEarned = (product.price * currentProductQty) * (commPct / 100);

    const assignedStaff = currentProductStaffs.length > 0 ? currentProductStaffs.join(", ") : "Qualsiasi";

    const newItem: ProductSaleItem = {
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: currentProductQty,
      staffName: assignedStaff,
      commissionPercentage: commPct,
      commissionEarned: commEarned
    };

    setSelectedProducts(prev => {
      const existingIdx = prev.findIndex(item => item.productId === product.id && item.staffName === newItem.staffName);
      if (existingIdx > -1) {
        const updated = [...prev];
        const nextQty = updated[existingIdx].quantity + currentProductQty;
        const nextCommEarned = (updated[existingIdx].price * nextQty) * (commPct / 100);
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: nextQty,
          commissionEarned: nextCommEarned
        };
        return updated;
      }
      return [...prev, newItem];
    });

    // Reset current selection fields
    setCurrentProductId("");
    setCurrentProductQty(1);
    setCurrentProductStaffs([]);
  };

  const handleRemoveProduct = (productId: string, staffName?: string) => {
    setSelectedProducts(prev => prev.filter(p => !(p.productId === productId && p.staffName === staffName)));
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsServicesDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Populate staff and service IDs from appointment
  useEffect(() => {
    if (isOpen) {
      if (appointment.staffName) {
        if (appointment.staffName === "Qualsiasi" || appointment.staffName.trim() === "") {
          setSelectedStaffNames([]);
        } else {
          const names = appointment.staffName.split(",").map(n => n.trim()).filter(Boolean);
          setSelectedStaffNames(names);
        }
      } else {
        setSelectedStaffNames([]);
      }

      if (appointment.serviceId) {
        const ids = appointment.serviceId.split(",").map(id => id.trim()).filter(Boolean);
        setSelectedServiceIds(ids);
        
        // Also pre-fill collaborator mapping
        const defaultStaff = appointment.staffName && appointment.staffName !== "Qualsiasi" 
          ? appointment.staffName.split(",").map(n => n.trim()).filter(Boolean) 
          : [];
        const mapping: Record<string, string[]> = {};
        ids.forEach(id => {
          mapping[id] = defaultStaff;
        });
        setServiceCollaborators(mapping);
      } else {
        setSelectedServiceIds([]);
        setServiceCollaborators({});
      }
    }
  }, [isOpen, appointment.staffName, appointment.serviceId]);

  // AI Up-selling suggest trigger on open or when salon/customer changes
  useEffect(() => {
    if (!isOpen || !customerId || !ownerId) {
      setUpsellRecommendations([]);
      return;
    }

    const fetchUpsellSuggestion = async () => {
      setUpsellLoading(true);
      setUpsellRecommendations([]);
      try {
        // Resolve initial service names
        let initialServiceNames: string[] = [];
        if (appointment.serviceId) {
          const ids = appointment.serviceId.split(",").map(id => id.trim()).filter(Boolean);
          initialServiceNames = ids.map(id => {
            const s = services.find(srv => srv.id === id);
            return s ? s.name : "";
          }).filter(Boolean);
        }

        // 1. Query past completed appointments for this customer
        const qAppts = query(
          collection(db, "appointments"),
          where("ownerId", "==", ownerId),
          where("customerId", "==", customerId),
          where("status", "==", "completed")
        );
        // 2. Query past product sales for this customer
        const qSales = query(
          collection(db, "product_sales"),
          where("ownerId", "==", ownerId),
          where("customerId", "==", customerId)
        );

        const currentCustomer = customers.find(c => c.id === customerId);
        const customerNotes = currentCustomer?.notes || "";

        interface HistoryItem {
          type: "service" | "product";
          name: string;
          date: string;
        }

        let historyItems: HistoryItem[] = [];
        try {
          const apptsSnap = await getDocs(qAppts);
          apptsSnap.forEach(d => {
            const data = d.data();
            if (data.serviceName) {
              historyItems.push({
                type: "service",
                name: data.serviceName,
                date: data.date || ""
              });
            }
          });
        } catch (e) {
          console.warn("Failed to fetch past appointments history:", e);
        }

        try {
          const salesSnap = await getDocs(qSales);
          salesSnap.forEach(d => {
            const data = d.data();
            if (data.productName) {
              historyItems.push({
                type: "product",
                name: data.productName,
                date: data.date || ""
              });
            }
          });
        } catch (e) {
          console.warn("Failed to fetch past product sales history:", e);
        }

        // Keep most recent history first or sorted by date descending
        historyItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const limitedHistory = historyItems.slice(0, 10);

        let calculatedDays = 0;
        if (historyItems.length > 0) {
          const dates = historyItems
            .map(h => h.date ? new Date(h.date).getTime() : 0)
            .filter(t => t > 0);
          if (dates.length > 0) {
            const oldestTime = Math.min(...dates);
            const todayTime = Date.now();
            calculatedDays = Math.floor((todayTime - oldestTime) / (1000 * 60 * 60 * 24));
          }
        }
        setDaysOfHistory(calculatedDays);

        const isEliteAI = businessSettings?.userPlan === "elite_ai" || businessSettings?.userPlan === "unlimited";

        if (calculatedDays >= 20 && isEliteAI) {
          // Filter products with stock > 0 for this salon
          const availableProductsInSalon = inventoryItems
            .filter(item => getProductStockForSalon(item, salonId) > 0)
            .map(item => ({
              id: item.id,
              name: item.name,
              price: item.price,
              stock: getProductStockForSalon(item, salonId),
              category: item.category || ""
            }));

          const response = await fetch("/api/upsell/suggest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              services: initialServiceNames,
              customerHistory: limitedHistory,
              availableProducts: availableProductsInSalon,
              customerNotes,
              currentDate: new Date().toISOString().split("T")[0]
            })
          });

          if (response.ok) {
            const resData = await response.json();
            if (resData.success && Array.isArray(resData.recommendations)) {
              setUpsellRecommendations(resData.recommendations);
            }
          }
        } else {
          setUpsellRecommendations([]);
        }
      } catch (err) {
        console.error("Error loading upsell suggestion:", err);
      } finally {
        setUpsellLoading(false);
      }
    };

    fetchUpsellSuggestion();
  }, [isOpen, customerId, ownerId, appointment.serviceId, services, customers, inventoryItems, salonId, businessSettings]);

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
        if (userRole === "receptionist" && userSalonIds && userSalonIds.length > 0) {
          filtered = uniqueList.filter(t => t.salonIds && t.salonIds.some(id => userSalonIds.includes(id)));
        }
        setTeam(filtered);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "team");
      }
    );
    return () => unsub();
  }, [ownerId, isOpen, userRole, userSalonIds]);

  // Retrieve current active salon
  const selectedSalonObj = useMemo(() => {
    return salons.find(s => s.id === salonId) || null;
  }, [salons, salonId]);

  // Filtered Customers based on selected salonId
  const filteredCustomers = useMemo(() => {
    if (!salonId) return [];
    return customers.filter(c => c.salonId === salonId);
  }, [customers, salonId]);

  // Filtered Services based on current salonId
  const filteredServices = useMemo(() => {
    let list = services;
    if (salonId) {
      list = list.filter(s => !s.salonIds || s.salonIds.length === 0 || s.salonIds.includes(salonId));
    }
    return list;
  }, [services, salonId]);

  // Filtered team members based on selected salonId
  const filteredTeam = useMemo(() => {
    if (!salonId) return team;
    return team.filter(m => m.salonIds && m.salonIds.includes(salonId));
  }, [team, salonId]);

  // Toggle service selection helper with dynamic price calculation
  const toggleServiceSelection = (id: string) => {
    setSelectedServiceIds(prev => {
      const isSelected = prev.includes(id);
      const updated = isSelected ? prev.filter(x => x !== id) : [...prev, id];
      
      // Update collaborator mapping
      setServiceCollaborators(prevMap => {
        const nextMap = { ...prevMap };
        if (isSelected) {
          delete nextMap[id];
        } else {
          const defaultStaff = appointment.staffName && appointment.staffName !== "Qualsiasi"
            ? appointment.staffName.split(",").map(n => n.trim()).filter(Boolean)
            : [];
          nextMap[id] = defaultStaff;
        }
        return nextMap;
      });

      // Calculate dynamic price based on updated list
      const sum = updated.reduce((total, sId) => {
        const s = services.find(srv => srv.id === sId);
        return total + (s ? s.price : 0);
      }, 0);
      setPrice(sum);
      
      return updated;
    });
  };

  // Toggle staff selection helper
  const toggleStaffSelection = (name: string) => {
    setSelectedStaffNames(prev => {
      if (prev.includes(name)) {
        return prev.filter(x => x !== name);
      } else {
        return [...prev, name];
      }
    });
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!paymentMethod) {
      setErrorMsg("Seleziona obbligatoriamente il metodo di pagamento (Contanti o Bancomat).");
      return;
    }
    if (!salonId) {
      setErrorMsg("Seleziona un salone valido.");
      return;
    }
    if (!customerId) {
      setErrorMsg("Seleziona un cliente valido.");
      return;
    }
    if (selectedServiceIds.length === 0) {
      setErrorMsg("Seleziona almeno un servizio per procedere.");
      return;
    }
    // Validate service collaborators are assigned
    for (const sId of selectedServiceIds) {
      if (!serviceCollaborators[sId] || serviceCollaborators[sId].length === 0) {
        setErrorMsg(`Seleziona almeno un collaboratore per ciascuno dei servizi selezionati.`);
        return;
      }
    }
    if (!date) {
      setErrorMsg("Data non valida.");
      return;
    }
    if (!time) {
      setErrorMsg("Orario non valida.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const chosenCustomer = customers.find(c => c.id === customerId);
      const chosenServices = selectedServiceIds
        .map(id => services.find(s => s.id === id))
        .filter(Boolean);

      if (!chosenCustomer || chosenServices.length === 0) {
        setErrorMsg("Errore di correlazione: cliente o servizi non trovati.");
        setSaving(false);
        return;
      }

      let serviceNameJoined = chosenServices.map(s => s!.name).join(", ");
      if (serviceNameJoined.length > 128) {
        serviceNameJoined = serviceNameJoined.substring(0, 125) + "...";
      }

      const serviceIdJoined = selectedServiceIds.join(",");
      const totalDuration = chosenServices.reduce((sum, s) => sum + (s!.duration || 0), 0);

      // Build servicesPerformed array with commissions
      const servicesPerformed = chosenServices.map(srv => {
        const sId = srv!.id;
        const sPrice = srv!.price;
        const assignedStaffList = serviceCollaborators[sId] || [];
        const assignedStaff = assignedStaffList.length > 0 ? assignedStaffList.join(", ") : "Qualsiasi";
        const commPct = srv!.commissionPercentage || 0;
        const commEarned = sPrice * (commPct / 100);
        return {
          serviceId: sId,
          serviceName: srv!.name,
          price: sPrice,
          staffName: assignedStaff,
          commissionPercentage: commPct,
          commissionEarned: commEarned
        };
      });

      const checkoutPromise = (async () => {
        // 1. Decrement stock for each selected product in Firestore
        for (const prodSale of selectedProducts) {
          const prodDoc = inventoryItems.find(p => p.id === prodSale.productId);
          if (prodDoc) {
            const currentStocks = prodDoc.salonStocks || {};
            const currentStockInSalon = getProductStockForSalon(prodDoc, salonId);
            const nextStock = Math.max(0, currentStockInSalon - prodSale.quantity);

            const updatedStocks = {
              ...currentStocks,
              [salonId]: nextStock
            };

            // Recalculate total quantity across all salons
            const totalQty = Object.values(updatedStocks).reduce((a: any, b: any) => Number(a) + Number(b), 0);

            await updateDoc(doc(db, "inventory", prodDoc.id), {
              salonStocks: updatedStocks,
              quantity: totalQty
            });
          }
        }

        // 2. Register individual sales in the "product_sales" collection
        const chosenSalonObj = salons.find(s => s.id === salonId);
        for (const prodSale of selectedProducts) {
          const commPct = prodSale.commissionPercentage || 0;
          const commEarned = prodSale.commissionEarned || 0;

          await addDoc(collection(db, "product_sales"), {
            appointmentId: appointment.id,
            customerId,
            customerName: chosenCustomer.name,
            salonId,
            salonName: chosenSalonObj?.name || "",
            productId: prodSale.productId,
            productName: prodSale.name,
            price: prodSale.price,
            quantity: prodSale.quantity,
            total: prodSale.price * prodSale.quantity,
            staffName: prodSale.staffName || "Qualsiasi",
            commissionPercentage: commPct,
            commissionEarned: commEarned,
            date,
            time,
            paymentMethod,
            ownerId,
            createdAt: new Date()
          });
        }

        const updatedFields: Partial<Appointment> = {
          customerId,
          customerName: chosenCustomer.name,
          serviceId: serviceIdJoined,
          serviceName: serviceNameJoined,
          salonId,
          staffName: selectedStaffNames.length > 0 ? selectedStaffNames.join(", ") : "Qualsiasi",
          date,
          time,
          price: Number(price),
          duration: totalDuration > 0 ? totalDuration : appointment.duration,
          status: "completed",
          paymentMethod: paymentMethod as "bancomat" | "contanti",
          productsPrice: productsTotal,
          productsSold: selectedProducts,
          servicesPerformed: servicesPerformed,
          ownerId: appointment.ownerId || ownerId || ""
        };

        // Perform update in Firestore
        await updateDoc(doc(db, "appointments", appointment.id), updatedFields);

        // 3. Schedule "Filtro Verità" (Smart Reputation Shield) via WhatsApp/SMS (+40 min timer)
        try {
          const salonObj = salons.find(s => s.id === salonId);
          fetch("/api/feedback-shield/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              salonId,
              salonName: salonObj?.name || "Salone SforbiciaSmart",
              ownerId: appointment.ownerId || ownerId || "",
              appointmentId: appointment.id,
              customerId,
              customerName: chosenCustomer.name,
              customerPhone: chosenCustomer.phone,
              serviceName: serviceNameJoined,
              staffName: selectedStaffNames.length > 0 ? selectedStaffNames.join(", ") : "Qualsiasi",
              googleReviewUrl: salonObj?.googleReviewUrl || "",
              channel: "whatsapp",
              delayMinutes: 40,
            }),
          })
            .then(res => res.json())
            .then(async (data) => {
              if (data?.success && data.id && (appointment.ownerId || ownerId)) {
                try {
                  await setDoc(doc(db, "feedback_shield_requests", data.id), {
                    id: data.id,
                    salonId,
                    salonName: salonObj?.name || "Salone SforbiciaSmart",
                    ownerId: appointment.ownerId || ownerId || "",
                    appointmentId: appointment.id,
                    customerId,
                    customerName: chosenCustomer.name,
                    customerPhone: chosenCustomer.phone,
                    serviceName: serviceNameJoined,
                    staffName: selectedStaffNames.length > 0 ? selectedStaffNames.join(", ") : "Qualsiasi",
                    googleReviewUrl: salonObj?.googleReviewUrl || "",
                    status: data.status || "scheduled",
                    scheduledFor: data.scheduledFor || new Date(Date.now() + 40 * 60 * 1000).toISOString(),
                    channel: "whatsapp",
                    token: data.token,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }, { merge: true });
                } catch (e) {
                  // Ignore
                }
              }
            })
            .catch((err) => {
              console.warn("[Filtro Verità] Background scheduling error:", err);
            });
        } catch (e) {
          // Non-blocking
        }

        return updatedFields;
      })();

      // Se siamo offline, o se la rete impiega più di 1 secondo,
      // chiudiamo il modal e lasciamo che la cache locale di Firestore aggiorni la UI.
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await Promise.race([checkoutPromise, timeoutPromise]);

      const finalUpdatedFields = (result || {
        customerId,
        customerName: chosenCustomer.name,
        serviceId: serviceIdJoined,
        serviceName: serviceNameJoined,
        salonId,
        staffName: selectedStaffNames.length > 0 ? selectedStaffNames.join(", ") : "Qualsiasi",
        date,
        time,
        price: Number(price),
        duration: totalDuration > 0 ? totalDuration : appointment.duration,
        status: "completed",
        paymentMethod: paymentMethod as "bancomat" | "contanti",
        productsPrice: productsTotal,
        productsSold: selectedProducts,
        servicesPerformed: servicesPerformed,
        ownerId: appointment.ownerId || ownerId || ""
      }) as Partial<Appointment>;

      // Callback with fully updated object
      onSuccess({
        ...appointment,
        ...finalUpdatedFields
      } as Appointment);

      onClose();
    } catch (err: any) {
      console.error("Error finalizing appointment check-out:", err);
      setErrorMsg("Impossibile salvare i dati della cassa: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-55 flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Box */}
      <div className="relative bg-white border border-gray-100 w-full max-w-xl rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#1a3a8f]/10 text-[#1a3a8f] flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-[#1a3a8f]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
                  Cassa e Finalizzazione
                </span>
                {isFlashSlotAppointment(appointment) && (
                  <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5 text-amber-600 fill-amber-500" />
                    Flash Slot
                  </span>
                )}
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1a2035] leading-tight mt-0.5">
                Check-out: {appointment.customerName}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Panel (Form) */}
        <form onSubmit={handleCheckoutSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          {isFlashSlotAppointment(appointment) && (
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-start gap-3 text-xs text-amber-900 shadow-3xs">
              <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4 text-amber-600 fill-amber-500" />
              </div>
              <div className="space-y-0.5">
                <p className="font-extrabold uppercase tracking-wide text-[10px] text-amber-900">
                  Cliente Prenotato tramite Magic Link (Flash Slot) ⚡
                </p>
                <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                  Il prezzo era segnato come <strong>"da definire"</strong>. Seleziona qui sotto i trattamenti effettivamente eseguiti per calcolare il totale e procedere all'incasso.
                </p>
              </div>
            </div>
          )}

          <div className="bg-amber-50/40 border border-amber-100 p-3 rounded-2xl text-[11px] text-amber-800 leading-relaxed">
            ✏️ <strong>Verifica o modifica i dettagli del servizio</strong> prima di procedere con l'incasso. Seleziona obbligatoriamente il metodo di pagamento per completare.
          </div>

          {/* Trattamenti Selezionati & Selezione multipla */}
          <div className="space-y-3 p-4 border border-indigo-100 rounded-2xl bg-indigo-50/20">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-[#1a3a8f] uppercase tracking-wider flex items-center gap-1">
                <Scissors className="w-3.5 h-3.5 text-[#1a3a8f]" /> Servizi / Trattamenti del Check-out
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                  {selectedServiceIds.length} Selezionati
                </span>
                {selectedServiceIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedServiceIds([]);
                      setPrice(0);
                    }}
                    className="text-[9px] font-bold text-red-600 hover:text-red-800 transition-colors cursor-pointer bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md border border-red-200/50"
                  >
                    Azzera
                  </button>
                )}
              </div>
            </div>

            {/* Flat Grid of Clickable Service Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1.5 border border-slate-200/60 rounded-xl bg-white shadow-inner">
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
                      onClick={() => toggleServiceSelection(s.id)}
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

            {/* Assegnazione Collaboratori ai Servizi */}
            {selectedServiceIds.length > 0 && (
              <div className="pt-3 border-t border-indigo-100/60 space-y-2">
                <span className="block text-[10px] font-black uppercase tracking-widest text-[#1a3a8f]">
                  Chi ha eseguito i servizi? * (Seleziona uno o più dipendenti)
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedServiceIds.map((sId) => {
                    const s = services.find(srv => srv.id === sId);
                    if (!s) return null;
                    const assignedStaffList = serviceCollaborators[sId] || [];
                    return (
                      <div key={sId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 px-4 rounded-xl border border-slate-100 shadow-3xs">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-gray-800 truncate">{s.name}</div>
                          <div className="text-[10px] text-gray-400 font-medium">
                            €{s.price} {s.commissionPercentage !== undefined && s.commissionPercentage > 0 ? `| Provv: ${s.commissionPercentage}%` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 max-w-xs sm:justify-end">
                          {filteredTeam.length === 0 ? (
                            <span className="text-[10px] text-gray-400">Nessun dipendente</span>
                          ) : (
                            filteredTeam.map((m) => {
                              const isAssigned = assignedStaffList.includes(m.name);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setServiceCollaborators(prev => {
                                      const current = prev[sId] || [];
                                      const updated = current.includes(m.name)
                                        ? current.filter(name => name !== m.name)
                                        : [...current, m.name];
                                      return { ...prev, [sId]: updated };
                                    });
                                  }}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                    isAssigned
                                      ? "bg-indigo-600 border-indigo-700 text-white shadow-3xs scale-[1.03]"
                                      : "bg-slate-50 border-gray-200 text-gray-600 hover:bg-slate-100"
                                  }`}
                                >
                                  {m.name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* SECONDA SCHEDA / SEZIONE: Vendita Prodotti */}
          <div className="space-y-4 p-4 border border-emerald-100 rounded-2xl bg-emerald-50/10">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                Vendita Prodotti al Cliente (Opzionale)
              </label>
              {selectedProducts.length > 0 && (
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                  {selectedProducts.length} Prodott{selectedProducts.length === 1 ? "o" : "i"} (€{productsTotal.toFixed(2)})
                </span>
              )}
            </div>

            {/* AI UP-SELLING SUGGESTION BOX (SUGGERITORE INTEGRATO) */}
            {businessSettings?.userPlan !== "elite_ai" && businessSettings?.userPlan !== "unlimited" ? (
              <div className="bg-gradient-to-br from-amber-50/40 via-white to-indigo-50/20 border border-amber-200/60 rounded-xl p-3.5 space-y-2 shadow-3xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                      AI Suggeritore Up-selling
                    </span>
                  </div>
                  <span className="text-[8px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Esclusivo Elite AI
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                  L'AI Suggeritore Up-selling analizza automaticamente lo storico di questo cliente (<span className="text-indigo-600 font-extrabold">{daysOfHistory} giorni</span> registrati) per consigliarti prodotti mirati e incrementare lo scontrino medio del salone.
                </p>
                <div className="pt-1 border-t border-slate-100/50 flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 font-medium">Disponibile a partire dal piano <strong>Elite AI</strong>.</span>
                </div>
              </div>
            ) : upsellLoading ? (
              <div className="flex items-center gap-2 py-2 px-3 bg-white/70 border border-indigo-100 rounded-xl">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 animate-pulse">
                  Ricerca abbinamenti intelligenti e storico acquisti...
                </span>
              </div>
            ) : (upsellRecommendations.length > 0 && daysOfHistory >= 20) ? (
              <div className="bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/30 border border-indigo-150/80 rounded-xl p-3.5 space-y-2.5 shadow-3xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">
                      Prodotti Consigliati (AI Suggeritore)
                    </span>
                  </div>
                  <span className="text-[9px] bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.5 rounded-full uppercase">
                    Consigli Mirati
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {upsellRecommendations.map((rec, idx) => {
                    const productStock = inventoryItems.find(p => p.id === rec.productId);
                    const stockVal = productStock ? getProductStockForSalon(productStock, salonId) : 0;
                    return (
                      <div key={idx} className="bg-white/90 border border-slate-100 rounded-lg p-2.5 flex flex-col gap-1 shadow-4xs">
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="text-[11px] font-extrabold text-slate-900 leading-tight">
                            {rec.productName}
                          </span>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                            rec.badge?.toLowerCase().includes("finito") || rec.badge?.toLowerCase().includes("esaurimento")
                              ? "bg-amber-50 text-amber-800 border border-amber-100"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-100"
                          }`}>
                            {rec.badge || "Consigliato"}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-500 font-semibold leading-normal">
                          {rec.reason}
                        </p>
                        <div className="text-[9px] text-slate-400 font-medium flex items-center justify-between mt-1 pt-1 border-t border-slate-100/60">
                          <span>Prezzo: <span className="font-bold text-slate-600">€{productStock?.price ? productStock.price.toFixed(2) : "-"}</span></span>
                          <span>Disp: <span className="font-bold text-slate-600">{stockVal} pz</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-indigo-50/30 via-white to-slate-50/20 border border-indigo-100/60 rounded-xl p-3.5 space-y-1.5 shadow-3xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-black text-indigo-700/80 uppercase tracking-wider">
                      Suggeritore AI
                    </span>
                  </div>
                </div>
                {daysOfHistory < 20 ? (
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                    Non ci sono ancora almeno 20 giorni di dati storici per questo cliente per proporre consigli di up-selling mirati. (Attualmente registrati: <span className="font-extrabold text-indigo-600">{daysOfHistory} giorni</span> di storico, il sistema richiede almeno 20 giorni).
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                    Nessun consiglio di up-selling mirato individuato per i servizi eseguiti oggi, nonostante siano presenti sufficienti dati storici (<span className="font-extrabold text-indigo-600">{daysOfHistory} giorni</span> di storico).
                  </p>
                )}
              </div>
            )}

            {/* Input form to add a product */}
            <div className="bg-white p-3.5 border border-emerald-50 rounded-xl space-y-3 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Product Dropdown Selector */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Prodotto</span>
                  <select
                    value={currentProductId}
                    onChange={(e) => {
                      setCurrentProductId(e.target.value);
                      setCurrentProductQty(1);
                    }}
                    className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden transition-all cursor-pointer"
                  >
                    <option value="">Seleziona un Prodotto...</option>
                    {inventoryItems.map((prod) => {
                      const stockVal = getProductStockForSalon(prod, salonId);
                      return (
                        <option key={prod.id} value={prod.id} disabled={stockVal <= 0}>
                          {prod.name} ({prod.brand}) — €{prod.price} [Disponibili: {stockVal} pz]
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Staff Dropdown Selector */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dipendenti Conclusori (Uno o più)</span>
                  <div className="flex flex-wrap gap-1 p-2 border border-gray-200 bg-slate-50 rounded-lg max-h-24 overflow-y-auto min-h-[38px]">
                    {filteredTeam.length === 0 ? (
                      <span className="text-[10px] text-gray-400">Nessun dipendente</span>
                    ) : (
                      filteredTeam.map((member) => {
                        const isSelected = currentProductStaffs.includes(member.name);
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              setCurrentProductStaffs(prev =>
                                prev.includes(member.name)
                                  ? prev.filter(x => x !== member.name)
                                  : [...prev, member.name]
                              );
                            }}
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-emerald-600 border-emerald-700 text-white shadow-3xs scale-[1.02]"
                                : "bg-white border-gray-200 text-gray-600 hover:bg-slate-50"
                            }`}
                          >
                            {member.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                {/* Quantity input */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quantità:</span>
                  <input
                    type="number"
                    min="1"
                    value={currentProductQty}
                    onChange={(e) => setCurrentProductQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 text-center bg-slate-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-800 focus:border-emerald-500 outline-hidden"
                  />
                </div>

                {/* Add Product Button */}
                <button
                  type="button"
                  onClick={handleAddProduct}
                  disabled={!currentProductId}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Aggiungi Prodotto
                </button>
              </div>
            </div>

            {/* List of Added Products */}
            {selectedProducts.length > 0 && (
              <div className="border border-emerald-100 rounded-xl overflow-hidden bg-white shadow-inner">
                <div className="max-h-36 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-emerald-50/50 border-b border-emerald-100/50 font-bold text-emerald-800 uppercase text-[9px] tracking-wider">
                        <th className="py-2 px-3">Prodotto</th>
                        <th className="py-2 px-3">Venduto da</th>
                        <th className="py-2 px-3 text-center">Quantità</th>
                        <th className="py-2 px-3 text-right">Prezzo Cad.</th>
                        <th className="py-2 px-3 text-right">Totale</th>
                        <th className="py-2 px-3 text-center">Rimuovi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-50/30">
                      {selectedProducts.map((p, idx) => (
                        <tr key={idx} className="hover:bg-emerald-50/10 transition-colors">
                          <td className="py-2 px-3 font-semibold text-gray-800">{p.name}</td>
                          <td className="py-2 px-3">
                            <span className="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {p.staffName || "Qualsiasi"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-gray-800">{p.quantity}</td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-gray-600">€{p.price.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">€{(p.price * p.quantity).toFixed(2)}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(p.productId, p.staffName)}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Sede */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Store className="w-3 h-3 text-gray-400" /> Sede Operativa
              </label>
              <select
                value={salonId}
                onChange={(e) => setSalonId(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 focus:border-[#1a3a8f] focus:ring-1 focus:ring-[#1a3a8f] focus:bg-white outline-hidden transition-all"
                required
              >
                <option value="">Seleziona Sede...</option>
                {salons.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Cliente */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <UserIcon className="w-3 h-3 text-gray-400" /> Cliente
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 focus:border-[#1a3a8f] focus:ring-1 focus:ring-[#1a3a8f] focus:bg-white outline-hidden transition-all"
                required
              >
                <option value="">Seleziona Cliente...</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Prezzo Finale */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-[#1a3a8f]" /> Importo Finale (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-[#1a3a8f] font-mono focus:border-[#1a3a8f] focus:ring-1 focus:ring-[#1a3a8f] focus:bg-white outline-hidden transition-all"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Data */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-gray-400" /> Data Giorno
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 focus:border-[#1a3a8f] focus:ring-1 focus:ring-[#1a3a8f] focus:bg-white outline-hidden transition-all"
                required
              />
            </div>

            {/* Orario */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-400" /> Orario Inizio
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 focus:border-[#1a3a8f] focus:ring-1 focus:ring-[#1a3a8f] focus:bg-white outline-hidden transition-all"
                required
              />
            </div>
          </div>

          {/* Collaboratori / Staff */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Operatori / Collaboratori Assegnati
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 border border-gray-150 rounded-xl bg-slate-50/50">
              {filteredTeam.length === 0 ? (
                <span className="text-[10px] text-gray-400 p-1">Nessun operatore disponibile per questa sede.</span>
              ) : (
                filteredTeam.map((member) => {
                  const isSelected = selectedStaffNames.includes(member.name);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleStaffSelection(member.name)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        isSelected 
                          ? "bg-indigo-600 border-indigo-700 text-white shadow-xs" 
                          : "bg-white border-gray-200 text-gray-600 hover:bg-slate-50"
                      }`}
                    >
                      {member.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* METODO DI PAGAMENTO (MANDATORY FIELD) */}
          <div className="space-y-2.5 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-black text-[#1a2035] uppercase tracking-wider">
                Metodo di Pagamento <span className="text-red-500">* Obbligatorio</span>
              </label>
              {paymentMethod && (
                <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">
                  Selezionato: {paymentMethod === "bancomat" ? "POS / Bancomat" : "Contanti"}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Card Bancomat */}
              <button
                type="button"
                onClick={() => setPaymentMethod("bancomat")}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer gap-2 group relative overflow-hidden ${
                  paymentMethod === "bancomat"
                    ? "border-[#1a3a8f] bg-blue-50/40 text-[#1a3a8f] shadow-xs"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-slate-50/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  paymentMethod === "bancomat" ? "bg-[#1a3a8f] text-white" : "bg-slate-100 text-gray-400 group-hover:bg-slate-200"
                }`}>
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-extrabold uppercase">POS / Bancomat</p>
                  <p className="text-[9px] text-gray-400 mt-0.5 leading-none">Carta di credito o debito</p>
                </div>
                {paymentMethod === "bancomat" && (
                  <span className="absolute top-1.5 right-2 text-xs text-[#1a3a8f] font-bold">✓</span>
                )}
              </button>

              {/* Card Contanti */}
              <button
                type="button"
                onClick={() => setPaymentMethod("contanti")}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer gap-2 group relative overflow-hidden ${
                  paymentMethod === "contanti"
                    ? "border-emerald-600 bg-emerald-50/40 text-emerald-700 shadow-xs"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-slate-50/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  paymentMethod === "contanti" ? "bg-emerald-600 text-white" : "bg-slate-100 text-gray-400 group-hover:bg-slate-200"
                }`}>
                  <Banknote className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-extrabold uppercase">Contanti</p>
                  <p className="text-[9px] text-gray-400 mt-0.5 leading-none">Pagamento in banconote</p>
                </div>
                {paymentMethod === "contanti" && (
                  <span className="absolute top-1.5 right-2 text-xs text-emerald-600 font-bold">✓</span>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-xl transition-all cursor-pointer hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleCheckoutSubmit}
            disabled={saving || !paymentMethod}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 text-xs font-extrabold shadow-md shadow-emerald-950/10 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Salvataggio...
              </>
            ) : (
              <>
                Finalizza e Incassa €{Number(price).toFixed(2)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
