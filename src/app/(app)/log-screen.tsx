"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, Check, Lock, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { saveEntriesAction } from "@/app/actions";
import { CategoryIcon } from "@/components/category-icon";
import { EntryFields, emptyEntry, fromDraft, REVIEW_FIELD_FOR, toEntryInput, type EntryFormValue } from "@/components/entry-fields";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { categoryLabel, type CategoryOption } from "@/lib/categories";
import type { EntryInput } from "@/lib/entry-input";
import { formatINR, parseRupeesInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Draft, ReviewField } from "@/server/llm/schema";

type Group = { id: string; name: string };
type DraftCard = { key: string; value: EntryFormValue; flagged: Set<ReviewField>; notes: string[]; rawText: string | null };

const LAST_GROUP_KEY = "expense-tracker:last-group";
const PRIVATE = "private";

const EXAMPLES = ["chai 20, auto 60, kirana 340", "kal sabzi dhai sau", "swiggy biryani 349 upi", "#goa-trip hotel 4000", "salary 1.5 lakh"];

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "You've hit the hourly parsing limit. Add entries manually for now.",
  llm_unavailable: "The text parser is unavailable right now. Your text was kept — fill in the entry below.",
  too_long: "That's too much text at once (max 2,000 characters). Split it up.",
  empty_input: "Type something first.",
  unauthorized: "Your session expired. Please sign in again.",
};

let keySeq = 0;
const nextKey = () => `card-${++keySeq}`;

type Props = {
  categories: CategoryOption[];
  groups: Group[];
  today: string;
  /** "sheet" = inside the mobile bottom sheet (no page heading, save bar pinned to the sheet). */
  variant?: "page" | "sheet";
  onSaved?: () => void;
};

export function LogScreen({ categories, groups, today, variant = "page", onSaved }: Props) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [groupId, setGroupId] = useState<string>(PRIVATE);
  const [parsing, setParsing] = useState(false);
  const [saving, startSaving] = useTransition();
  const textId = useId();
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Default to the last group used on this device, if the user is still a member.
  useEffect(() => {
    const last = localStorage.getItem(LAST_GROUP_KEY);
    const fallback = groups[0]?.id ?? PRIVATE;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser-only preference after hydration
    setGroupId(last && (last === PRIVATE || groups.some((g) => g.id === last)) ? last : fallback);
  }, [groups]);

  const unresolved = useMemo(() => cards.filter((c) => c.flagged.size > 0).length, [cards]);
  const total = useMemo(
    () => cards.reduce((sum, c) => sum + (c.value.type === "expense" ? (parseRupeesInput(c.value.amount) ?? 0) : 0), 0),
    [cards],
  );

  async function parse() {
    const input = text.trim();
    if (!input || parsing) return;
    setParsing(true);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });
      const data = (await res.json().catch(() => ({ ok: false, error: "llm_unavailable" }))) as
        | { ok: true; drafts: Draft[] }
        | { ok: false; error: string };
      if (data.ok && data.drafts.length > 0) {
        setCards((prev) => [
          ...prev,
          ...data.drafts.map((d) => ({
            key: nextKey(),
            value: fromDraft(d),
            flagged: new Set(d.reviewFields),
            notes: d.reviewNotes,
            rawText: input,
          })),
        ]);
        setText("");
      } else {
        const message = data.ok ? "Couldn't find any entries in that text. Add it manually below." : ERROR_MESSAGES[data.error] ?? ERROR_MESSAGES.llm_unavailable;
        toast.error(message);
        if (!data.ok && data.error === "unauthorized") return;
        // Fallback: manual card that keeps the raw text (DECISIONS.md #7).
        setCards((prev) => [
          ...prev,
          { key: nextKey(), value: emptyEntry(categories, today, input.slice(0, 200)), flagged: new Set(["amount"]), notes: [], rawText: input },
        ]);
        setText("");
      }
    } catch {
      toast.error(ERROR_MESSAGES.llm_unavailable);
    } finally {
      setParsing(false);
    }
  }

  function update(key: string, patch: Partial<EntryFormValue>, field: keyof EntryFormValue) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.key !== key) return c;
        const flagged = new Set(c.flagged);
        const reviewField = REVIEW_FIELD_FOR[field];
        if (reviewField) flagged.delete(reviewField);
        return { ...c, value: { ...c.value, ...patch }, flagged };
      }),
    );
  }

  const confirmGuesses = (key: string) =>
    setCards((prev) =>
      prev.map((c) => {
        if (c.key !== key) return c;
        // An empty amount can't be confirmed; it must be filled in.
        const keep = new Set<ReviewField>(c.value.amount.trim() === "" ? ["amount"] : []);
        return { ...c, flagged: keep };
      }),
    );

  function saveAll() {
    const target = groupId === PRIVATE ? null : groupId;
    const inputs: EntryInput[] = [];
    for (const [i, c] of cards.entries()) {
      const result = toEntryInput(c.value, target, c.rawText);
      if ("error" in result) {
        toast.error(`Entry ${i + 1}: ${result.error}`);
        return;
      }
      inputs.push(result.input);
    }
    startSaving(async () => {
      const res = await saveEntriesAction(inputs);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      localStorage.setItem(LAST_GROUP_KEY, groupId);
      toast.success(`Saved ${res.data.count} ${res.data.count === 1 ? "entry" : "entries"}.`);
      setCards([]);
      onSaved?.();
    });
  }

  const addManual = () =>
    setCards((prev) => [...prev, { key: nextKey(), value: emptyEntry(categories, today), flagged: new Set(), notes: [], rawText: null }]);

  return (
    <div className={cn("space-y-5", variant === "page" && "mx-auto max-w-3xl")}>
      {variant === "page" && (
        <div className="space-y-1.5 pt-2">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            What did you <span className="text-gradient">spend</span> today?
          </h1>
          <p className="text-muted-foreground">Type it like a message — English, Hinglish or हिंदी. Several items at once is fine.</p>
        </div>
      )}

      {/* Composer */}
      <div className={cn("glass rounded-3xl p-4 transition-shadow duration-300 sm:p-5", focused && "glow-ring")}>
        <label htmlFor={textId} className="sr-only">
          What did you spend or earn?
        </label>
        <Textarea
          id={textId}
          rows={variant === "sheet" ? 3 : 4}
          maxLength={2000}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) parse();
          }}
          placeholder={"chai 20, auto 60, kirana 340 at DMart by UPI"}
          className="min-h-24 resize-none border-0 bg-transparent px-0 text-lg shadow-none focus-visible:ring-0 dark:bg-transparent sm:text-xl"
        />
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText((t) => (t.trim() ? `${t.trim()}, ${ex}` : ex))}
              className="rounded-full border border-glass-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={addManual} className="h-11 rounded-xl">
            <Plus /> Add manually
          </Button>
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={parse}
              disabled={parsing || !text.trim()}
              className={cn(
                "bg-brand h-11 rounded-xl px-5 text-[15px] font-semibold text-[#04201c] shadow-[var(--glow)] hover:opacity-90 disabled:opacity-40",
                parsing && "shimmer",
              )}
            >
              <Sparkles /> {parsing ? "Reading…" : "Parse"}
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Parsing placeholders */}
      {parsing && (
        <div className="space-y-3" aria-live="polite" aria-label="Reading your entries">
          {[0, 1].map((i) => (
            <div key={i} className="glass flex items-center gap-3 rounded-3xl p-4">
              <Skeleton className="size-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Review cards */}
      <AnimatePresence initial={false}>
        {cards.map((c, i) => {
          const category = byId.get(c.value.categoryId);
          const amount = parseRupeesInput(c.value.amount);
          return (
            <motion.section
              key={c.key}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.05, duration: 0.25 } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
              aria-label={`Entry ${i + 1}`}
              className={cn("glass space-y-4 rounded-3xl p-4 sm:p-5", c.flagged.size > 0 && "ring-1 ring-warning/50")}
            >
              <div className="flex items-start gap-3">
                <CategoryIcon slug={category?.slug} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.value.description || "New entry"}</p>
                  <p className="truncate text-xs text-muted-foreground">{category ? categoryLabel(category) : "Pick a category"}</p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-heading text-2xl font-semibold tabular-nums",
                      c.value.type === "income" && "text-income",
                      c.value.type === "refund" && "text-refund",
                    )}
                  >
                    {c.value.type !== "expense" && "+"}
                    {amount ? formatINR(amount) : "₹—"}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">{c.value.type}</p>
                </div>
              </div>

              {(c.flagged.size > 0 || c.notes.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-400/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span className="flex-1">
                    {c.notes.join(" ")} {c.flagged.size > 0 && `AI guessed the highlighted ${[...c.flagged].join(", ")} — please check.`}
                  </span>
                  {c.flagged.size > 0 && (
                    <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => confirmGuesses(c.key)}>
                      <Check /> Looks right
                    </Button>
                  )}
                </div>
              )}

              <EntryFields
                idPrefix={c.key}
                value={c.value}
                categories={categories}
                flagged={c.flagged}
                onChange={(patch, field) => update(c.key, patch, field)}
              />

              <div className="flex items-center justify-between">
                {c.value.type === "income" && groupId !== PRIVATE ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3.5" /> Income is always saved as private.
                  </p>
                ) : (
                  <span />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-muted-foreground"
                  aria-label={`Remove entry ${i + 1}`}
                  onClick={() => setCards((prev) => prev.filter((x) => x.key !== c.key))}
                >
                  <Trash2 /> Remove
                </Button>
              </div>
            </motion.section>
          );
        })}
      </AnimatePresence>

      {/* Save bar */}
      <AnimatePresence>
        {cards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24, transition: { duration: 0.15 } }}
            className={cn(
              "sticky z-20 space-y-3 rounded-3xl border border-glass-border bg-popover p-3 shadow-2xl",
              variant === "page" ? "bottom-28 md:bottom-4" : "bottom-0",
            )}
          >
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="radiogroup" aria-label="Save to">
              {[{ id: PRIVATE, name: "Private" }, ...groups].map((g) => {
                const active = groupId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setGroupId(g.id)}
                    className={cn(
                      "relative flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm text-muted-foreground transition-colors",
                      active && "text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`save-target-${variant}`}
                        className="absolute inset-0 -z-10 rounded-full bg-primary/15 ring-1 ring-primary/40"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    {g.id === PRIVATE ? <Lock className="size-3.5" /> : <Users className="size-3.5" />}
                    {g.name}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="text-muted-foreground">
                  {cards.length} {cards.length === 1 ? "entry" : "entries"}
                </p>
                {total > 0 && <p className="font-heading font-semibold tabular-nums">{formatINR(total)} spent</p>}
              </div>
              <Button
                onClick={saveAll}
                disabled={saving || unresolved > 0}
                className="bg-brand h-12 rounded-2xl px-6 text-[15px] font-semibold text-[#04201c] shadow-[var(--glow)] hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Saving…" : unresolved > 0 ? `Review ${unresolved} ${unresolved === 1 ? "entry" : "entries"}` : "Save all"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
