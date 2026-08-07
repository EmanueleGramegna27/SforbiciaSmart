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
      { id: "marketing", label: "AI Marketing", icon: MessageSquare }
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
      case "account_info":
        return userRole === "receptionist" ? "Informazioni Profilo" : "Informazioni Account & Azienda";
      default:
        return "SforbiciaSmart";
    }
  };

  return (
    <div className="h-full w-screen bg-[#f0f2f5] flex text-[#1a2035] font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 shrink-0 sticky top-0 h-full overflow-hidden">
        {/* Brand Logo */}
        <div className="p-5 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-[#eef2ff] flex items-center justify-center text-[#1a3a8f]">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold tracking-tight text-[#1a3a8f]">
              SforbiciaSmart
            </h1>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
              Management SaaS
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3.5 space-y-0.5 overflow-y-auto custom-sidebar-scroll">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-[#eef2ff] text-[#1a3a8f] shadow-sm shadow-blue-900/5"
                    : "text-gray-500 hover:bg-gray-50 hover:text-[#1a3a8f]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#1a3a8f]" : "text-gray-400"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Info & Logout Footer */}
        <div className="mt-auto p-3.5 border-t border-gray-100 space-y-2.5 bg-gray-50 shrink-0">
          <button
            onClick={() => setCurrentTab("account_info")}
            className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer text-left select-none group border ${
              currentTab === "account_info"
                ? "bg-[#eef2ff] border-blue-100 text-[#1a3a8f]"
                : "bg-transparent border-transparent hover:bg-gray-100/80 text-gray-900"
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-[#1a3a8f] font-semibold text-sm group-hover:scale-105 transition-transform shrink-0">
              {user?.email ? user.email.slice(0, 2).toUpperCase() : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate group-hover:text-[#1a3a8f] transition-colors">
                {user?.email || "Account Collaboratore"}
              </p>
              {userRole === "receptionist" ? (
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold uppercase tracking-wider">
                  RECEPTIONIST (Limitato)
                </span>
              ) : (
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold uppercase tracking-wider">
                  PROPRIETARIO
                </span>
              )}
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 py-2 px-4 rounded-xl text-xs font-semibold border border-transparent hover:border-red-100 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Esci dall'Account
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Navigation Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Blur overlay */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer content */}
          <div className="relative flex flex-col w-72 max-w-[80%] bg-white h-full shadow-xl animate-fadeIn z-10">
            <div className="absolute top-4 right-4">
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#eef2ff] flex items-center justify-center text-[#1a3a8f]">
                <Scissors className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-serif text-xl font-bold tracking-tight text-[#1a3a8f]">
                  SforbiciaSmart
                </h1>
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                  SaaS Manager
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
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-[#eef2ff] text-[#1a3a8f]"
                        : "text-gray-500 hover:bg-gray-50 hover:text-[#1a3a8f]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-gray-100 space-y-3 bg-gray-50/50">
              <button
                onClick={() => {
                  setCurrentTab("account_info");
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer text-left select-none border ${
                  currentTab === "account_info"
                    ? "bg-[#eef2ff] border-blue-100 text-[#1a3a8f]"
                    : "bg-transparent border-transparent hover:bg-gray-100/80 text-gray-900"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-[#1a3a8f] font-semibold text-sm shrink-0">
                  {user?.email ? user.email.slice(0, 2).toUpperCase() : <UserIcon className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate max-w-[150px]">
                    {user?.email}
                  </p>
                  {userRole === "receptionist" ? (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-bold uppercase tracking-wider">
                      RECEPTIONIST (Limitato)
                    </span>
                  ) : (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-bold uppercase tracking-wider">
                      PROPRIETARIO
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 py-2.5 rounded-xl text-xs font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                Esci dall'Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {!isOnline && (
          <div className="bg-amber-600 text-white text-xs font-semibold py-2 px-6 flex items-center justify-center gap-2 shadow-sm z-40 shrink-0">
            <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
            <span>Modalità Offline: Dati salvati in locale, in attesa di rete</span>
          </div>
        )}
        {/* Header bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Gestione Saloni
              </div>
              <h2 className="font-serif text-lg font-bold text-[#1a2035] md:text-xl">
                {getBreadcrumb()}
              </h2>
            </div>
          </div>

          <button
            onClick={onNewBookingClick}
            className="bg-[#1a3a8f] hover:bg-[#152f73] text-white rounded-xl px-4 py-2 text-xs md:text-sm font-semibold shadow-md shadow-blue-900/20 flex items-center gap-1.5 transition-all text-center cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Nuova Prenotazione</span>
            <span className="inline sm:hidden">Nuovo</span>
          </button>
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
