import React, { useState } from "react";
import { 
  Scissors, 
  LayoutGrid, 
  Store, 
  Calendar, 
  Users, 
  Package,
  MessageSquare,
  LogOut, 
  Menu, 
  X, 
  User as UserIcon,
  Plus,
  Receipt,
  FileText,
  Percent,
  WifiOff
} from "lucide-react";
import { auth } from "../lib/firebase";
import { useBusiness } from "../context/BusinessContext";
import { signOut } from "firebase/auth";
import SaaSAssistant from "./SaaSAssistant";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

interface LayoutProps {
  children: React.ReactNode;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onNewBookingClick: () => void;
}

export default function Layout({ 
  children, 
  currentTab, 
  setCurrentTab, 
  onNewBookingClick 
}: LayoutProps) {
  const { user, userRole } = useBusiness();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isOnline = useNetworkStatus();

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "salons", label: "I miei Saloni", icon: Store },
    { id: "appointments", label: "Agenda", icon: Calendar },
    { id: "performances", label: "Prestazioni", icon: Receipt },
    { id: "services", label: "Servizi", icon: Scissors },
    { id: "customers", label: "Clienti", icon: Users },
    { id: "inventory", label: "Inventario", icon: Package },
    { id: "commissions", label: "Percentuali Collab.", icon: Percent },
    ...(userRole === "owner" ? [
      { id: "team", label: "Team", icon: Scissors },
      { id: "marketing", label: "AI Marketing", icon: MessageSquare },
      { id: "test_data", label: "Dati di Test (60 Clienti)", icon: FileText }
    ] : [])
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  const getBreadcrumb = () => {
    switch (currentTab) {
      case "dashboard":
        return "Dashboard";
      case "salons":
        return "Gestione Saloni";
      case "appointments":
        return "Agenda";
      case "performances":
        return "Registro Prestazioni";
      case "services":
        return "Configurazione Servizi";
      case "customers":
        return "Anagrafica Clienti";
      case "inventory":
        return "Inventario Prodotti";
      case "commissions":
        return "Provvigioni e Guadagni Collaboratori";
      case "team":
        return "Gestione Collaboratori";
      case "marketing":
        return "AI Marketing & Fidelizzazione";
      case "whatsapp":
        return "WhatsApp Saloni & Flash Slot (Caccia alla Poltrona)";
      case "test_data":
        return "Generatore Dati di Test & Collaudo";
      case "account_info":
        return userRole === "receptionist" ? "Informazioni Profilo" : "Informazioni Account & Azienda";
      default:
        return "SforbiciaSmart";
    }
  };

  return (
    <div className="h-full w-screen bg-[#f0f2f5] flex text-[#1a2035] font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200/80 shrink-0 sticky top-0 h-full overflow-hidden shadow-2xs">
        {/* Brand Logo */}
        <div className="p-6 border-b border-slate-100 flex items-center gap-3.5 shrink-0 bg-white">
          <div className="w-11 h-11 rounded-2xl bg-[#eef2ff] border border-[#1a3a8f]/10 flex items-center justify-center text-[#1a3a8f] shadow-2xs">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#1a3a8f]">
              SforbiciaSmart
            </h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Management SaaS
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto custom-sidebar-scroll">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer active:scale-[0.98] ${
                  isActive
                    ? "bg-[#eef2ff] text-[#1a3a8f] shadow-2xs border border-[#1a3a8f]/10 font-bold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-[#1a3a8f] border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#1a3a8f]" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info & Logout Footer */}
        <div className="mt-auto p-4 border-t border-slate-100 space-y-2 bg-slate-50/70 shrink-0">
          <button
            onClick={() => setCurrentTab("account_info")}
            className={`w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all cursor-pointer text-left select-none group border shadow-2xs ${
              currentTab === "account_info"
                ? "bg-[#eef2ff] border-[#1a3a8f]/20 text-[#1a3a8f]"
                : "bg-white border-slate-200/70 hover:bg-slate-100/80 text-slate-900"
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-[#eef2ff] border border-[#1a3a8f]/15 flex items-center justify-center text-[#1a3a8f] font-bold text-xs group-hover:scale-105 transition-transform shrink-0">
              {user?.email ? user.email.slice(0, 2).toUpperCase() : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate group-hover:text-[#1a3a8f] transition-colors text-[#1a2035]">
                {user?.email || "Account Collaboratore"}
              </p>
              {userRole === "receptionist" ? (
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[9px] font-bold uppercase tracking-wider">
                  Receptionist
                </span>
              ) : (
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 text-[9px] font-bold uppercase tracking-wider">
                  Proprietario
                </span>
              )}
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-rose-600 hover:bg-rose-50/80 py-2.5 px-4 rounded-2xl text-xs font-bold uppercase tracking-wider border border-transparent hover:border-rose-200 transition-all cursor-pointer active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Esci dall'Account</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Navigation Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Blur overlay */}
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer content */}
          <div className="relative flex flex-col w-72 max-w-[85%] bg-white h-full shadow-2xl animate-fadeIn z-10 rounded-r-3xl overflow-hidden border-r border-slate-200/80">
            <div className="absolute top-4 right-4">
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 border-b border-slate-100 flex items-center gap-3.5 bg-white">
              <div className="w-11 h-11 rounded-2xl bg-[#eef2ff] border border-[#1a3a8f]/10 flex items-center justify-center text-[#1a3a8f] shadow-2xs">
                <Scissors className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-[#1a3a8f]">
                  SforbiciaSmart
                </h1>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  Management SaaS
                </p>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                      isActive
                        ? "bg-[#eef2ff] text-[#1a3a8f] shadow-2xs border border-[#1a3a8f]/10 font-bold"
                        : "text-slate-500 hover:bg-slate-50 hover:text-[#1a3a8f] border border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-100 space-y-2 bg-slate-50/70">
              <button
                onClick={() => {
                  setCurrentTab("account_info");
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all cursor-pointer text-left select-none border shadow-2xs ${
                  currentTab === "account_info"
                    ? "bg-[#eef2ff] border-[#1a3a8f]/20 text-[#1a3a8f]"
                    : "bg-white border-slate-200/70 hover:bg-slate-100/80 text-slate-900"
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-[#eef2ff] border border-[#1a3a8f]/15 flex items-center justify-center text-[#1a3a8f] font-bold text-xs shrink-0">
                  {user?.email ? user.email.slice(0, 2).toUpperCase() : <UserIcon className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate text-[#1a2035]">
                    {user?.email}
                  </p>
                  {userRole === "receptionist" ? (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[9px] font-bold uppercase tracking-wider">
                      Receptionist
                    </span>
                  ) : (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 text-[9px] font-bold uppercase tracking-wider">
                      Proprietario
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 text-rose-600 hover:bg-rose-50/80 py-2.5 px-4 rounded-2xl text-xs font-bold uppercase tracking-wider border border-transparent hover:border-rose-200 transition-all cursor-pointer active:scale-95"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Esci dall'Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#f8f9fc]">
        {!isOnline && (
          <div className="bg-amber-600 text-white text-xs font-semibold py-2 px-6 flex items-center justify-center gap-2 shadow-sm z-40 shrink-0">
            <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
            <span>Modalità Offline: Dati salvati in locale, in attesa di rete</span>
          </div>
        )}
        {/* Apple Style Header Bar */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs px-4 sm:px-8 py-3.5 sm:py-4 flex items-center justify-between transition-all">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-2xl transition-all active:scale-95 border border-slate-200/60 shadow-2xs"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100/90 border border-slate-200/60 px-2.5 py-0.5 rounded-full shadow-2xs">
                  Gestione Saloni
                </span>
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-[#1a2035] tracking-tight truncate">
                {getBreadcrumb()}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={onNewBookingClick}
              className="bg-[#1a3a8f] hover:bg-[#132c6e] active:scale-[0.98] text-white rounded-2xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider shadow-2xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Nuova Prenotazione</span>
              <span className="inline sm:hidden">Prenota</span>
            </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
        
        {/* Floating AI Coach Assistant Chatbot */}
        <SaaSAssistant currentTab={currentTab} setCurrentTab={setCurrentTab} />
      </div>
    </div>
  );
}
