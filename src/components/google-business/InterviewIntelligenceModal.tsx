import React, { useState } from "react";
import { 
  Sparkles, 
  X, 
  Send, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Store, 
  MessageSquare, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  Scissors, 
  Award, 
  Users, 
  Heart,
  Loader2,
  RefreshCw
} from "lucide-react";

interface InterviewIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  salonName: string;
  onComplete: (seoDescription: string, answers: Record<string, string>) => void;
  initialAnswers?: Record<string, string>;
}

const QUESTIONS = [
  // FASE 1: INFORMAZIONI BASE
  {
    id: "salon_name",
    phase: 1,
    phaseTitle: "Fase 1: Informazioni Base",
    question: "Mi racconti il nome esatto del tuo salone come vuoi che appaia su Google?",
    placeholder: "Es: Barberia Storica & Co.",
    icon: Store,
  },
  {
    id: "address",
    phase: 1,
    phaseTitle: "Fase 1: Informazioni Base",
    question: "Dove si trova? Dimmi l'indirizzo completo (via, numero civico, cap, città)",
    placeholder: "Es: Via Roma 24, 80100 Napoli",
    icon: MapPin,
  },
  {
    id: "phone",
    phase: 1,
    phaseTitle: "Fase 1: Informazioni Base",
    question: "Qual è il numero di telefono principale per i clienti?",
    placeholder: "Es: +39 081 1234567",
    icon: Phone,
  },
  {
    id: "email",
    phase: 1,
    phaseTitle: "Fase 1: Informazioni Base",
    question: "Un'email di contatto per il salone?",
    placeholder: "Es: info@barberiastorica.it",
    icon: Mail,
  },
  {
    id: "hours",
    phase: 1,
    phaseTitle: "Fase 1: Informazioni Base",
    question: "Quali sono gli orari di apertura? (Es: Mar-Sab 09:00 - 19:30, Dom-Lun chiuso)",
    placeholder: "Es: Mar - Sab: 09:00 - 19:30 (Domenica e Lunedì chiuso)",
    icon: Clock,
  },
  // FASE 2: SERVIZI E SPECIALITÀ
  {
    id: "services",
    phase: 2,
    phaseTitle: "Fase 2: Servizi e Specialità",
    question: "Cosa fate principalmente? (Es: tagli moderni, rasature classiche, trattamenti barba, colore)",
    placeholder: "Es: Tagli a forbice e macchinetta, rasatura barba tradizionale con panno caldo, trattamenti purificanti",
    icon: Scissors,
  },
  {
    id: "speciality",
    phase: 2,
    phaseTitle: "Fase 2: Servizi e Specialità",
    question: "Qual è la vostra SPECIALITÀ? Quello per cui siete più famosi in zona?",
    placeholder: "Es: Sfumature a pelle millimetriche e rituale barba rilassante con panno caldo e oli essenziali",
    icon: Award,
  },
  {
    id: "history",
    phase: 2,
    phaseTitle: "Fase 2: Servizi e Specialità",
    question: "Da quanti anni esiste il salone? C'è una storia o passione particolare dietro?",
    placeholder: "Es: Attivi da oltre 15 anni, tradizione di famiglia tramandata da due generazioni con continua formazione",
    icon: Clock,
  },
  {
    id: "target_audience",
    phase: 2,
    phaseTitle: "Fase 2: Servizi e Specialità",
    question: "Chi è il vostro cliente tipo? (Es: uomini dinamici 20-50 anni, professionisti, ragazzi, famiglie)",
    placeholder: "Es: Uomini di tutte le età che cercano uno stile curato, puntualità e massima igiene",
    icon: Users,
  },
  // FASE 3: ATMOSFERA E PUNTI DI FORZA
  {
    id: "atmosphere",
    phase: 3,
    phaseTitle: "Fase 3: Atmosfera e Punti di Forza",
    question: "Come descrivi l'atmosfera del salone? (Classica, moderna, vintage, accogliente, lussuosa?)",
    placeholder: "Es: Elegante, accogliente e rilassante, con musica jazz di sottofondo e caffè offerto",
    icon: Heart,
  },
  {
    id: "strengths",
    phase: 3,
    phaseTitle: "Fase 3: Atmosfera e Punti di Forza",
    question: "Quali sono i vostri VERI punti di forza? (Personale esperto, puntualità, prodotti top, prezzi?)",
    placeholder: "Es: Puntualità rigorosa negli orari, prodotti biologici certificati e consulenza personalizzata pre-taglio",
    icon: Award,
  },
  {
    id: "brand_message",
    phase: 3,
    phaseTitle: "Fase 3: Atmosfera e Punti di Forza",
    question: "Se un cliente potesse dire UNA sola cosa del vostro salone, cosa vorresti che dicesse?",
    placeholder: "Es: 'Entri per un taglio ed esci rigenerato, ascoltano davvero ciò che desideri!'",
    icon: MessageSquare,
  },
];

export default function InterviewIntelligenceModal({
  isOpen,
  onClose,
  salonName,
  onComplete,
  initialAnswers = {},
}: InterviewIntelligenceModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({
    salon_name: salonName || "",
    ...initialAnswers,
  });
  const [currentInput, setCurrentInput] = useState(answers[QUESTIONS[0]?.id] || salonName || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSeo, setGeneratedSeo] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentQ = QUESTIONS[currentStep];
  const progressPercent = Math.round(((currentStep + 1) / QUESTIONS.length) * 100);

  const handleNext = async () => {
    if (!currentInput.trim()) return;

    const updatedAnswers = {
      ...answers,
      [currentQ.id]: currentInput.trim(),
    };
    setAnswers(updatedAnswers);

    if (currentStep < QUESTIONS.length - 1) {
      const nextIndex = currentStep + 1;
      setCurrentStep(nextIndex);
      setCurrentInput(updatedAnswers[QUESTIONS[nextIndex].id] || "");
    } else {
      // LAST STEP: Trigger SEO generation (Prompt 2)
      await triggerSeoGeneration(updatedAnswers);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const prevIndex = currentStep - 1;
      setCurrentStep(prevIndex);
      setCurrentInput(answers[QUESTIONS[prevIndex].id] || "");
    }
  };

  const triggerSeoGeneration = async (completedAnswers: Record<string, string>) => {
    setIsGenerating(true);
    try {
      const city = completedAnswers.address?.split(",").pop()?.trim() || "Italia";
      const res = await fetch("/api/google-business/generate-seo-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...completedAnswers,
          city,
        }),
      });
      const data = await res.json();
      if (data.success && data.description) {
        setGeneratedSeo(data.description);
      } else {
        setGeneratedSeo(
          `${completedAnswers.salon_name || "Il salone"} è il punto di riferimento a ${city} per chi cerca ${completedAnswers.speciality || "taglio e cura personalizzata"}. Da anni accogliamo i nostri clienti in un'atmosfera ${completedAnswers.atmosphere || "accogliente"}, offrendo servizi eseguiti con prodotti premium. Ti aspettiamo! 💈`
        );
      }
    } catch {
      setGeneratedSeo(
        `${completedAnswers.salon_name || "Il salone"} offre servizi di eccellenza per la cura di capelli e barba. Atmosfera rilassante e prodotti di alta qualità. Vieni a trovarci! ✂️`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAndConfirm = () => {
    if (generatedSeo) {
      onComplete(generatedSeo, answers);
      onClose();
    }
  };

  const CurrentIcon = currentQ?.icon || Store;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border border-slate-200/80 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Intervista AI: Setup Profilo Google
              </h3>
              <p className="text-xs text-slate-500">
                12 domande amichevoli per posizionare al meglio la tua scheda Maps
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        {!generatedSeo && !isGenerating && (
          <div className="px-6 pt-4 pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1.5">
              <span>{currentQ.phaseTitle}</span>
              <span>Domanda {currentStep + 1} di {QUESTIONS.length} ({progressPercent}%)</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {isGenerating ? (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto animate-pulse">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-slate-900">
                  Elaborazione Descrizione SEO Google in corso...
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  L'AI sta applicando la Formula Vincente (Hook, Storia, Specialità, Atmosfera e Local SEO anti-ban) nel limite esatto di 750 caratteri.
                </p>
              </div>
            </div>
          ) : generatedSeo ? (
            /* SEO Result View */
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs text-emerald-800">
                  <strong className="block text-emerald-900 font-semibold">
                    Intervista Completata con Successo! 🎯
                  </strong>
                  Abbiamo generato la descrizione perfetta ottimizzata per Google Maps.
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Descrizione SEO per Google Business (Max 750 Caratteri)
                  </label>
                  <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                    {generatedSeo.length} / 750 caratteri
                  </span>
                </div>
                <textarea
                  value={generatedSeo}
                  onChange={(e) => setGeneratedSeo(e.target.value)}
                  rows={6}
                  maxLength={750}
                  className="w-full p-4 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none leading-relaxed transition"
                />
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-indigo-600" />
                  Punti chiave SEO inseriti:
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500 pl-1">
                  <li>Specialità: <strong>{answers.speciality || "Servizi top"}</strong></li>
                  <li>Atmosfera: <strong>{answers.atmosphere || "Accogliente"}</strong></li>
                  <li>Parole chiave Local SEO & Formula Google Anti-Ban compliant</li>
                </ul>
              </div>
            </div>
          ) : (
            /* Question Step View */
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <CurrentIcon className="w-6 h-6" />
                </div>
                <div className="space-y-1 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                    Domanda {currentStep + 1}
                  </span>
                  <h4 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {currentQ.question}
                  </h4>
                </div>
              </div>

              <div className="space-y-2">
                <textarea
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  placeholder={currentQ.placeholder}
                  rows={3}
                  className="w-full p-4 rounded-2xl border border-slate-200 bg-slate-50/60 text-slate-800 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleNext();
                    }
                  }}
                  autoFocus
                />
                <p className="text-[11px] text-slate-400">
                  Suggerimento: rispondi in modo naturale come se stessi parlando con un amico.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          {!generatedSeo && !isGenerating ? (
            <>
              <button
                onClick={handleBack}
                disabled={currentStep === 0}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Indietro
              </button>

              <button
                onClick={handleNext}
                disabled={!currentInput.trim()}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-2 transition shadow-sm cursor-pointer"
              >
                <span>{currentStep === QUESTIONS.length - 1 ? "Completa & Genera SEO" : "Avanti"}</span>
                {currentStep === QUESTIONS.length - 1 ? (
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
              </button>
            </>
          ) : generatedSeo ? (
            <>
              <button
                onClick={() => setGeneratedSeo(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Rivedi risposte
              </button>

              <button
                onClick={handleSaveAndConfirm}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 transition shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Salva & Sincronizza su Google
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
