import React from "react";
import { Lock, ArrowRight, Check } from "lucide-react";

interface PremiumGateProps {
  featureName: string;
  description: string;
  setCurrentTab?: (tab: string) => void;
}

export default function PremiumGate({ featureName, description, setCurrentTab }: PremiumGateProps) {
  return (
    <div className="flex-1 bg-slate-50 flex flex-col items-center justify-center p-6 text-center min-h-[500px]">
      <div className="bg-white max-w-lg w-full border border-gray-200 rounded-3xl p-8 md:p-10 shadow-xl relative overflow-hidden space-y-6">
        {/* Glowing background highlights */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#1a3a8f]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl"></div>

        <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mx-auto shadow-md">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1a3a8f]/10 text-[#1a3a8f] text-[10px] font-black uppercase tracking-wider border border-[#1a3a8f]/20">
            Funzionalità Premium
          </span>
          <h3 className="font-serif text-2xl font-bold text-gray-900 leading-tight">
            Sblocca {featureName}
          </h3>
          <p className="text-gray-500 text-sm leading-relaxed max-w-md mx-auto">
            {description}
          </p>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <div className="bg-slate-50/80 rounded-2xl p-5 text-left border border-gray-100">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-3">Vantaggi del piano Premium Network:</span>
            <ul className="space-y-2.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Gestione anagrafica clienti completa con schede tecniche avanzate.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Calcolo automatico di provvigioni e percentuali collaboratori.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Listini prezzi dedicati e tariffe personalizzate per cliente.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Reportistica di performance ed esportazioni Excel illimitate.</span>
              </li>
            </ul>
          </div>
        </div>

        {setCurrentTab && (
          <button
            type="button"
            onClick={() => setCurrentTab("account_info")}
            className="w-full bg-[#1a3a8f] hover:bg-[#152f73] text-white font-bold py-3.5 px-6 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
          >
            <span>Passa al piano Premium Network</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
