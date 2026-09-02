import React, { useState, useEffect } from "react";
import { useBusiness } from "../../context/BusinessContext";
import { 
  MapPin, 
  Sparkles, 
  CheckCircle2, 
  MessageSquare, 
  Camera, 
  TrendingUp, 
  PhoneCall, 
  Globe, 
  Eye, 
  MousePointerClick, 
  RefreshCw, 
  Check, 
  Edit3, 
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  Layers,
  Store
} from "lucide-react";
import InterviewIntelligenceModal from "./InterviewIntelligenceModal";
import SmartReviewCenter from "./SmartReviewCenter";
import AutoPhotoScheduler from "./AutoPhotoScheduler";

export default function GoogleBusinessManager() {
  const { salons, ownerId } = useBusiness();
  const [selectedSalonId, setSelectedSalonId] = useState<string>(salons[0]?.id || "default");
  const selectedSalon = salons.find((s) => s.id === selectedSalonId) || salons[0] || {
    id: "default",
    name: "Salone Partner",
    city: "Napoli",
    address: "Via Toledo, 100",
  };

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [profileData, setProfileData] = useState<{
    isCompleted: boolean;
    seoDescription: string;
    answers: Record<string, string>;
    updatedAt: string | null;
  }>({
    isCompleted: true,
    seoDescription: `${selectedSalon.name} è il punto di riferimento per chi cerca tagli impeccabili, sfumature moderne e cura della barba. Da anni accogliamo i nostri clienti con professionalità e passione autentica nel cuore della città. 💈`,
    answers: {},
    updatedAt: "2 ore fa",
  });

  const [connectionStatus, setConnectionStatus] = useState<{
    isConnected: boolean;
    businessName: string;
    accountEmail: string;
    lastSyncedAt: string;
  }>({
    isConnected: true,
    businessName: selectedSalon.name,
    accountEmail: "google.business@gmail.com",
    lastSyncedAt: "2 ore fa",
  });

  const [analytics, setAnalytics] = useState({
    impressions: 342,
    impressionsGrowth: "+12%",
    clicks: 47,
    calls: 12,
    websiteVisits: 28,
  });

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/google-business/profile?salonId=${selectedSalonId}`);
      const data = await res.json();
      if (data.success && data.profile) {
        if (data.profile.isCompleted && data.profile.seoDescription) {
          setProfileData(data.profile);
        }
      }
    } catch (e) {
      console.warn("Could not fetch profile:", e);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [selectedSalonId]);

  const handleSaveInterviewResults = async (seoDescription: string, answers: Record<string, string>) => {
    try {
      const res = await fetch("/api/google-business/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: selectedSalonId,
          ownerId,
          seoDescription,
          answers,
        }),
      });
      const data = await res.json();
      if (data.success && data.profile) {
        setProfileData(data.profile);
      }
    } catch (e) {
      console.warn("Save profile error:", e);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-7xl mx-auto">
      {/* 1. Header Card con Stato Connessione & Selettore Salone */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-slate-900">
                  Google Business Manager
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  STATO: CONNESSO
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Sincronizza e gestisci il tuo profilo Google Business in modo sicuro e professionale
              </p>
            </div>
          </div>

          {/* Salone Picker (se multipli) */}
          {salons.length > 1 && (
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-slate-400" />
              <select
                value={selectedSalonId}
                onChange={(e) => setSelectedSalonId(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none cursor-pointer"
              >
                {salons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city || "Sede"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pt-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Scheda collegata: <strong>{selectedSalon.name}</strong> ({connectionStatus.accountEmail})</span>
          </div>
          <span className="text-slate-400 text-[11px]">
            Ultimo sync: <strong>{profileData.updatedAt || connectionStatus.lastSyncedAt || "Recente"}</strong>
          </span>
        </div>
      </div>

      {/* 2. Navigatore dei 3 Step Sequenziali */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Step 1 Button */}
        <button
          onClick={() => setActiveStep(1)}
          className={`p-4.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-3 ${
            activeStep === 1
              ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              activeStep === 1 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
            }`}>
              STEP 1
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>📋 Setup & Profilo</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              Intervista AI amichevole e generazione descrizione SEO (max 750 char).
            </p>
          </div>
        </button>

        {/* Step 2 Button */}
        <button
          onClick={() => setActiveStep(2)}
          className={`p-4.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-3 ${
            activeStep === 2
              ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              activeStep === 2 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
            }`}>
              STEP 2
            </span>
            <MessageSquare className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>💬 Risposte Intelligenti</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              Recensioni Google con risposte AI veloci e sicure (max 150 char).
            </p>
          </div>
        </button>

        {/* Step 3 Button */}
        <button
          onClick={() => setActiveStep(3)}
          className={`p-4.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-3 ${
            activeStep === 3
              ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              activeStep === 3 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
            }`}>
              STEP 3
            </span>
            <Camera className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>📸 Gestione Foto</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              Didascalie naturali e timing cadenzato anti-ban (minuti variabili).
            </p>
          </div>
        </button>
      </div>

      {/* 3. Contenuto dello Step Selezionato */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        {/* STEP 1: SETUP & PROFILO INTELLIGENCE */}
        {activeStep === 1 && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  [1] Setup & Profilo Intelligence
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Descrizione SEO formulata per massimizzare il ranking su Google Maps rispettando le linee guida
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsInterviewOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition shadow-xs cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-indigo-300" />
                  <span>{profileData.isCompleted ? "Modifica Intervista AI" : "Avvia Intervista AI (10 min)"}</span>
                </button>
              </div>
            </div>

            {/* Current Profile Card */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Descrizione SEO Attuale su Google Business
                </span>
                <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  {profileData.seoDescription.length} / 750 char
                </span>
              </div>

              <p className="text-sm text-slate-800 bg-white p-4 rounded-xl border border-slate-200/60 leading-relaxed italic">
                "{profileData.seoDescription}"
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Stato: <strong>Completato & Indicizzato</strong></span>
                </div>
                <button
                  onClick={() => setIsInterviewOpen(true)}
                  className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>Aggiorna con nuova intervista</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CENTRO RISPOSTE INTELLIGENTI */}
        {activeStep === 2 && (
          <div className="space-y-6 animate-fadeIn">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                [2] Centro Risposte Intelligenti
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Genera e pubblica risposte su misura in 1 clic con regole anti-ban rigorose (max 150 caratteri)
              </p>
            </div>

            <SmartReviewCenter
              salonName={selectedSalon.name}
              salonId={selectedSalonId}
            />
          </div>
        )}

        {/* STEP 3: GESTIONE FOTO AUTOMATICA */}
        {activeStep === 3 && (
          <div className="space-y-6 animate-fadeIn">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-600" />
                [3] Gestione Foto Automatica
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Carica le immagini del tuo lavoro: l'AI assegna didascalie pulite e una cadenza naturale per evitare penalizzazioni Google
              </p>
            </div>

            <AutoPhotoScheduler
              salonName={selectedSalon.name}
              salonId={selectedSalonId}
            />
          </div>
        )}
      </div>

      {/* 4. Box Analytics Google Maps */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Google Maps Analytics (Ultimi 30 giorni)
            </h4>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Dati sincronizzati
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Impressions */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                Impressioni Maps
              </span>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                {analytics.impressionsGrowth}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {analytics.impressions}
            </div>
          </div>

          {/* Clicks */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <MousePointerClick className="w-3.5 h-3.5 text-indigo-600" />
              Click Scheda
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {analytics.clicks}
            </div>
          </div>

          {/* Calls */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
              Chiamate Dirette
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {analytics.calls}
            </div>
          </div>

          {/* Website visits */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              Visite Sito / Prenotazioni
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {analytics.websiteVisits}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Intervista */}
      <InterviewIntelligenceModal
        isOpen={isInterviewOpen}
        onClose={() => setIsInterviewOpen(false)}
        salonName={selectedSalon.name}
        onComplete={handleSaveInterviewResults}
        initialAnswers={profileData.answers}
      />
    </div>
  );
}
