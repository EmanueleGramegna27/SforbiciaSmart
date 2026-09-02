import React, { useState, useMemo, useEffect } from "react";
import { useBusiness } from "../context/BusinessContext";
import { PLAN_LIMITS } from "../lib/plans";
import { 
  Sparkles, 
  Send, 
  Copy, 
  CheckCircle2, 
  Users, 
  Smartphone, 
  Mail, 
  ShieldCheck, 
  Check,
  Zap,
  Sliders,
  Heart,
  Gift,
  RotateCcw,
  Sun,
  Edit3,
} from "lucide-react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import WhatsAppSalonManager from "./WhatsAppSalonManager";
import TestDataManager from "./TestDataManager";
import FeedbackShieldManager from "./FeedbackShieldManager";
import GoogleBusinessManager from "./google-business/GoogleBusinessManager";
import { MapPin } from "lucide-react";

interface MarketingScreenProps {
  setCurrentTab?: (tab: string) => void;
}

export default function MarketingScreen({ setCurrentTab }: MarketingScreenProps) {
  const { salons, customers, businessSettings, ownerId } = useBusiness();
  const [activeTab, setActiveTab] = useState<"google_business" | "feedback_shield" | "whatsapp" | "new" | "test_data">("google_business");

  // Gating check: Elite AI or Unlimited is required for AI Marketing
  const isEliteAI = PLAN_LIMITS[businessSettings?.userPlan || "network"]?.hasAI === true;

  // Plan Gate if needed
  if (!isEliteAI) {
    const currentPlanName = PLAN_LIMITS[businessSettings?.userPlan || "network"]?.name || "Network";
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn py-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>AI Marketing Suite</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            AI Marketing & Fidelizzazione
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Disponibile con il piano Elite AI per creare campagne su misura e proteggere la tua reputazione online.
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center max-w-xl mx-auto shadow-sm space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-slate-900">
              Sblocca l'Assistente AI
            </h3>
            <p className="text-slate-500 text-xs">
              Il tuo piano attuale è <strong>{currentPlanName}</strong>. Effettua l'upgrade per accedere a tutte le automazioni marketing.
            </p>
          </div>

          <div className="pt-2">
            {setCurrentTab && (
              <button
                onClick={() => setCurrentTab("account_info")}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl px-6 py-3 text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Passa a Elite AI
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Generation Form Fields
  const [targetType, setTargetType] = useState<"all" | "salon" | "special_prices">("all");
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [promoType, setPromoType] = useState<"welcome" | "birthday" | "winback" | "season" | "custom">("welcome");
  const [tone, setTone] = useState("friendly");
  const channel = "email";
  const [customBrief, setCustomBrief] = useState("");
  const [discountValue, setDiscountValue] = useState("15");

  // Output generated text state
  const [generatedText, setGeneratedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignInviata, setCampaignInviata] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const selectedSalonObject = useMemo(() => {
    return salons.find(s => s.id === selectedSalonId) || salons[0] || { name: "SforbiciaSmart" };
  }, [salons, selectedSalonId]);

  const sampleClient = useMemo(() => {
    return customers[0] || { name: "Maria Rossi", email: "maria.rossi@example.com" };
  }, [customers]);

  // Target recipients count calculator
  const targetCount = useMemo(() => {
    if (targetType === "all") return Math.max(1, customers.length);
    if (targetType === "special_prices") return Math.max(1, Math.floor(customers.length * 0.3));
    if (targetType === "salon" && selectedSalonId) {
      const match = customers.filter(c => c.salonId === selectedSalonId).length;
      return match > 0 ? match : Math.max(1, Math.floor(customers.length * 0.5));
    }
    return Math.max(1, customers.length);
  }, [targetType, customers, selectedSalonId]);

  // Real server-side Gemini API generation
  const generateCampaignContent = async () => {
    setIsGenerating(true);
    setCampaignInviata(false);
    setErrorMsg("");
    
    try {
      const response = await fetch("/api/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promoType,
          tone,
          channel,
          salonName: selectedSalonObject.name,
          discountValue,
          customBrief,
        }),
      });

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || "Impossibile generare il testo.");
      }
      setGeneratedText(resData.text || "");
    } catch (err: any) {
      console.error("Generation failed:", err);
      setErrorMsg(err.message || "Errore di connessione con il servizio di generazione.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Initial placeholder text
  useEffect(() => {
    setGeneratedText(`OGGETTO: Benvenuta da ${selectedSalonObject.name} - Il tuo Sconto del 15% ti aspetta!

Cara [Nome],

Siamo felici di darti il benvenuto in ${selectedSalonObject.name}. Per iniziare al meglio questo percorso insieme, abbiamo riservato per te un regalo speciale:

✨ UNO SCONTO DEL 15% ✨
valido su qualsiasi trattamento presso il nostro salone.

Prenota comodamente online o chiamaci per scegliere il tuo momento di relax ideale.

A presto,
Il Team di ${selectedSalonObject.name}`);
  }, [selectedSalonObject.name]);

  const handleCopyText = () => {
    const formatted = generatedText.replace(/\[Nome\]/g, sampleClient.name.split(" ")[0]);
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulateSend = async () => {
    if (!generatedText || !ownerId) return;
    setIsGenerating(true);
    setErrorMsg("");
    
    try {
      const campaignName = promoType === "welcome" ? "Sconto Benvenuto" : 
                           promoType === "birthday" ? "Auguri Compleanno" : 
                           promoType === "winback" ? "Recupero Clienti Silenti" : 
                           promoType === "season" ? "Promo Stagionale" : "Campagna Personalizzata";
      
      const targetGroupLabel = targetType === "all" ? "Tutti i Clienti" : 
                               targetType === "special_prices" ? "Clienti Prezzi Speciali" : "Sede Selezionata";

      const formattedDate = new Date().toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      });

      let filteredRecipients = [...customers];
      if (targetType === "salon" && selectedSalonId) {
        filteredRecipients = customers.filter(c => c.salonId === selectedSalonId);
      } else if (targetType === "special_prices") {
        filteredRecipients = customers.filter(c => c.customPrices && Object.keys(c.customPrices).length > 0);
        if (filteredRecipients.length === 0) {
          filteredRecipients = customers.slice(0, Math.max(1, Math.floor(customers.length * 0.3)));
        }
      }

      if (filteredRecipients.length === 0) {
        filteredRecipients = [
          { name: "Maria Rossi", phone: "+393331234567", email: "maria.rossi@example.com" } as any
        ];
      }

      const sendResponse = await fetch("/api/marketing/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          text: generatedText,
          recipients: filteredRecipients.map(r => ({
            name: r.name,
            phone: r.phone,
            email: r.email
          })),
          salonName: selectedSalonObject.name
        })
      });

      const sendResult = await sendResponse.json();
      if (!sendResult.success) {
        throw new Error(sendResult.error || "Impossibile inviare la campagna.");
      }

      await addDoc(collection(db, "campaigns"), {
        name: campaignName,
        type: channel,
        targetGroup: targetGroupLabel,
        sentDate: formattedDate,
        deliveryRate: "100%",
        openRate: "75.0%",
        bookingsCount: Math.max(1, Math.floor(filteredRecipients.length * 0.15)),
        text: generatedText,
        ownerId: ownerId,
        createdAt: new Date().toISOString(),
        deliveries: sendResult.deliveries || []
      });

      setCampaignInviata(true);
    } catch (err: any) {
      console.error("Failed to send campaign:", err);
      setErrorMsg("Impossibile inviare: " + (err.message || String(err)));
    } finally {
      setIsGenerating(false);
    }
  };

  // Promo preset options with clean icons
  const promoOptions = [
    { id: "welcome", label: "Benvenuto", desc: "Per nuovi clienti", icon: Heart },
    { id: "birthday", label: "Compleanno", desc: "Regalo del mese", icon: Gift },
    { id: "winback", label: "Clienti Silenti", desc: "Inattivi da 60+ gg", icon: RotateCcw },
    { id: "season", label: "Stagionale", desc: "Novità e tendenze", icon: Sun },
    { id: "custom", label: "Personalizzato", desc: "Istruzioni libere", icon: Edit3 },
  ];

  return (
    <div className="space-y-6 animate-fadeIn max-w-7xl mx-auto pb-12" id="marketing-screen">
      
      {/* 1. Header calmo, pulito e moderno (Stile Apple) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/70 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Automazione & Fedeltà
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            AI Marketing & Fidelizzazione
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Strumenti automatici per proteggere la reputazione del salone e comunicare con i clienti in modo semplice.
          </p>
        </div>

        {/* Segmented Control / Tab Bar Apple-Style */}
        <div className="inline-flex p-1 bg-slate-200/60 rounded-2xl self-start md:self-auto border border-slate-200/50 flex-wrap gap-1">
          <button
            onClick={() => setActiveTab("google_business")}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "google_business"
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <MapPin className={`w-4 h-4 ${activeTab === "google_business" ? "text-indigo-600" : "text-slate-400"}`} />
            <span>Google Business</span>
          </button>

          <button
            onClick={() => setActiveTab("feedback_shield")}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "feedback_shield"
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldCheck className={`w-4 h-4 ${activeTab === "feedback_shield" ? "text-indigo-600" : "text-slate-400"}`} />
            <span>Filtro Verità 5★</span>
          </button>

          <button
            onClick={() => setActiveTab("whatsapp")}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "whatsapp"
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Smartphone className={`w-4 h-4 ${activeTab === "whatsapp" ? "text-emerald-600" : "text-slate-400"}`} />
            <span>WhatsApp Saloni</span>
          </button>

          <button
            onClick={() => setActiveTab("new")}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "new"
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sparkles className={`w-4 h-4 ${activeTab === "new" ? "text-indigo-600" : "text-slate-400"}`} />
            <span>AI Campagne</span>
          </button>

          <button
            onClick={() => setActiveTab("test_data")}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "test_data"
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className={`w-4 h-4 ${activeTab === "test_data" ? "text-indigo-600" : "text-slate-400"}`} />
            <span>Dati Test</span>
          </button>
        </div>
      </div>

      {/* 0. Vista Google Business Manager */}
      {activeTab === "google_business" && (
        <GoogleBusinessManager />
      )}

      {/* 1. Vista Filtro Verità */}
      {activeTab === "feedback_shield" && (
        <FeedbackShieldManager />
      )}

      {/* 3. Vista WhatsApp Saloni */}
      {activeTab === "whatsapp" && (
        <WhatsAppSalonManager />
      )}

      {/* 4. Vista Dati Test */}
      {activeTab === "test_data" && (
        <TestDataManager />
      )}

      {/* 5. Vista AI Campagne (Studio Minimale & Tranquillo) */}
      {activeTab === "new" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          
          {/* Colonna Sinistra: Configurazione Semplice */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5">
              
              {/* Titolo Sezione */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  1. Scegli il Tipo di Campagna
                </div>
                <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Assistente IA
                </span>
              </div>

              {/* Opzioni Campagna in Card Pulite */}
              <div className="grid grid-cols-2 gap-2">
                {promoOptions.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = promoType === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPromoType(opt.id as any)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                          : "border-slate-200/80 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Icon className={`w-4 h-4 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                      </div>
                      <div>
                        <div className={`text-xs font-bold ${isSelected ? "text-indigo-950" : "text-slate-800"}`}>
                          {opt.label}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Testo personalizzato se custom */}
              {promoType === "custom" && (
                <div className="space-y-1.5 pt-1">
                  <label className="block text-xs font-semibold text-slate-600">
                    Cosa desideri promuovere?
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Esempio: Trattamento cheratina al 20% di sconto per tutto il weekend..."
                    value={customBrief}
                    onChange={(e) => setCustomBrief(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:border-indigo-600 resize-none font-medium text-slate-800"
                  />
                </div>
              )}

              {/* Destinatari Segmentati */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-600">
                  Destinatari della Campagna
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100/70 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTargetType("all")}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      targetType === "all"
                        ? "bg-white text-slate-900 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Tutti ({customers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTargetType("salon"); if (salons[0]) setSelectedSalonId(salons[0].id); }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      targetType === "salon"
                        ? "bg-white text-slate-900 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Per Sede
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType("special_prices")}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      targetType === "special_prices"
                        ? "bg-white text-slate-900 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Fedeltà
                  </button>
                </div>

                {targetType === "salon" && (
                  <select
                    value={selectedSalonId}
                    onChange={(e) => setSelectedSalonId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl outline-none text-slate-700 mt-2 font-medium"
                  >
                    {salons.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Parametri Rapidi (Sconto & Tono) */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Sconto %
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl outline-none focus:border-indigo-600 font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Tono
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl outline-none text-slate-700 font-medium"
                  >
                    <option value="friendly">Accogliente</option>
                    <option value="elegant">Elegante</option>
                    <option value="urgent">Limitato / Flash</option>
                  </select>
                </div>
              </div>

              {/* Bottone Generazione */}
              <button
                type="button"
                onClick={generateCampaignContent}
                disabled={isGenerating}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                {isGenerating ? "Generazione testo in corso..." : "Genera Testo con IA"}
              </button>

            </div>
          </div>

          {/* Colonna Destra: Anteprima del Messaggio (Stile Apple Mail) */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-col justify-between h-full">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    2. Anteprima Messaggio
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    ~ {targetCount} {targetCount === 1 ? "destinatario" : "destinatari"}
                  </span>
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                    {errorMsg}
                  </div>
                )}

                {/* Scheda Anteprima Email / Messaggio */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs bg-slate-50/50">
                  <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 text-slate-600 space-y-0.5">
                    <div><span className="font-semibold text-slate-400">Mittente:</span> {selectedSalonObject.name}</div>
                    <div><span className="font-semibold text-slate-400">Destinatario:</span> {sampleClient.name} &lt;{sampleClient.email || "cliente@esempio.it"}&gt;</div>
                  </div>
                  
                  <div className="bg-white p-5 min-h-[220px] whitespace-pre-wrap leading-relaxed text-slate-800 font-normal">
                    {isGenerating ? (
                      <div className="space-y-3 py-6 animate-pulse">
                        <div className="h-4 bg-slate-100 rounded w-1/3" />
                        <div className="h-3.5 bg-slate-100 rounded w-full" />
                        <div className="h-3.5 bg-slate-100 rounded w-5/6" />
                        <div className="h-3.5 bg-slate-100 rounded w-4/6" />
                      </div>
                    ) : generatedText ? (
                      generatedText.replace(/\[Nome\]/g, sampleClient.name.split(" ")[0])
                    ) : (
                      <p className="text-slate-400 italic text-center pt-10">
                        Clicca su "Genera Testo con IA" per visualizzare l'anteprima.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottoni di Azione */}
              <div className="pt-4 border-t border-slate-100 mt-5 space-y-3">
                {campaignInviata && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Campagna programmata e inviata con successo ai destinatari!</span>
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleCopyText}
                    type="button"
                    disabled={!generatedText || isGenerating}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Copiato!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        Copia Testo
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSimulateSend}
                    type="button"
                    disabled={!generatedText || isGenerating || campaignInviata}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Invia ai Clienti
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
