import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  X, 
  Send, 
  HelpCircle, 
  Loader2, 
  MessageCircle,
  ChevronDown,
  BookOpen,
  Calendar,
  CreditCard,
  Users,
  Package,
  Lock,
  Check,
  ArrowRight
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useBusiness } from "../context/BusinessContext";
import { PLAN_LIMITS } from "../lib/plans";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  source?: string;
  note?: string;
  timestamp: Date;
}

interface SaaSAssistantProps {
  currentTab?: string;
  setCurrentTab?: (tab: string) => void;
}

export default function SaaSAssistant({ currentTab, setCurrentTab }: SaaSAssistantProps) {
  const { businessSettings, userRole } = useBusiness();
  const userPlan = businessSettings?.userPlan || "network";
  const hasChatbotAccess = userPlan === "solo_pro" || userPlan === "network" || userPlan === "elite_ai" || userPlan === "unlimited";

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "model",
      content: "Ciao! Sono **SforbiciaSmart AI Coach**, il tuo assistente virtuale dedicato. Sono qui per guidarti passo dopo passo nell'uso di SforbiciaSmart per gestire e far crescere il tuo salone di bellezza.\n\nChiedimi pure come effettuare qualsiasi operazione nella piattaforma!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Alert the user about new message when closed
  useEffect(() => {
    if (!isOpen && messages.length > 1) {
      setHasNewMessage(true);
    }
  }, [messages.length, isOpen]);

  const handleOpenToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setHasNewMessage(false);
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMessage: Message = {
      id: userMsgId,
      role: "user",
      content: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Build history for backend, keeping only role and content
      const history = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
      });

      if (!response.ok) {
        throw new Error("Errore durante la comunicazione con il server.");
      }

      const data = await response.json();
      
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: "model",
        content: data.text || "Non ho ricevuto risposta. Riprova.",
        source: data.source,
        note: data.note,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: "model",
        content: "Mi dispiace, si è verificato un errore di connessione. Riprova tra qualche istante.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Pre-configured typical questions to guide the user
  const starterQuestions = [
    { label: "Prenotare appuntamento", text: "Come faccio a prenotare un appuntamento in Agenda?", icon: Calendar },
    { label: "Registrare incassi", text: "Come posso registrare un pagamento o completare una prestazione?", icon: CreditCard },
    { label: "Gestire il magazzino", text: "Come si aggiungono prodotti all'inventario e si controllano le scorte?", icon: Package },
    { label: "Campagne Marketing", text: "Come posso creare un SMS o una Newsletter di marketing con l'AI?", icon: Sparkles }
  ];

  // Zero-dependency rich inline markdown parser
  const formatMessageText = (text: string) => {
    return text.split("\n").map((line, index) => {
      // Check for bold elements (**)
      let content: React.ReactNode = line;
      const boldRegex = /\*\*(.*?)\*\*/g;
      
      if (boldRegex.test(line)) {
        const parts = line.split(boldRegex);
        content = parts.map((part, i) => {
          if (i % 2 === 1) {
            return <strong key={i} className="font-extrabold text-blue-950">{part}</strong>;
          }
          return part;
        });
      }

      // Render bullet list items
      if (line.trim().startsWith("* ") || line.trim().startsWith("- ")) {
        return (
          <li key={index} className="ml-4 list-disc my-1 text-sm text-slate-700 leading-relaxed">
            {typeof content === "string" ? content.replace(/^[\s*\-]+/, "") : content}
          </li>
        );
      }

      // Render numbered list items
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <li key={index} className="ml-4 list-decimal my-1 text-sm text-slate-700 leading-relaxed">
            {numMatch[2]}
          </li>
        );
      }

      // Empty line spacing
      if (!line.trim()) {
        return <div key={index} className="h-2" />;
      }

      // Standard paragraphs
      return (
        <p key={index} className="text-sm text-slate-700 leading-relaxed my-0.5">
          {content}
        </p>
      );
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {/* Floating Toggle Button */}
      <motion.button
        onClick={handleOpenToggle}
        id="btn-chatbot-toggle"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl cursor-pointer relative transition-all ${
          isOpen 
            ? "bg-slate-800 text-white" 
            : "bg-[#1a3a8f] text-white hover:bg-[#152f73]"
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <div className="relative">
            <MessageCircle className="w-6 h-6 animate-pulse" />
            <Sparkles className="w-3.5 h-3.5 text-amber-300 absolute -top-1.5 -right-1.5" />
          </div>
        )}

        {/* Unread Alert Badge */}
        {hasNewMessage && !isOpen && (
          <span className="absolute top-0 right-0 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
          </span>
        )}
      </motion.button>

      {/* Slide-over/Floating Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="panel-chatbot"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="absolute bottom-18 right-0 w-[calc(100vw-48px)] sm:w-[400px] h-[550px] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[80vh]"
          >
            {/* Header Banner */}
            <div className="bg-[#1a3a8f] p-4 text-white flex items-center justify-between border-b border-blue-900/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-amber-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm tracking-wide">SforbiciaSmart AI Coach</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-[10px] text-blue-100 font-medium">Guida Assistente Attiva</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-blue-100 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Chat History & Starter Queries Area or Locked Gate */}
            {!hasChatbotAccess ? (
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col items-center justify-center text-center space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm shrink-0">
                  <Lock className="w-6.5 h-6.5" />
                </div>
                
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-extrabold uppercase tracking-wider border border-amber-200">
                    Esclusivo Solo Pro
                  </span>
                  <h4 className="font-serif text-base font-bold text-[#1a2035]">
                    Sblocca SforbiciaSmart AI Coach
                  </h4>
                  <p className="text-gray-500 text-xs leading-relaxed max-w-[280px] mx-auto">
                    Il tuo assistente virtuale intelligente è disponibile a partire dal piano <strong>Solo Pro</strong>.
                  </p>
                </div>

                <div className="w-full bg-white border border-slate-100 rounded-xl p-3.5 text-left space-y-2 shadow-sm">
                  <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block">Con l'AI Coach potrai:</span>
                  <ul className="space-y-1.5 text-xs text-gray-600">
                    <li className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Risolvere problemi operativi in tempo reale.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Ricevere guide passo-passo sui 5 principi.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Ottimizzare la gestione contabile ed agenda.</span>
                    </li>
                  </ul>
                </div>

                {userRole === "owner" && setCurrentTab ? (
                  <button
                    onClick={() => {
                      setCurrentTab("account_info");
                      setIsOpen(false);
                    }}
                    className="w-full bg-[#1a3a8f] hover:bg-[#152f73] text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <span>Passa al piano Solo Pro</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <p className="text-[10px] text-gray-400 italic">
                    Contatta il titolare del salone per effettuare l'upgrade del piano.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-4">
                  
                  {/* Messages Thread */}
                  {messages.map((msg) => (
                    <div 
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fadeIn`}
                    >
                      <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm text-sm ${
                        msg.role === "user" 
                          ? "bg-[#1a3a8f] text-white rounded-br-none" 
                          : "bg-white text-slate-800 border border-slate-100 rounded-bl-none"
                      }`}>
                        
                        {/* Role Icon for AI */}
                        {msg.role === "model" && (
                          <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-blue-800 font-bold tracking-wider uppercase">
                            <Sparkles className="w-3.5 h-3.5 text-[#1a3a8f]" />
                            <span>SforbiciaSmart AI Coach</span>
                          </div>
                        )}

                        {/* Styled Text body */}
                        <div className="space-y-1">
                          {msg.role === "user" ? (
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            formatMessageText(msg.content)
                          )}
                        </div>

                        {/* Source / Emergency Fallback badge */}
                        {msg.source && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400">
                            <span>Sorgente risorsa:</span>
                            <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                              msg.source === "local-assistant-fallback" 
                                ? "bg-amber-50 text-amber-700 border border-amber-100" 
                                : "bg-blue-50 text-blue-700 border border-blue-100"
                            }`}>
                              {msg.source === "gemini-3.5-flash" ? "Google Gemini AI" : "Manuale Interno"}
                            </span>
                          </div>
                        )}

                        {/* Notice from Backup Engine */}
                        {msg.note && (
                          <div className="mt-1.5 text-[9px] text-amber-700 bg-amber-50/50 p-1 rounded font-medium">
                            ⚠️ {msg.note}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Waiting Loading state indicator */}
                  {isLoading && (
                    <div className="flex justify-start animate-fadeIn">
                      <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-none p-3.5 shadow-sm max-w-[85%] flex items-center gap-3">
                        <Loader2 className="w-4 h-4 text-[#1a3a8f] animate-spin" />
                        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider animate-pulse">
                          Sto analizzando la guida...
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Starter questions - only show when there is minimal history */}
                  {messages.length <= 2 && !isLoading && (
                    <div className="pt-4 border-t border-slate-100/80 space-y-2 animate-fadeIn">
                      <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Domande Frequenti / Guide Rapide</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {starterQuestions.map((q, idx) => {
                          const Icon = q.icon;
                          return (
                            <button
                              key={idx}
                              onClick={() => handleSendMessage(q.text)}
                              className="w-full text-left p-3 rounded-xl bg-white hover:bg-blue-50/50 border border-slate-100 hover:border-blue-100 text-slate-700 transition-all flex items-center gap-3 text-xs font-semibold cursor-pointer select-none shadow-sm/5 group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1a3a8f] flex items-center justify-center shrink-0 group-hover:bg-[#1a3a8f] group-hover:text-white transition-all">
                                <Icon className="w-4 h-4" />
                              </div>
                              <span className="flex-1 truncate">{q.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input field area */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage(input);
                  }}
                  className="p-3 bg-white border-t border-slate-100 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Chiedimi aiuto su SforbiciaSmart..."
                    disabled={isLoading}
                    className="flex-1 p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#1a3a8f] focus:border-[#1a3a8f] disabled:opacity-50 text-slate-800 placeholder-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="w-10 h-10 rounded-xl bg-[#1a3a8f] text-white hover:bg-[#152f73] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shrink-0"
                  >
                    <Send className="w-4.5 h-4.5" />
                  </button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
