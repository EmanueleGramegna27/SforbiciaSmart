import React, { useState, useEffect } from "react";
import { BusinessProvider, useBusiness } from "./context/BusinessContext";
import Layout from "./components/Layout";
import LoginScreen from "./components/LoginScreen";
import DashboardScreen from "./components/DashboardScreen";
import SalonsScreen from "./components/SalonsScreen";
import ServicesScreen from "./components/ServicesScreen";
import CustomersScreen from "./components/CustomersScreen";
import AppointmentsScreen from "./components/AppointmentsScreen";
import InventoryScreen from "./components/InventoryScreen";
import CommissionsScreen from "./components/CommissionsScreen";
import TeamScreen from "./components/TeamScreen";
import MarketingScreen from "./components/MarketingScreen";
import PerformancesScreen from "./components/PerformancesScreen";
import BookingModal from "./components/BookingModal";
import PermissionErrorGuide from "./components/PermissionErrorGuide";
import AccountInfoScreen from "./components/AccountInfoScreen";
import SubscriptionGuard from "./components/auth/SubscriptionGuard";
import MagicBookingScreen from "./components/MagicBookingScreen";
import WhatsAppSalonManager from "./components/WhatsAppSalonManager";
import TestDataManager from "./components/TestDataManager";
import FeedbackShieldScreen from "./components/FeedbackShieldScreen";
import { Loader2 } from "lucide-react";

function AppContent() {
  const { user, loading, permissionError, resetPermissionError } = useBusiness();
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  // Check URL for public Magic Link booking (?flash=slotId&cid=customerId) or Feedback Shield (?feedback=token)
  const [flashParam, setFlashParam] = useState<string | null>(null);
  const [cidParam, setCidParam] = useState<string | null>(null);
  const [feedbackParam, setFeedbackParam] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flash = params.get("flash");
    const cid = params.get("cid");
    const feedback = params.get("feedback");
    if (flash) {
      setFlashParam(flash);
      setCidParam(cid);
    }
    if (feedback) {
      setFeedbackParam(feedback);
    }
  }, []);

  // If visiting via Feedback Shield Magic Link, render direct feedback screen without authentication requirement
  if (feedbackParam) {
    return <FeedbackShieldScreen token={feedbackParam} />;
  }

  // If visiting via Flash Slot Magic Link, render direct booking screen without authentication requirement
  if (flashParam) {
    return <MagicBookingScreen slotId={flashParam} customerId={cidParam} />;
  }

  // Loading state Spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center font-sans gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-[#1a3a8f]" />
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-widest animate-pulse">
          SforbiciaSmart sta caricando...
        </span>
      </div>
    );
  }

  // Not logged in: Redirect to Login view
  if (!user) {
    return <LoginScreen />;
  }

  // Logged in: Render the page wrapped inside the standard Navigation Layout
  const renderTabContent = () => {
    switch (currentTab) {
      case "dashboard":
        return <DashboardScreen setCurrentTab={setCurrentTab} />;
      case "salons":
        return <SalonsScreen />;
      case "services":
        return <ServicesScreen />;
      case "customers":
        return <CustomersScreen setCurrentTab={setCurrentTab} />;
      case "appointments":
        return <AppointmentsScreen setCurrentTab={setCurrentTab} />;
      case "inventory":
        return <InventoryScreen />;
      case "commissions":
        return <CommissionsScreen setCurrentTab={setCurrentTab} />;
      case "team":
        return <TeamScreen />;
      case "marketing":
        return <MarketingScreen setCurrentTab={setCurrentTab} />;
      case "whatsapp":
        return (
          <div className="space-y-6 animate-pageFade pb-12">
            <WhatsAppSalonManager />
          </div>
        );
      case "test_data":
        return (
          <div className="space-y-6 animate-pageFade pb-12">
            <TestDataManager />
          </div>
        );
      case "account_info":
        return <AccountInfoScreen />;
      case "performances":
        return <PerformancesScreen />;
      default:
        return <DashboardScreen setCurrentTab={setCurrentTab} />;
    }
  };

  return (
    <SubscriptionGuard>
      <Layout 
        currentTab={currentTab} 
        setCurrentTab={setCurrentTab} 
        onNewBookingClick={() => setBookingModalOpen(true)}
      >
        {permissionError ? (
          <PermissionErrorGuide 
            collectionPath={permissionError} 
            onDismiss={resetPermissionError} 
          />
        ) : (
          renderTabContent()
        )}

        {/* Global Booking Dialog */}
        <BookingModal 
          isOpen={bookingModalOpen} 
          onClose={() => setBookingModalOpen(false)} 
        />
      </Layout>
    </SubscriptionGuard>
  );
}


export default function App() {
  return (
    <BusinessProvider>
      <AppContent />
    </BusinessProvider>
  );
}
