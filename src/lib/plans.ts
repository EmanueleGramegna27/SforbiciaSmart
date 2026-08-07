export interface PlanLimit {
  name: string;
  priceMonthly: string;
  priceYearly: string;
  maxSalons: number;
  maxStaff: number;
  maxReportsPerMonth: number;
  hasAI: boolean;
}

export const PLAN_LIMITS: Record<string, PlanLimit> = {
  solo_pro: {
    name: "Solo Pro",
    priceMonthly: "24,90",
    priceYearly: "19,90",
    maxSalons: 1,
    maxStaff: Infinity,
    maxReportsPerMonth: 3,
    hasAI: false,
  },
  network: {
    name: "Premium Network",
    priceMonthly: "49,90",
    priceYearly: "39,90",
    maxSalons: 6,
    maxStaff: Infinity,
    maxReportsPerMonth: Infinity,
    hasAI: false,
  },
  elite_ai: {
    name: "Elite AI",
    priceMonthly: "89,90",
    priceYearly: "69,90",
    maxSalons: Infinity,
    maxStaff: Infinity,
    maxReportsPerMonth: Infinity,
    hasAI: true,
  },
  unlimited: {
    name: "VIP Accesso Illimitato",
    priceMonthly: "0,00",
    priceYearly: "0,00",
    maxSalons: Infinity,
    maxStaff: Infinity,
    maxReportsPerMonth: Infinity,
    hasAI: true,
  },
};

export const DEFAULT_PLAN = "network";
