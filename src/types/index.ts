export interface Salon {
  id: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  ownerId: string;
  partitaIva?: string;
  useMainCompanyInfo?: boolean;
  sedeLegale?: string;
  googleReviewUrl?: string;
  createdAt?: any;
}

export interface BusinessSettings {
  ownerId: string;
  partitaIvaPrincipale: string;
  sedeLegale: string;
  ownerNome?: string;
  ownerTelefono?: string;
  ragioneSociale?: string;
  codiceFiscale?: string;
  via?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  sdi?: string;
  pec?: string;
  userPlan?: string;
  subscriptionStatus?: string;
  trialStartDate?: string;
  trialEndDate?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeApiKey?: string;
  stripePublishableKey?: string;
  stripeEnvironment?: string;
  stripeWebhookSecret?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpFromName?: string;
  smtpFromAddr?: string;
  updatedAt?: any;
}

export interface Category {
  id: string;
  name: string;
  ownerId: string;
  createdAt?: any;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  categoryId: string;
  categoryName?: string;
  salonIds: string[];
  ownerId: string;
  commissionPercentage?: number;
  createdAt?: any;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  salonId: string;
  notes?: string;
  ownerId: string;
  createdAt?: any;
}

export interface ProductSaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  staffName?: string;
  commissionPercentage?: number;
  commissionEarned?: number;
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  salonId: string;
  staffName: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  paymentMethod?: "bancomat" | "contanti";
  ownerId: string;
  createdAt?: any;
  productsPrice?: number;
  productsSold?: ProductSaleItem[];
  servicesPerformed?: {
    serviceId: string;
    serviceName: string;
    price: number;
    staffName: string;
    commissionPercentage: number;
    commissionEarned: number;
  }[];
}

export interface CustomPrice {
  id: string;
  customerId: string;
  serviceId: string;
  serviceName: string;
  price: number;
  ownerId: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  salonIds: string[];
  ownerId: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: "sms" | "email";
  targetGroup: string;
  sentDate: string;
  deliveryRate: string;
  openRate: string;
  bookingsCount: number;
  text: string;
  ownerId: string;
  createdAt?: any;
}

export interface FlashSlotRecipient {
  customerId: string;
  customerName: string;
  phone: string;
  lastVisitDate?: string;
  status: "sent" | "simulated" | "failed";
}

export interface FlashSlot {
  id: string;
  salonId: string;
  salonName: string;
  salonPhone?: string;
  ownerId: string;
  date: string;
  time: string;
  duration: number;
  serviceId: string;
  serviceName: string;
  staffName: string;
  originalPrice: number;
  discountPrice: number;
  discountPercent: number;
  status: "open" | "claimed" | "expired" | "cancelled";
  claimedBy?: {
    customerId: string;
    customerName: string;
    customerPhone: string;
    claimedAt: string;
    appointmentId?: string;
  } | null;
  expiresAt: string;
  createdAt: string;
  totalNotified: number;
  recipients?: FlashSlotRecipient[];
  customMessage?: string;
  waSessionUsed?: boolean;
}

export interface WhatsAppSessionState {
  salonId: string;
  salonName?: string;
  status: "disconnected" | "connecting" | "qr_ready" | "connected" | "error";
  qrCode?: string | null;
  phoneNumber?: string | null;
  lastUpdated?: string;
  errorMessage?: string | null;
}

export interface FeedbackShieldRequest {
  id: string;
  salonId: string;
  salonName: string;
  ownerId: string;
  appointmentId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceName?: string;
  staffName?: string;
  googleReviewUrl?: string;
  status: "scheduled" | "sent" | "answered_positive" | "answered_negative" | "cancelled";
  scheduledFor: string;
  sentAt?: string;
  channel: "whatsapp" | "sms";
  channelStatus?: string;
  answer?: "positive" | "negative";
  feedbackNotes?: string;
  token: string;
  createdAt: string;
  updatedAt: string;
}

