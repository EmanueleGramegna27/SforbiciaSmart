import React, { useState, useEffect } from "react";
import { 
  MessageSquare, 
  Sparkles, 
  Check, 
  Edit3, 
  RefreshCw, 
  Send, 
  Star, 
  Plus, 
  ShieldCheck, 
  Sliders, 
  Loader2, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface ReviewItem {
  id: string;
  author: string;
  rating: number;
  text: string;
  timeAgo: string;
  status: "pending_reply" | "published";
  aiSuggestedReply: string;
  publishedReply?: string | null;
  createdAt?: string;
}

interface SmartReviewCenterProps {
  salonName: string;
  salonId: string;
}

export default function SmartReviewCenter({ salonName, salonId }: SmartReviewCenterProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTone, setSelectedTone] = useState<"Informale e Giovanile" | "Professionale e Cortese" | "Simpatico e Ironico">("Informale e Giovanile");
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editedReplyText, setEditedReplyText] = useState("");
  const [isGeneratingId, setIsGeneratingId] = useState<string | null>(null);
  const [isPublishingId, setIsPublishingId] = useState<string | null>(null);
  const [showAddTestModal, setShowAddTestModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New mock review state
  const [newAuthor, setNewAuthor] = useState("");
  const [newRating, setNewRating] = useState(5);
  const [newText, setNewText] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/google-business/reviews?salonId=${salonId}`);
      const data = await res.json();
      if (data.success && data.reviews) {
        setReviews(data.reviews);
      }
    } catch (e) {
      console.warn("Error fetching reviews:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [salonId]);

  const handleRegenerateReply = async (rev: ReviewItem, customTone?: typeof selectedTone) => {
    setIsGeneratingId(rev.id);
    try {
      const res = await fetch("/api/google-business/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: rev.author,
          rating: rev.rating,
          text: rev.text,
          salon_name: salonName,
          tone: customTone || selectedTone,
        }),
      });
      const data = await res.json();
      if (data.success && data.replyText) {
        setReviews((prev) =>
          prev.map((r) => (r.id === rev.id ? { ...r, aiSuggestedReply: data.replyText } : r))
        );
        if (editingReviewId === rev.id) {
          setEditedReplyText(data.replyText);
        }
        showToast("Nuova risposta AI generata (max 150 char)!");
      }
    } catch (e) {
      showToast("Errore durante la generazione risposta");
    } finally {
      setIsGeneratingId(null);
    }
  };

  const handlePublishReply = async (rev: ReviewItem, finalReplyText?: string) => {
    setIsPublishingId(rev.id);
    const textToPublish = finalReplyText || editedReplyText || rev.aiSuggestedReply;
    try {
      const res = await fetch("/api/google-business/save-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          reviewId: rev.id,
          replyText: textToPublish,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === rev.id
              ? { ...r, status: "published", publishedReply: textToPublish }
              : r
          )
        );
        setEditingReviewId(null);
        showToast("✅ Risposta pubblicata ufficialmente su Google Maps!");
      }
    } catch (e) {
      showToast("Errore durante la pubblicazione");
    } finally {
      setIsPublishingId(null);
    }
  };

  const handleAddTestReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthor.trim() || !newText.trim()) return;

    try {
      const res = await fetch("/api/google-business/add-test-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          author: newAuthor.trim(),
          rating: newRating,
          text: newText.trim(),
          salon_name: salonName,
          tone: selectedTone,
        }),
      });
      const data = await res.json();
      if (data.success && data.reviews) {
        setReviews(data.reviews);
        setShowAddTestModal(false);
        setNewAuthor("");
        setNewText("");
        showToast("Recensione di test aggiunta con risposta AI pronta!");
      }
    } catch {
      showToast("Errore aggiunta recensione test");
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMessage && (
        <div className="p-3.5 bg-slate-900 text-white text-xs font-semibold rounded-2xl shadow-lg flex items-center justify-between animate-fadeIn">
          <span>{toastMessage}</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
      )}

      {/* Header bar: Tono Selector + Test Review button */}
      <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Tono Risposte AI:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(["Informale e Giovanile", "Professionale e Cortese", "Simpatico e Ironico"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTone(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  selectedTone === t
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowAddTestModal(true)}
          className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0 self-end sm:self-center"
        >
          <Plus className="w-4 h-4 text-indigo-600" />
          <span>Simula Nuova Recensione</span>
        </button>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-center justify-center items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>Caricamento recensioni Google Maps...</span>
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500">
              Nessuna recensione ancora ricevuta. Usa il pulsante in alto per simularne una!
            </p>
          </div>
        ) : (
          reviews.map((rev) => {
            const isEditing = editingReviewId === rev.id;
            const isGenerating = isGeneratingId === rev.id;
            const isPublishing = isPublishingId === rev.id;
            const isPublished = rev.status === "published";

            return (
              <div
                key={rev.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 transition"
              >
                {/* Author + Stars + Time */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{rev.author}</span>
                      <span className="text-[11px] text-slate-400 font-medium">{rev.timeAgo}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < rev.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0">
                    {isPublished ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        <Check className="w-3 h-3" />
                        Pubblicata su Google
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        Risposta AI Pronta
                      </span>
                    )}
                  </div>
                </div>

                {/* Review Text */}
                <p className="text-xs text-slate-700 bg-slate-50/70 p-3 rounded-xl border border-slate-100 leading-relaxed italic">
                  "{rev.text}"
                </p>

                {/* Published or Suggested Reply Box */}
                <div className="pt-1">
                  {isPublished ? (
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-950 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Risposta Titolare inviata:
                      </div>
                      <p className="italic text-slate-700">
                        "{rev.publishedReply || rev.aiSuggestedReply}"
                      </p>
                    </div>
                  ) : isEditing ? (
                    <div className="space-y-2 bg-indigo-50/40 p-3.5 rounded-xl border border-indigo-100">
                      <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                        <span>Modifica risposta prima di pubblicare:</span>
                        <span className="font-mono text-indigo-600">{editedReplyText.length}/150</span>
                      </div>
                      <textarea
                        value={editedReplyText}
                        onChange={(e) => setEditedReplyText(e.target.value)}
                        maxLength={150}
                        rows={2}
                        className="w-full p-2.5 bg-white border border-indigo-200 rounded-lg text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingReviewId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                        >
                          Annulla
                        </button>
                        <button
                          onClick={() => handlePublishReply(rev, editedReplyText)}
                          disabled={!editedReplyText.trim() || isPublishing}
                          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Salva & Pubblica
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-indigo-50/50 border border-indigo-100/80 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>AI Suggest (Tono: {selectedTone}):</span>
                        </div>
                        <span className="text-[10px] font-mono text-indigo-400">
                          {rev.aiSuggestedReply.length}/150 char
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 font-medium leading-relaxed bg-white/80 p-2.5 rounded-lg border border-indigo-100/50">
                        "{rev.aiSuggestedReply}"
                      </p>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() => handlePublishReply(rev)}
                          disabled={isPublishing}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                        >
                          {isPublishing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                          <span>Pubblica</span>
                        </button>

                        <button
                          onClick={() => {
                            setEditingReviewId(rev.id);
                            setEditedReplyText(rev.aiSuggestedReply);
                          }}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Modifica</span>
                        </button>

                        <button
                          onClick={() => handleRegenerateReply(rev)}
                          disabled={isGenerating}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isGenerating ? "animate-spin" : ""}`} />
                          <span>Rigenera con AI</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Add Mock Review */}
      {showAddTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                Simula Nuova Recensione
              </h4>
              <button
                onClick={() => setShowAddTestModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddTestReview} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nome Cliente</label>
                <input
                  type="text"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  placeholder="Es: Giorgio Neri"
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Valutazione Stelle</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setNewRating(st)}
                      className={`p-2 rounded-xl border transition cursor-pointer ${
                        newRating >= st
                          ? "bg-amber-50 border-amber-300 text-amber-500"
                          : "bg-slate-50 border-slate-200 text-slate-300"
                      }`}
                    >
                      <Star className={`w-4 h-4 ${newRating >= st ? "fill-amber-400" : ""}`} />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-700 ml-2">{newRating} Stelle</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Testo della Recensione</label>
                <textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Es: Taglio eseguito a regola d'arte, staff gentilissimo!"
                  rows={3}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTestModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Aggiungi & Genera Risposta AI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
