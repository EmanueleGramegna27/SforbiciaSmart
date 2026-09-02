import React, { createContext, useContext, useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Salon, Service, Category, Customer, BusinessSettings } from "../types";

interface BusinessContextType {
  user: User | null;
  ownerId: string | null;
  userRole: "owner" | "receptionist";
  loading: boolean;
  salons: Salon[];
  services: Service[];
  categories: Category[];
  customers: Customer[];
  permissionError: string | null;
  resetPermissionError: () => void;
  userSalonIds: string[] | null;
  businessSettings: BusinessSettings | null;
}

const BusinessContext = createContext<BusinessContextType>({
  user: null,
  ownerId: null,
  userRole: "owner",
  loading: true,
  salons: [],
  services: [],
  categories: [],
  customers: [],
  permissionError: null,
  resetPermissionError: () => {},
  userSalonIds: null,
  businessSettings: null,
});

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"owner" | "receptionist">("owner");
  const [userSalonIds, setUserSalonIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  const resetPermissionError = () => setPermissionError(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setOwnerId(null);
        setUserRole("owner");
        setUserSalonIds(null);
        setSalons([]);
        setServices([]);
        setCategories([]);
        setCustomers([]);
        setPermissionError(null);
        setBusinessSettings(null);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Reactive role and owner ID detection
  useEffect(() => {
    if (!user) return;

    // Default values
    setOwnerId(user.uid);
    setUserRole("owner");
    setUserSalonIds(null);
    setLoading(true);

    const emailKey = user.email ? user.email.toLowerCase() : "";
    const altEmailKey = emailKey.endsWith("@gmail.com") 
      ? emailKey.replace("@gmail.com", "@gmal.com")
      : emailKey.endsWith("@gmal.com")
        ? emailKey.replace("@gmal.com", "@gmail.com")
        : "";

    let docByUid: any = null;
    let docByEmail: any = null;
    let docByAltEmail: any = null;
    let docByEmailQuery: any = null;
    let docByAltEmailQuery: any = null;

    const updateState = () => {
      // Email-based is the source of truth (written by the owner)
      const sourceOfTruth = docByEmail || docByAltEmail || docByEmailQuery || docByAltEmailQuery;
      const activeDoc = sourceOfTruth || docByUid;

      if (activeDoc && (
        activeDoc.role === "Receptionist" || 
        activeDoc.role === "receptionist" || 
        activeDoc.role === "Barbiere" || 
        activeDoc.role === "barbiere" ||
        (activeDoc.ownerId && activeDoc.ownerId !== user.uid)
      )) {
        setUserRole("receptionist");
        setOwnerId(activeDoc.ownerId || user.uid);
        setUserSalonIds(activeDoc.salonIds || null);

        // Self-heal / Sync: Clone/Sync this team member document into /team/{user.uid}
        // so that Firestore security rules can run instantly and flawlessly using exists(/team/uid)
        if (sourceOfTruth) {
          const needsSync = !docByUid || 
            docByUid.name !== sourceOfTruth.name ||
            docByUid.role !== sourceOfTruth.role ||
            docByUid.ownerId !== sourceOfTruth.ownerId ||
            JSON.stringify(docByUid.salonIds) !== JSON.stringify(sourceOfTruth.salonIds);

          if (needsSync) {
            const uidDocRef = doc(db, "team", user.uid);
            const syncPayload = {
              name: sourceOfTruth.name || "",
              role: sourceOfTruth.role || "Receptionist",
              phone: sourceOfTruth.phone || "",
              email: sourceOfTruth.email || "",
              salonIds: sourceOfTruth.salonIds || [],
              ownerId: sourceOfTruth.ownerId || "",
              uid: user.uid,
              updatedAt: new Date().toISOString()
            };
            
            // To avoid infinite loops or state lag, we optimistically update our local variable
            docByUid = { ...syncPayload, id: user.uid };
            
            setDoc(uidDocRef, syncPayload).then(() => {
              console.log("Self-healing: Synchronized team document to UID:", user.uid);
            }).catch((err) => {
              console.error("Self-healing: Error synchronizing team document to UID:", err);
            });
          }
        }
      } else {
        setUserRole("owner");
        setOwnerId(user.uid);
        setUserSalonIds(null);
      }
      setLoading(false);
    };

    // 1. Listen to doc by UID
    const unsubUid = onSnapshot(doc(db, "team", user.uid), (snap) => {
      docByUid = snap.exists() ? snap.data() : null;
      updateState();
    }, (err) => {
      docByUid = null;
      updateState();
    });

    // 2. Listen to doc by exact Email (lowercase and standard)
    let unsubEmailDoc = () => {};
    if (emailKey) {
      unsubEmailDoc = onSnapshot(doc(db, "team", emailKey), (snap) => {
        docByEmail = snap.exists() ? snap.data() : null;
        updateState();
      }, (err) => {
        docByEmail = null;
        updateState();
      });
    }

    // 3. Listen to doc by Alt Email if applicable
    let unsubAltEmailDoc = () => {};
    if (altEmailKey && altEmailKey !== emailKey) {
      unsubAltEmailDoc = onSnapshot(doc(db, "team", altEmailKey), (snap) => {
        docByAltEmail = snap.exists() ? snap.data() : null;
        updateState();
      }, (err) => {
        docByAltEmail = null;
        updateState();
      });
    }

    // 4. Query fallback for exact Email (if the existing doc has a random auto-ID)
    let unsubEmailQuery = () => {};
    if (emailKey) {
      const q = query(collection(db, "team"), where("email", "==", emailKey));
      unsubEmailQuery = onSnapshot(q, (snap) => {
        docByEmailQuery = !snap.empty ? snap.docs[0].data() : null;
        updateState();
      }, (err) => {
        docByEmailQuery = null;
        updateState();
      });
    }

    // 5. Query fallback for Alt Email
    let unsubAltEmailQuery = () => {};
    if (altEmailKey && altEmailKey !== emailKey) {
      const q = query(collection(db, "team"), where("email", "==", altEmailKey));
      unsubAltEmailQuery = onSnapshot(q, (snap) => {
        docByAltEmailQuery = !snap.empty ? snap.docs[0].data() : null;
        updateState();
      }, (err) => {
        docByAltEmailQuery = null;
        updateState();
      });
    }

    return () => {
      unsubUid();
      unsubEmailDoc();
      unsubAltEmailDoc();
      unsubEmailQuery();
      unsubAltEmailQuery();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !ownerId) return;

    const handleLocalError = (error: any, path: string) => {
      const isPermission = error?.message?.toLowerCase().includes("permission") || 
                           error?.code?.toLowerCase().includes("permission-denied") ||
                           String(error).toLowerCase().includes("permission");
      if (isPermission) {
        setPermissionError(path);
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        // Prevent throwing from crashing snap listener thread itself
        console.error("Intercepted snap error:", e);
      }
    };

    const unsubscribeSalons = onSnapshot(
      query(collection(db, "salons"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Salon[];
        let filtered = data.filter(s => s.name);
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = filtered.filter(s => allowedIds.includes(s.id));
        }
        setSalons(filtered.sort((a, b) => a.name.localeCompare(b.name)));
      },
      (error) => {
        handleLocalError(error, "salons");
      }
    );

    const unsubscribeServices = onSnapshot(
      query(collection(db, "services"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Service[];
        let filtered = data.filter(s => s.name);
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = filtered.filter(s => 
            !s.salonIds || s.salonIds.length === 0 || s.salonIds.some(id => allowedIds.includes(id))
          );
        }
        setServices(filtered.sort((a, b) => a.name.localeCompare(b.name)));
      },
      (error) => {
        handleLocalError(error, "services");
      }
    );

    const unsubscribeCategories = onSnapshot(
      query(collection(db, "categories"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Category[];
        setCategories(data.filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name)));
      },
      (error) => {
        handleLocalError(error, "categories");
      }
    );

    const unsubscribeCustomers = onSnapshot(
      query(collection(db, "customers"), where("ownerId", "==", ownerId)),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Customer[];
        let filtered = data.filter(c => c.name);
        if (userRole === "receptionist") {
          const allowedIds = userSalonIds || [];
          filtered = filtered.filter(c => allowedIds.includes(c.salonId));
        }
        setCustomers(filtered.sort((a, b) => a.name.localeCompare(b.name)));
      },
      (error) => {
        handleLocalError(error, "customers");
      }
    );

    const unsubscribeSettings = onSnapshot(
      doc(db, "business_settings", ownerId),
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data() as BusinessSettings;
          setBusinessSettings(data);
        } else {
          // Auto-initialize trial parameters for Owner
          if (userRole === "owner") {
            const trialStart = new Date();
            const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
            const newSettings: BusinessSettings = {
              ownerId: ownerId,
              partitaIvaPrincipale: "",
              sedeLegale: "",
              userPlan: "network",
              subscriptionStatus: "trialing",
              trialStartDate: trialStart.toISOString(),
              trialEndDate: trialEnd.toISOString(),
              updatedAt: new Date().toISOString()
            };
            try {
              await setDoc(doc(db, "business_settings", ownerId), newSettings);
              setBusinessSettings(newSettings);
            } catch (err) {
              console.error("Error auto-initializing free trial settings:", err);
            }
          } else {
            setBusinessSettings(null);
          }
        }
      },
      (error) => {
        handleLocalError(error, "business_settings");
      }
    );

    return () => {
      unsubscribeSalons();
      unsubscribeServices();
      unsubscribeCategories();
      unsubscribeCustomers();
      unsubscribeSettings();
    };
  }, [user, ownerId, userRole, userSalonIds]);

  return (
    <BusinessContext.Provider value={{ user, ownerId, userRole, loading, salons, services, categories, customers, permissionError, resetPermissionError, userSalonIds, businessSettings }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error("useBusiness must be used within a BusinessProvider");
  return context;
}
