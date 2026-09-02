import React, { useState } from "react";
import { useBusiness } from "../context/BusinessContext";
import { db } from "../lib/firebase";
import { 
  seedSalonTestClientsClient, 
  cleanupSalonTestClientsClient,
  GeneratedTestClient,
  SeedResult 
} from "../utils/testDataGenerator";
import { 
  Users, 
  Database, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Trash2, 
  RefreshCw, 
  Store, 
  ShieldCheck,
  Search,
  Filter
} from "lucide-react";

export default function TestDataManager() {
  const { salons, ownerId } = useBusiness();
  const [selectedSalonId, setSelectedSalonId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [generationResult, setGenerationResult] = useState<SeedResult | null>(null);
  const [cleanResult, setCleanResult] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  React.useEffect(() => {
    if (salons.length > 0 && !selectedSalonId) {
      setSelectedSalonId(salons[0].id);
    }
  }, [salons, selectedSalonId]);

  const selectedSalon = salons.find((s) => s.id === selectedSalonId) || salons[0] || null;

  const handleGenerateTestData = async () => {
    if (!selectedSalonId || !ownerId) return;
    setGenerating(true);
    setCleanResult(null);
    try {
      const result = await seedSalonTestClientsClient(
        db,
        selectedSalonId,
        selectedSalon?.name || "Salone SforbiciaSmart",
        ownerId
      );
      if (result.success) {
        setGenerationResult(result);
      } else {
        alert("Errore generazione dati test.");
      }
    } catch (err: any) {
      console.error("[Test Data Client Seed Error]:", err);
      alert("Errore durante la generazione dei dati: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCleanupTestData = async () => {
    if (!confirm("Sei sicuro di voler eliminare tutti i dati di test generati per questo salone?")) return;
    if (!selectedSalonId || !ownerId) return;
    setCleaning(true);
    try {
      const result = await cleanupSalonTestClientsClient(db, selectedSalonId, ownerId);
      if (result.success) {
        setCleanResult(`Eliminati con successo ${result.deletedCount} record di test.`);
        setGenerationResult(null);
      } else {
        alert("Errore durante la pulizia dei dati.");
      }
    } catch (err: any) {
      console.error("[Test Data Client Cleanup Error]:", err);
      alert("Errore durante la pulizia: " + err.message);
    } finally {
      setCleaning(false);
    }
  };

  const clientsList = generationResult?.clients || [];
  const filteredClients = clientsList.filter((c: any) => {
    const matchCategory = filterCategory === "all" || c.category === filterCategory;
    const matchSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery);
    return matchCategory && matchSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* Overview Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-[#1a3a8f] rounded-xl">
              <Database className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Generatore Dati di Test (60 Clienti Isolati)</h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">
            Popola il database con 60 clienti fittizi realistici per collaudare l'algoritmo di selezione del Flash Slot e verificare l'assenza di collisioni tra saloni.
          </p>
        </div>

        {/* Salon Selector */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <Store className="w-4 h-4 text-slate-400 ml-1.5" />
          <span className="text-xs font-bold text-slate-500">Sede:</span>
          <select
            value={selectedSalonId}
            onChange={(e) => setSelectedSalonId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1a3a8f]/20 cursor-pointer"
          >
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Breakdown Explanation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800">Gruppo 1 • Idonei</span>
            <span className="bg-emerald-200/80 text-emerald-900 font-extrabold text-xs px-2.5 py-0.5 rounded-full font-mono">
              25 Clienti
            </span>
          </div>
          <p className="text-xs text-emerald-900 font-medium">
            Clienti con ultima visita effettuata tra 18 e 75 giorni fa e <strong>nessuna</strong> prenotazione futura.
          </p>
          <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Verranno notificati dal Flash Slot
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-800">Gruppo 2 • Troppo Recenti</span>
            <span className="bg-amber-200/80 text-amber-900 font-extrabold text-xs px-2.5 py-0.5 rounded-full font-mono">
              20 Clienti
            </span>
          </div>
          <p className="text-xs text-amber-900 font-medium">
            Clienti che hanno visitato il salone negli ultimi 14 giorni (appena tagliati).
          </p>
          <div className="text-[10px] text-amber-700 font-bold flex items-center gap-1 pt-1">
            <XCircle className="w-3.5 h-3.5" />
            Automaticamente esclusi (no spam)
          </div>
        </div>

        <div className="bg-rose-50/70 border border-rose-200/70 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-rose-800">Gruppo 3 • Prenotati Futuri</span>
            <span className="bg-rose-200/80 text-rose-900 font-extrabold text-xs px-2.5 py-0.5 rounded-full font-mono">
              15 Clienti
            </span>
          </div>
          <p className="text-xs text-rose-900 font-medium">
            Clienti che hanno già un appuntamento fissato in agenda nei prossimi giorni.
          </p>
          <div className="text-[10px] text-rose-700 font-bold flex items-center gap-1 pt-1">
            <XCircle className="w-3.5 h-3.5" />
            Automaticamente esclusi (già prenotati)
          </div>
        </div>

      </div>

      {/* Action CTA Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateTestData}
            disabled={generating}
            className="bg-[#1a3a8f] hover:bg-[#152f73] text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 cursor-pointer"
          >
            {generating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generazione 60 Clienti in corso...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Genera 60 Clienti per {selectedSalon?.name || "Salone"}
              </>
            )}
          </button>

          <button
            onClick={handleCleanupTestData}
            disabled={cleaning}
            className="bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Pulisci Dati Test di questa sede
          </button>
        </div>

        {cleanResult && (
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl animate-fadeIn">
            {cleanResult}
          </span>
        )}
      </div>

      {/* Generated Clients Table & Verification List */}
      {generationResult && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-4 animate-fadeIn">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Generazione Completata con Successo</span>
              <h3 className="text-lg font-bold text-slate-900">
                Elenco dei 60 Clienti Generati per "{selectedSalon?.name}"
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {/* Category Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setFilterCategory("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterCategory === "all" ? "bg-white text-slate-900 shadow-3xs" : "text-slate-500"}`}
                >
                  Tutti (60)
                </button>
                <button
                  onClick={() => setFilterCategory("eligible")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterCategory === "eligible" ? "bg-emerald-600 text-white shadow-3xs" : "text-emerald-700"}`}
                >
                  Idonei (25)
                </button>
                <button
                  onClick={() => setFilterCategory("ineligible_recent")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterCategory === "ineligible_recent" ? "bg-amber-600 text-white shadow-3xs" : "text-amber-700"}`}
                >
                  Recenti (20)
                </button>
                <button
                  onClick={() => setFilterCategory("ineligible_future")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterCategory === "ineligible_future" ? "bg-rose-600 text-white shadow-3xs" : "text-rose-700"}`}
                >
                  Futuri (15)
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-400">
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Telefono (WhatsApp)</th>
                  <th className="py-2.5 px-3">Categoria Algoritmica</th>
                  <th className="py-2.5 px-3">Dettaglio Temporale</th>
                  <th className="py-2.5 px-3 text-right">Esito Flash Slot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredClients.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{c.name}</td>
                    <td className="py-2.5 px-3 font-mono">{c.phone}</td>
                    <td className="py-2.5 px-3">
                      {c.category === "eligible" ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Idoneo (Inattivo)
                        </span>
                      ) : c.category === "ineligible_recent" ? (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3 text-amber-600" />
                          Escluso (Visita Recente)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Escluso (Già Prenotato)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{c.note}</td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      {c.category === "eligible" ? (
                        <span className="text-emerald-700 font-extrabold">Riceverà WhatsApp ⚡</span>
                      ) : (
                        <span className="text-slate-400">Nessun invio</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
}
