import type { CategoryKind } from "@/lib/constants";

/**
 * Preset category tree (India-tuned). Slugs are stable keys used by the LLM prompt;
 * renaming a display name is safe, changing a slug is a data migration.
 * Every parent automatically gets an "Other" child (`<parent>.other`).
 */
export type PresetParent = {
  slug: string;
  name: string;
  kind: CategoryKind;
  children: { slug: string; name: string }[];
};

export const PRESET_CATEGORIES: PresetParent[] = [
  {
    slug: "food",
    name: "Food",
    kind: "expense",
    children: [
      { slug: "groceries", name: "Groceries / Kirana" },
      { slug: "vegetables", name: "Fruits & Vegetables" },
      { slug: "dairy", name: "Milk & Dairy" },
      { slug: "dining", name: "Dining out" },
      { slug: "delivery", name: "Food delivery" },
      { slug: "snacks", name: "Snacks & Chai" },
    ],
  },
  {
    slug: "transport",
    name: "Transport",
    kind: "expense",
    children: [
      { slug: "fuel", name: "Fuel" },
      { slug: "cab", name: "Cab / Auto" },
      { slug: "public", name: "Metro / Bus / Train" },
      { slug: "parking", name: "Parking & Tolls" },
      { slug: "vehicle", name: "Vehicle service" },
    ],
  },
  {
    slug: "housing",
    name: "Housing",
    kind: "expense",
    children: [
      { slug: "rent", name: "Rent" },
      { slug: "maintenance", name: "Society maintenance" },
      { slug: "repairs", name: "Repairs" },
      { slug: "help", name: "Domestic help" },
    ],
  },
  {
    slug: "utilities",
    name: "Utilities",
    kind: "expense",
    children: [
      { slug: "electricity", name: "Electricity" },
      { slug: "water", name: "Water" },
      { slug: "gas", name: "Gas / LPG" },
      { slug: "internet", name: "Internet" },
      { slug: "mobile", name: "Mobile recharge" },
    ],
  },
  {
    slug: "finance",
    name: "Loans & Finance",
    kind: "expense",
    children: [
      { slug: "emi", name: "EMI" },
      { slug: "insurance", name: "Insurance" },
      { slug: "investment", name: "Investments / SIP" },
      { slug: "fees", name: "Bank fees & charges" },
      { slug: "tax", name: "Taxes" },
    ],
  },
  {
    slug: "health",
    name: "Health",
    kind: "expense",
    children: [
      { slug: "medicines", name: "Medicines" },
      { slug: "doctor", name: "Doctor / Hospital" },
      { slug: "tests", name: "Lab tests" },
      { slug: "fitness", name: "Fitness" },
    ],
  },
  {
    slug: "education",
    name: "Education",
    kind: "expense",
    children: [
      { slug: "school", name: "School / College fees" },
      { slug: "tuition", name: "Tuition & Courses" },
      { slug: "books", name: "Books & Stationery" },
    ],
  },
  {
    slug: "shopping",
    name: "Shopping",
    kind: "expense",
    children: [
      { slug: "clothing", name: "Clothing & Footwear" },
      { slug: "electronics", name: "Electronics" },
      { slug: "household", name: "Household items" },
      { slug: "personal", name: "Personal care" },
    ],
  },
  {
    slug: "entertainment",
    name: "Entertainment",
    kind: "expense",
    children: [
      { slug: "subscriptions", name: "Subscriptions / OTT" },
      { slug: "movies", name: "Movies & Events" },
      { slug: "hobbies", name: "Hobbies" },
    ],
  },
  {
    slug: "travel",
    name: "Travel",
    kind: "expense",
    children: [
      { slug: "flights", name: "Flights & Trains" },
      { slug: "stay", name: "Hotels & Stay" },
      { slug: "local", name: "Local travel" },
    ],
  },
  {
    slug: "social",
    name: "Gifts & Social",
    kind: "expense",
    children: [
      { slug: "gifts", name: "Gifts" },
      { slug: "donations", name: "Donations / Religious" },
      { slug: "functions", name: "Weddings & Functions" },
    ],
  },
  {
    slug: "misc",
    name: "Miscellaneous",
    kind: "expense",
    children: [],
  },
  {
    slug: "income",
    name: "Income",
    kind: "income",
    children: [
      { slug: "salary", name: "Salary" },
      { slug: "business", name: "Business" },
      { slug: "interest", name: "Interest" },
      { slug: "gift", name: "Gift" },
    ],
  },
];

/** Slug of the "Other" child for a parent slug. */
export const otherSlug = (parentSlug: string) => `${parentSlug}.other`;

/** Category used when the LLM returns nothing usable, per kind. */
export const FALLBACK_SLUG: Record<CategoryKind, string> = {
  expense: otherSlug("misc"),
  income: otherSlug("income"),
};
