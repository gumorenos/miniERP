export const sizes = ["S", "M", "L", "XL", "XXL"] as const;
export type Size = (typeof sizes)[number];

export const paymentMethods = ["YAPE", "PLIN", "CASH", "BANK_TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const orderStatuses = [
  "ORDER_RECEIVED",
  "MATERIAL_PENDING",
  "READY_TO_CUT",
  "CUT",
  "AT_EMBROIDERER",
  "EMBROIDERY_RECEIVED",
  "ASSEMBLY",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED",
  "CANCELLED"
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const productionFlow: OrderStatus[] = [
  "ORDER_RECEIVED",
  "MATERIAL_PENDING",
  "READY_TO_CUT",
  "CUT",
  "AT_EMBROIDERER",
  "EMBROIDERY_RECEIVED",
  "ASSEMBLY",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED"
];

export type OrderCostInput = {
  agreedTotalPrice: number;
  payments: number[];
  items: Array<{
    estimatedMaterialCost?: number | null;
    actualMaterialCost?: number | null;
    estimatedOwnLaborCost?: number | null;
    actualOwnLaborCost?: number | null;
    estimatedPackagingCost?: number | null;
    actualPackagingCost?: number | null;
    otherEstimatedDirectCost?: number | null;
    otherActualDirectCost?: number | null;
    estimatedEmbroideryCost?: number | null;
    actualEmbroideryCost?: number | null;
  }>;
};

export type OrderFinancials = {
  agreedTotalPrice: number;
  totalPaid: number;
  balance: number;
  estimatedCost: number;
  actualCost: number;
  costForMargin: number;
  margin: number;
};

