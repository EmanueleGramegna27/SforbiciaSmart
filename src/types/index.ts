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
