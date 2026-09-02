import React, { useState, useEffect } from "react";
import { 
  Heart, 
  Sparkles, 
  ThumbsUp, 
  MessageSquare, 
  Star, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Store,
  Loader2,
  Smile,
  ShieldAlert
} from "lucide-react";

interface FeedbackShieldScreenProps {
  token: string;
}

export default function FeedbackShieldScreen({ token }: FeedbackShieldScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  
  // Interaction states: "initial" | "positive_submitted" | "negative_form" | "negative_submitted"
  const [step, setStep] = useState<"initial" | "positive_submitted" | "negative_form" | "negative_submitted">("initial");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchDetails() {
      try {
        setLoading(true);
        const res = await fetch(`/api/feedback-shield/details?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          if (json.data.answer === "positive") {
            setStep("positive_submitted");
          } else if (json.data.answer === "negative") {
            setStep("negative_submitted");
            setNotes(json.data.feedbackNotes || "");
          }
        } else {
          setError(json.error === "not_found" ? "Link di feedback non valido o scaduto." : "Impossibile caricare i dati.");
        }
      } catch (err: any) {
        setError("Errore di connessione. Ricarica la pagina.");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchDetails();
    }
  }, [token]);

  const handleSelectPositive = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/feedback-shield/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          answer: "positive",
        }),
      });
      setStep("positive_submitted");
    } catch (err) {
      console.error("Error submitting positive feedback:", err);
      setStep("positive_submitted");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectNegative = () => {
    setStep("negative_form");
  };

  const handleSubmitNegative = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/feedback-shield/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          answer: "negative",
          notes: notes.trim(),
        }),
      });
      setStep("negative_submitted");
    } catch (err) {
      console.error("Error submitting negative feedback:", err);
      setStep("negative_submitted");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Caricamento in corso...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-xl border border-slate-200/80">
          <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Link non disponibile</h2>
          <p className="text-sm text-slate-500">{error || "Questo link di feedback è già stato utilizzato o non è valido."}</p>
        </div>
      </div>
    );
  }

  const firstName = data.customerName?.split(" ")[0] || "Gentile Cliente";
  const salonName = data.salonName || "Il Nostro Salone";
  const googleReviewUrl = data.googleReviewUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salonName)}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/50 via-slate-50 to-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-indigo-950/5 border border-slate-100 overflow-hidden animate-fadeIn transition-all">
        
        {/* Salon Branding Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-indigo-300 mx-auto mb-3 shadow-inner">
            <Store className="w-7 h-7" />
          </div>
          <span className="text-[11px] uppercase tracking-widest text-indigo-300 font-bold">
            Esperienza in Salone
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white mt-0.5">
            {salonName}
          </h1>
        </div>

        <div className="p-6 sm:p-8">
          
          {/* STEP 1: INITIAL QUESTION */}
          {step === "initial" && (
            <div className="space-y-6 text-center animate-fadeIn">
              <div className="space-y-2">
                <h2 className="text-xl font-black text-slate-900">
                  Ciao {firstName}! ✨
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Grazie per la tua visita di oggi! La tua soddisfazione è la nostra priorità assoluta. Come è andata la tua esperienza?
                </p>
              </div>

              {/* TWO MAIN ACTION BUTTONS */}
              <div className="space-y-3 pt-2">
                
                {/* 1. TUTTO PERFETTO */}
                <button
                  type="button"
                  onClick={handleSelectPositive}
                  disabled={submitting}
                  className="w-full group bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white p-4.5 rounded-2xl font-extrabold text-base shadow-lg shadow-emerald-900/15 flex items-center justify-between transition-all hover:scale-[1.02] active:scale-[0.99] cursor-pointer border border-emerald-400/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">😍</span>
                    <div className="text-left">
                      <div className="text-sm font-black">Tutto Perfetto!</div>
                      <div className="text-[11px] text-emerald-100 font-medium flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                        <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                        <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                        <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                        <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                        <span className="ml-1">Super soddisfatta/o</span>
                      </div>
                    </div>
                  </div>
                  <ThumbsUp className="w-5 h-5 text-emerald-200 group-hover:translate-x-1 transition-transform" />
                </button>

                {/* 2. C'E' QUALCOSA CHE NON VA */}
                <button
                  type="button"
                  onClick={handleSelectNegative}
                  disabled={submitting}
                  className="w-full group bg-slate-50 hover:bg-rose-50/70 text-slate-700 hover:text-rose-800 p-4 rounded-2xl font-bold text-sm border border-slate-200 hover:border-rose-300 flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💬</span>
                    <div className="text-left">
                      <div className="text-sm font-bold">C'è qualcosa che non va</div>
                      <div className="text-[11px] text-slate-500 font-normal">Vorrei spiegare cosa migliorare</div>
                    </div>
                  </div>
                  <MessageSquare className="w-4 h-4 text-slate-400 group-hover:text-rose-600 transition-colors" />
                </button>

              </div>

              <p className="text-[11px] text-slate-400 italic">
                Ci vogliono solo 5 secondi e ci aiuta a offrirti sempre il meglio.
              </p>
            </div>
          )}

          {/* STEP 2: POSITIVE SUBMITTED -> GOOGLE MAPS REVIEW PROMPT */}
          {step === "positive_submitted" && (
            <div className="space-y-6 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <Heart className="w-8 h-8 fill-emerald-500 text-emerald-500 animate-pulse" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-black text-slate-900">
                  Che gioia, grazie {firstName}! ❤️
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Siamo felicissimi che tutto sia stato perfetto. Ti andrebbe di dedicarci 10 secondi per lasciare una recensione a 5 stelle su Google? Per noi fa un'enorme differenza!
                </p>
              </div>

              <div className="bg-amber-50/80 border border-amber-200/70 rounded-2xl p-4 flex items-center justify-center gap-1.5 text-amber-900">
                <div className="flex text-amber-500">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="text-xs font-bold ml-1">Aiutaci con 5 stelle su Google!</span>
              </div>

              <a
                href={googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all cursor-pointer"
              >
                <span>Lascia la Recensione su Google</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <p className="text-xs text-slate-400">
                Verrai reindirizzato direttamente alla scheda ufficiale Google del salone.
              </p>
            </div>
          )}

          {/* STEP 3: NEGATIVE FORM -> PRIVATE FEEDBACK CAPTURE (NO PUBLIC BAD REVIEW) */}
          {step === "negative_form" && (
            <form onSubmit={handleSubmitNegative} className="space-y-5 text-left animate-fadeIn">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-black text-slate-900">
                  Ci dispiace moltissimo, {firstName}!
                </h2>
                <p className="text-xs text-slate-600">
                  La tua soddisfazione è la nostra priorità e vogliamo rimediare subito. Dicci cosa non ti ha convinto oggi:
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Cosa possiamo fare per migliorare o rimediare?
                </label>
                <textarea
                  required
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Es. Il taglio non era esattamente come desideravo, tempo di attesa lungo..."
                  className="w-full p-3.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-slate-800 placeholder-slate-400 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !notes.trim()}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-3.5 px-6 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Invio in corso...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Invia feedback privato al responsabile
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep("initial")}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1"
              >
                ← Torna indietro
              </button>
            </form>
          )}

          {/* STEP 4: NEGATIVE SUBMITTED ACKNOWLEDGEMENT */}
          {step === "negative_submitted" && (
            <div className="space-y-5 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-black text-slate-900">
                  Messaggio ricevuto con priorità
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Grazie per la tua sincerità. Il titolare di <strong>{salonName}</strong> ha ricevuto la tua nota e ti contatterà al più presto per trovare la soluzione migliore e rimediare.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 text-left">
                <strong>La tua nota inviata:</strong>
                <p className="italic text-slate-700 mt-1">"{notes}"</p>
              </div>

              <p className="text-xs text-slate-400">
                La tua opinione ci aiuta a crescere ogni giorno. A presto in salone!
              </p>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-center text-[10px] text-slate-400">
          Protezione Esperienza & Feedback Diretto • {salonName}
        </div>

      </div>
    </div>
  );
}
