"use client";

import { ENTRY_TYPES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type EntryType, type PaymentMethod } from "@/lib/constants";
import type { CategoryOption } from "@/lib/categories";
import type { EntryInput } from "@/lib/entry-input";
import { minorToRupees, parseRupeesInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Draft, ReviewField } from "@/server/llm/schema";
import { CategorySelect } from "@/components/category-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/** Editable, string-based form state for one entry. */
export type EntryFormValue = {
  type: EntryType;
  amount: string;
  categoryId: string;
  date: string;
  description: string;
  merchant: string;
  paymentMethod: PaymentMethod | "";
  tags: string;
};

const TYPE_LABELS: Record<EntryType, string> = { expense: "Expense", income: "Income", refund: "Refund" };

export function fromDraft(d: Draft): EntryFormValue {
  return {
    type: d.type,
    amount: d.amountMinor === null ? "" : String(minorToRupees(d.amountMinor)),
    categoryId: d.categoryId,
    date: d.date,
    description: d.description,
    merchant: d.merchant ?? "",
    paymentMethod: d.paymentMethod ?? "",
    tags: d.tags.map((t) => `#${t}`).join(" "),
  };
}

export function emptyEntry(categories: CategoryOption[], today: string, description = ""): EntryFormValue {
  return {
    type: "expense",
    amount: "",
    categoryId: categories.find((c) => c.slug === "misc.other")?.id ?? "",
    date: today,
    description,
    merchant: "",
    paymentMethod: "",
    tags: "",
  };
}

/** Converts form state to the server input, or returns a user-facing error. */
export function toEntryInput(
  v: EntryFormValue,
  groupId: string | null,
  rawText: string | null,
): { input: EntryInput } | { error: string } {
  const amountMinor = parseRupeesInput(v.amount);
  if (amountMinor === null) return { error: "Enter a valid amount." };
  if (!v.description.trim()) return { error: "Add a description." };
  return {
    input: {
      type: v.type,
      amountMinor,
      categoryId: v.categoryId,
      date: v.date,
      description: v.description,
      merchant: v.merchant || null,
      paymentMethod: v.paymentMethod || null,
      tags: v.tags.split(/[\s,]+/).filter(Boolean),
      groupId: v.type === "income" ? null : groupId,
      rawText,
    },
  };
}

type Props = {
  value: EntryFormValue;
  onChange: (patch: Partial<EntryFormValue>, field: keyof EntryFormValue) => void;
  categories: CategoryOption[];
  flagged?: ReadonlySet<ReviewField>;
  idPrefix: string;
};

/** The fields of one entry. Flagged fields (LLM guesses) are highlighted until the user touches them. */
export function EntryFields({ value, onChange, categories, flagged, idPrefix }: Props) {
  const flag = (f: ReviewField) => flagged?.has(f) ?? false;
  const flaggedClass = "border-warning ring-2 ring-warning/30";
  const id = (f: string) => `${idPrefix}-${f}`;

  const changeType = (type: EntryType) => {
    const kind = type === "income" ? "income" : "expense";
    const current = categories.find((c) => c.id === value.categoryId);
    const patch: Partial<EntryFormValue> = { type };
    if (current?.kind !== kind) {
      patch.categoryId = categories.find((c) => c.slug === (kind === "income" ? "income.other" : "misc.other"))?.id ?? "";
    }
    onChange(patch, "type");
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="col-span-1 space-y-1">
        <Label htmlFor={id("amount")}>Amount</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">₹</span>
          <Input
            id={id("amount")}
            inputMode="decimal"
            placeholder="0"
            value={value.amount}
            aria-invalid={value.amount !== "" && parseRupeesInput(value.amount) === null}
            className={cn("pl-7 font-medium tabular-nums", flag("amount") && flaggedClass)}
            onChange={(e) => onChange({ amount: e.target.value }, "amount")}
          />
        </div>
      </div>
      <div className="col-span-1 space-y-1">
        <Label htmlFor={id("type")}>Type</Label>
        <NativeSelect
          id={id("type")}
          value={value.type}
          className={cn(flag("type") && flaggedClass)}
          onChange={(e) => changeType(e.target.value as EntryType)}
        >
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="col-span-2 space-y-1">
        <Label htmlFor={id("category")}>Category</Label>
        <CategorySelect
          id={id("category")}
          categories={categories}
          kind={value.type === "income" ? "income" : "expense"}
          value={value.categoryId}
          className={cn(flag("category") && flaggedClass)}
          onChange={(e) => onChange({ categoryId: e.target.value }, "categoryId")}
        />
      </div>
      <div className="col-span-2 space-y-1">
        <Label htmlFor={id("description")}>Description</Label>
        <Input
          id={id("description")}
          value={value.description}
          maxLength={200}
          onChange={(e) => onChange({ description: e.target.value }, "description")}
        />
      </div>
      <div className="col-span-1 space-y-1">
        <Label htmlFor={id("date")}>Date</Label>
        <Input
          id={id("date")}
          type="date"
          value={value.date}
          className={cn(flag("date") && flaggedClass)}
          onChange={(e) => onChange({ date: e.target.value }, "date")}
        />
      </div>
      <div className="col-span-1 space-y-1">
        <Label htmlFor={id("merchant")}>Merchant</Label>
        <Input
          id={id("merchant")}
          value={value.merchant}
          maxLength={80}
          placeholder="Optional"
          onChange={(e) => onChange({ merchant: e.target.value }, "merchant")}
        />
      </div>
      <div className="col-span-1 space-y-1">
        <Label htmlFor={id("pm")}>Paid via</Label>
        <NativeSelect
          id={id("pm")}
          value={value.paymentMethod}
          onChange={(e) => onChange({ paymentMethod: e.target.value as PaymentMethod | "" }, "paymentMethod")}
        >
          <option value="">Not specified</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="col-span-1 space-y-1 sm:col-span-3">
        <Label htmlFor={id("tags")}>Tags</Label>
        <Input
          id={id("tags")}
          value={value.tags}
          placeholder="#goa-trip"
          onChange={(e) => onChange({ tags: e.target.value }, "tags")}
        />
      </div>
    </div>
  );
}

/** Maps a form field to the review flag it clears when edited. */
export const REVIEW_FIELD_FOR: Partial<Record<keyof EntryFormValue, ReviewField>> = {
  amount: "amount",
  type: "type",
  categoryId: "category",
  date: "date",
};
