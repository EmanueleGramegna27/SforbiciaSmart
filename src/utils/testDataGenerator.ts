import { 
  collection, 
  doc, 
  writeBatch, 
  getDocs, 
  query, 
  where 
} from "firebase/firestore";
import { Firestore } from "firebase/firestore";

const ITALIAN_FIRST_NAMES = [
  "Marco", "Giulia", "Matteo", "Chiara", "Alessandro", "Francesca", "Lorenzo", "Sofia",
  "Davide", "Elena", "Andrea", "Valentina", "Federico", "Martina", "Luca", "Sara",
  "Simone", "Silvia", "Gabriele", "Federica", "Riccardo", "Alessia", "Edoardo", "Beatrice",
  "Tommaso", "Giorgia", "Filippo", "Camilla", "Mattia", "Alice", "Jacopo", "Ludovica",
  "Stefano", "Laura", "Giovanni", "Elisa", "Pietro", "Greta", "Antonio", "Noemi",
  "Michele", "Vittoria", "Giuseppe", "Rebecca", "Christian", "Anna", "Fabio", "Giada",
  "Daniele", "Aurora", "Giacomo", "Carlotta", "Alberto", "Marta", "Roberto", "Ilaria",
  "Claudio", "Serena", "Paolo", "Valeria"
];

const ITALIAN_LAST_NAMES = [
  "Rossi", "Ferrari", "Russo", "Bianchi", "Romano", "Gallo", "Costa", "Fontana",
  "Conti", "Esposito", "Ricci", "Bruno", "De Luca", "Moretti", "Marino", "Greco",
  "Barbieri", "Lombardi", "Giordano", "Cassano", "Colombo", "Mancini", "Longo", "Leone",
  "Martinelli", "Santoro", "Vitale", "Serra", "Coppola", "Villa", "Gatti", "Monti",
  "Cattaneo", "Marchetti", "Gentile", "Barone", "Vitale", "Lombardo", "Messina", "Sanna",
  "Pellegrini", "Palumbo", "Sartori", "Fabbri", "Parisi", "Valente", "Ferrara", "Pagano",
  "Riva", "D'Amico", "Amato", "Silvestri", "Grassi", "Carbone", "Piras", "Brambilla"
];

const SERVICES_SAMPLE = [
  { name: "Taglio & Piega Luxury", price: 42, duration: 45 },
  { name: "Colore & Riflessante Brilliance", price: 55, duration: 60 },
  { name: "Balayage Sun-Kissed", price: 85, duration: 90 },
  { name: "Trattamento Rigenerante Cheratina", price: 60, duration: 50 },
  { name: "Barba Tradizionale a Panno Caldo", price: 25, duration: 30 },
  { name: "Taglio Uomo Executive Fade", price: 28, duration: 35 },
  { name: "Piega Gloss & Scrub Cute", price: 30, duration: 40 },
];

export interface GeneratedTestClient {
  id: string;
  name: string;
  phone: string;
  category: "eligible" | "ineligible_recent" | "ineligible_future";
  daysAgo?: number;
  daysInFuture?: number;
  note: string;
}

export interface SeedResult {
  success: boolean;
  totalCreated: number;
  breakdown: {
    eligible: number;
    ineligibleRecent: number;
    ineligibleFuture: number;
  };
  clients: GeneratedTestClient[];
}

/**
 * Generates 60 test clients with realistic distribution for verifying Flash Slot algorithm:
 * - 25 with PAST visits (> 14 days ago) and NO future bookings -> ELIGIBLE
 * - 20 with RECENT visits (< 14 days ago) -> Ineligible
 * - 15 with FUTURE bookings (>= today) -> Ineligible
 * 
 * Uses client-side Firestore batch write with authenticated credentials to ensure 100% permission pass.
 */
export async function seedSalonTestClientsClient(
  db: Firestore,
  salonId: string,
  salonName: string,
  ownerId: string
): Promise<SeedResult> {
  const now = new Date();
  const batch = writeBatch(db);
  const createdClients: GeneratedTestClient[] = [];

  let clientIdx = 0;
  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  // Group 1: 25 ELIGIBLE CLIENTS (visited 18 to 90 days ago, no future bookings)
  for (let i = 0; i < 25; i++) {
    const fName = ITALIAN_FIRST_NAMES[clientIdx % ITALIAN_FIRST_NAMES.length];
    const lName = ITALIAN_LAST_NAMES[(clientIdx * 3) % ITALIAN_LAST_NAMES.length];
    const fullName = `${fName} ${lName}`;
    const phone = `34${Math.floor(10000000 + Math.random() * 90000000)}`;
    const email = `${fName.toLowerCase()}.${lName.toLowerCase()}@example.com`;

    const custDocRef = doc(collection(db, "customers"));
    const custId = custDocRef.id;

    // Past visit between 18 and 75 days ago
    const daysAgo = 18 + Math.floor(Math.random() * 57);
    const pastVisitDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    const custData = {
      name: fullName,
      phone,
      email,
      salonId,
      ownerId,
      notes: `[TEST CLIENT - Idoneo Flash Slot] Ultima visita effettuata ${daysAgo} giorni fa.`,
      isTestData: true,
      createdAt: pastVisitDate.toISOString(),
    };

    batch.set(custDocRef, custData);

    // Create past appointment
    const srv = SERVICES_SAMPLE[i % SERVICES_SAMPLE.length];
    const apptDocRef = doc(collection(db, "appointments"));
    const apptData = {
      customerId: custId,
      customerName: fullName,
      salonId,
      serviceId: "srv_test",
      serviceName: srv.name,
      staffName: "Staff SforbiciaSmart",
      date: formatDate(pastVisitDate),
      time: "10:30",
      duration: srv.duration,
      price: srv.price,
      status: "completed",
      ownerId,
      isTestData: true,
      notes: "Prestazione passata conclusa",
      createdAt: pastVisitDate.toISOString(),
    };
    batch.set(apptDocRef, apptData);

    createdClients.push({
      id: custId,
      name: fullName,
      phone,
      category: "eligible",
      daysAgo,
      note: `Idoneo (Visita: ${daysAgo} gg fa)`,
    });

    clientIdx++;
  }

  // Group 2: 20 INELIGIBLE CLIENTS - RECENT VISITS (visited 1 to 13 days ago)
  for (let i = 0; i < 20; i++) {
    const fName = ITALIAN_FIRST_NAMES[clientIdx % ITALIAN_FIRST_NAMES.length];
    const lName = ITALIAN_LAST_NAMES[(clientIdx * 3) % ITALIAN_LAST_NAMES.length];
    const fullName = `${fName} ${lName}`;
    const phone = `33${Math.floor(10000000 + Math.random() * 90000000)}`;
    const email = `${fName.toLowerCase()}.${lName.toLowerCase()}@example.com`;

    const custDocRef = doc(collection(db, "customers"));
    const custId = custDocRef.id;

    // Past visit between 1 and 13 days ago (too recent)
    const daysAgo = 1 + Math.floor(Math.random() * 12);
    const pastVisitDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    const custData = {
      name: fullName,
      phone,
      email,
      salonId,
      ownerId,
      notes: `[TEST CLIENT - Non Idoneo] Visita recente (${daysAgo} giorni fa).`,
      isTestData: true,
      createdAt: pastVisitDate.toISOString(),
    };

    batch.set(custDocRef, custData);

    // Create recent appointment
    const srv = SERVICES_SAMPLE[i % SERVICES_SAMPLE.length];
    const apptDocRef = doc(collection(db, "appointments"));
    const apptData = {
      customerId: custId,
      customerName: fullName,
      salonId,
      serviceId: "srv_test",
      serviceName: srv.name,
      staffName: "Staff SforbiciaSmart",
      date: formatDate(pastVisitDate),
      time: "15:00",
      duration: srv.duration,
      price: srv.price,
      status: "completed",
      ownerId,
      isTestData: true,
      notes: "Visita recente",
      createdAt: pastVisitDate.toISOString(),
    };
    batch.set(apptDocRef, apptData);

    createdClients.push({
      id: custId,
      name: fullName,
      phone,
      category: "ineligible_recent",
      daysAgo,
      note: `Non idoneo (Visita recente: ${daysAgo} gg fa)`,
    });

    clientIdx++;
  }

  // Group 3: 15 INELIGIBLE CLIENTS - FUTURE BOOKINGS (scheduled in next 1-14 days)
  for (let i = 0; i < 15; i++) {
    const fName = ITALIAN_FIRST_NAMES[clientIdx % ITALIAN_FIRST_NAMES.length];
    const lName = ITALIAN_LAST_NAMES[(clientIdx * 3) % ITALIAN_LAST_NAMES.length];
    const fullName = `${fName} ${lName}`;
    const phone = `38${Math.floor(10000000 + Math.random() * 90000000)}`;
    const email = `${fName.toLowerCase()}.${lName.toLowerCase()}@example.com`;

    const custDocRef = doc(collection(db, "customers"));
    const custId = custDocRef.id;

    const daysInFuture = 1 + Math.floor(Math.random() * 14);
    const futureDate = new Date(now.getTime() + daysInFuture * 24 * 60 * 60 * 1000);

    const custData = {
      name: fullName,
      phone,
      email,
      salonId,
      ownerId,
      notes: `[TEST CLIENT - Non Idoneo] Ha già un appuntamento futuro tra ${daysInFuture} giorni.`,
      isTestData: true,
      createdAt: new Date().toISOString(),
    };

    batch.set(custDocRef, custData);

    // Create future appointment
    const srv = SERVICES_SAMPLE[i % SERVICES_SAMPLE.length];
    const apptDocRef = doc(collection(db, "appointments"));
    const apptData = {
      customerId: custId,
      customerName: fullName,
      salonId,
      serviceId: "srv_test",
      serviceName: srv.name,
      staffName: "Staff SforbiciaSmart",
      date: formatDate(futureDate),
      time: "11:00",
      duration: srv.duration,
      price: srv.price,
      status: "confirmed",
      ownerId,
      isTestData: true,
      notes: "Prenotazione futura programmata",
      createdAt: new Date().toISOString(),
    };
    batch.set(apptDocRef, apptData);

    createdClients.push({
      id: custId,
      name: fullName,
      phone,
      category: "ineligible_future",
      daysInFuture,
      note: `Non idoneo (Prenotazione futura tra ${daysInFuture} gg)`,
    });

    clientIdx++;
  }

  // Commit the batch of 60 customers + 60 appointments (120 operations, well within the 500 limit)
  await batch.commit();

  console.log(`[Test Data Seed] 60 clienti di test creati con successo per ${salonName} (${salonId})`);

  return {
    success: true,
    totalCreated: createdClients.length,
    breakdown: {
      eligible: 25,
      ineligibleRecent: 20,
      ineligibleFuture: 15,
    },
    clients: createdClients,
  };
}

/**
 * Cleans up generated test data for a salon via client-side Firestore batch write.
 */
export async function cleanupSalonTestClientsClient(
  db: Firestore,
  salonId: string,
  ownerId: string
): Promise<{ success: boolean; deletedCount: number }> {
  const custQuery = query(
    collection(db, "customers"),
    where("ownerId", "==", ownerId),
    where("salonId", "==", salonId),
    where("isTestData", "==", true)
  );

  const apptQuery = query(
    collection(db, "appointments"),
    where("ownerId", "==", ownerId),
    where("salonId", "==", salonId),
    where("isTestData", "==", true)
  );

  const [custSnap, apptSnap] = await Promise.all([
    getDocs(custQuery),
    getDocs(apptQuery),
  ]);

  const batch = writeBatch(db);
  let count = 0;

  custSnap.forEach((d) => {
    batch.delete(d.ref);
    count++;
  });

  apptSnap.forEach((d) => {
    batch.delete(d.ref);
    count++;
  });

  if (count > 0) {
    await batch.commit();
  }

  return { success: true, deletedCount: count };
}
