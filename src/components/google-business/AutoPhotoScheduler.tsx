import React, { useState, useEffect } from "react";
import { 
  Camera, 
  Sparkles, 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Check, 
  CheckCircle2, 
  ShieldCheck, 
  Loader2, 
  Image as ImageIcon, 
  Send,
  AlertTriangle
} from "lucide-react";

interface PhotoQueueItem {
  id: string;
  title: string;
  photoType: "taglio" | "ambiente" | "team" | "prodotti" | "risultato";
  caption: string;
  scheduledDay: string;
  scheduledTime: string;
  scheduledDateIso: string;
  status: "queued" | "published";
  imageUrl: string;
  tips?: string;
  publishedAt?: string;
}

interface AutoPhotoSchedulerProps {
  salonName: string;
  salonId: string;
}

export default function AutoPhotoScheduler({ salonName, salonId }: AutoPhotoSchedulerProps) {
  const [queue, setQueue] = useState<PhotoQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPublished, setTotalPublished] = useState(12);
  const [nextAvailableDay, setNextAvailableDay] = useState("Sabato");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Upload Form state
  const [photoType, setPhotoType] = useState<"taglio" | "ambiente" | "team" | "prodotti" | "risultato">("taglio");
  const [photoTitle, setPhotoTitle] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/google-business/photo-queue?salonId=${salonId}`);
      const data = await res.json();
      if (data.success && data.queue) {
        setQueue(data.queue);
        if (data.totalPublishedThisMonth !== undefined) {
          setTotalPublished(data.totalPublishedThisMonth);
        }
        if (data.nextAvailableDay) {
          setNextAvailableDay(data.nextAvailableDay);
        }
      }
    } catch (e) {
      console.warn("Error fetching photo queue:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [salonId]);

  const handleAddPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      const presetImages: Record<string, string> = {
        taglio: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&auto=format&fit=crop&q=60",
        ambiente: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=500&auto=format&fit=crop&q=60",
        team: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60",
        prodotti: "https://images.unsplash.com/photo-1621607512214-68297480165e?w=500&auto=format&fit=crop&q=60",
        risultato: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=500&auto=format&fit=crop&q=60",
      };

      const finalUrl = photoUrl.trim() || presetImages[photoType];

      const res = await fetch("/api/google-business/add-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          salon_name: salonName,
          photo_type: photoType,
          title: photoTitle || `Foto ${photoType}`,
          imageUrl: finalUrl,
        }),
      });

      const data = await res.json();
      if (data.success && data.queue) {
        setQueue(data.queue);
        setShowUploadModal(false);
        setPhotoTitle("");
        setPhotoUrl("");
        showToast("📸 Foto approvata dall'Anti-Ban e schedulata con successo!");
      }
    } catch {
      showToast("Errore durante l'aggiunta foto");
    } finally {
      setIsUploading(false);
    }
  };

  const handlePublishNow = async (photoId: string) => {
    try {
      const res = await fetch("/api/google-business/publish-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, photoId }),
      });
      const data = await res.json();
      if (data.success && data.queue) {
        setQueue(data.queue);
        setTotalPublished((prev) => prev + 1);
        showToast("✅ Foto pubblicata istantaneamente su Google Maps!");
      }
    } catch {
      showToast("Errore durante la pubblicazione");
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      const res = await fetch(`/api/google-business/delete-photo`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, photoId }),
      });
      const data = await res.json();
      if (data.success && data.queue) {
        setQueue(data.queue);
        showToast("Foto rimossa dalla coda");
      }
    } catch {
      showToast("Errore durante la cancellazione");
    }
  };

  const queuedPhotos = queue.filter((p) => p.status === "queued");

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMessage && (
        <div className="p-3.5 bg-slate-900 text-white text-xs font-semibold rounded-2xl shadow-lg flex items-center justify-between animate-fadeIn">
          <span>{toastMessage}</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
      )}

      {/* Overview stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Foto in coda
            </div>
            <div className="text-xl font-bold text-slate-900">
              {queuedPhotos.length}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Pubblicate questo mese
            </div>
            <div className="text-xl font-bold text-slate-900">
              {totalPublished}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Cadenza Sicura Anti-Ban
            </div>
            <div className="text-sm font-bold text-slate-900">
              {nextAvailableDay} (Consigliato)
            </div>
          </div>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          <h4 className="text-sm font-bold text-slate-900">
            Coda di Pubblicazione Naturale
          </h4>
          <p className="text-xs text-slate-500">
            L'AI programma orari con minuti non arrotondati per simulare un caricamento umano autentico
          </p>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 text-indigo-300" />
          <span>Carica Nuova Foto</span>
        </button>
      </div>

      {/* Photo Queue Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>Caricamento schedule foto...</span>
          </div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
            <Camera className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500">
              Nessuna foto programmata. Clicca su "Carica Nuova Foto" per iniziare la pubblicazione automatica.
            </p>
          </div>
        ) : (
          queue.map((photo) => {
            const isPub = photo.status === "published";
            return (
              <div
                key={photo.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-slate-300 transition shadow-xs"
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <img
                    src={photo.imageUrl}
                    alt={photo.title}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0 bg-slate-100"
                  />
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                        {photo.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                        {photo.photoType}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium italic truncate">
                      "{photo.caption}"
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1 font-semibold text-indigo-600">
                        <Calendar className="w-3 h-3" />
                        {photo.scheduledDay} ore {photo.scheduledTime}
                      </span>
                      {isPub ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-bold">
                          <Check className="w-3 h-3" />
                          Pubblicata
                        </span>
                      ) : (
                        <span className="text-amber-600 font-semibold">
                          ⏳ In coda programmata
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {!isPub && (
                    <button
                      onClick={() => handlePublishNow(photo.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      title="Pubblica subito su Google Maps"
                    >
                      <Send className="w-3 h-3" />
                      <span>Pubblica Ora</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title="Rimuovi foto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Upload Photo */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600" />
                Carica Foto & Schedulazione Anti-Ban
              </h4>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPhoto} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Categoria Foto</label>
                <select
                  value={photoType}
                  onChange={(e) => setPhotoType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-100 bg-slate-50/50"
                >
                  <option value="taglio">Taglio / Sfumatura / Barba</option>
                  <option value="ambiente">Ambiente Salone / Poltrone</option>
                  <option value="team">Team & Collaboratori al lavoro</option>
                  <option value="prodotti">Prodotti & Trattamenti</option>
                  <option value="risultato">Risultato Finale Cliente</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Titolo Lavoro / Descrizione Breve</label>
                <input
                  type="text"
                  value={photoTitle}
                  onChange={(e) => setPhotoTitle(e.target.value)}
                  placeholder="Es: Taglio moderno con sfumatura forbice e rasoio"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">URL Immagine (opzionale)</label>
                <input
                  type="url"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="Lascia vuoto per usare immagine ad alta risoluzione predefinita"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-[11px] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Protezione Anti-Ban Attiva:
                </div>
                <p className="text-amber-700">
                  L'AI genererà automaticamente una didascalia descrittiva (max 100 char) e assegnerà un orario naturale (es. Mercoledì alle 11:47).
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-300" />}
                  <span>Valida & Schedula</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
