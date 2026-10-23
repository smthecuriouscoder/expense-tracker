export const ENTRY_TYPES = ["expense", "income", "refund"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const PAYMENT_METHODS = ["upi", "cash", "card", "netbanking", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  cash: "Cash",
  card: "Card",
  netbanking: "Net banking",
  other: "Other",
};

export const GROUP_ROLES = ["admin", "member"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const TIME_ZONE = "Asia/Kolkata";
export const CURRENCY = "INR";
