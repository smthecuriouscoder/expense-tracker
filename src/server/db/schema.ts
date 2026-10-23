import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ENTRY_TYPES, GROUP_ROLES, CATEGORY_KINDS, PAYMENT_METHODS } from "@/lib/constants";

export const entryType = pgEnum("entry_type", ENTRY_TYPES);
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const groupRole = pgEnum("group_role", GROUP_ROLES);
export const categoryKind = pgEnum("category_kind", CATEGORY_KINDS);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  image: text("image"),
  isAppAdmin: boolean("is_app_admin").notNull().default(false),
  // false once the user is removed from the allowlist; their entries stay.
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// Invite list. Only emails in this table can sign in.
export const allowedEmails = pgTable("allowed_emails", {
  email: text("email").primaryKey(),
  addedBy: uuid("added_by").references(() => users.id),
  createdAt: createdAt(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // The default "Family" group; new users join it automatically.
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: groupRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    // Membership is active while left_at is null.
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stable short key the LLM returns, e.g. "food.groceries".
    slug: text("slug").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),
    isCustom: boolean("is_custom").notNull().default(false),
    // The "Other" child of a parent; used as the LLM fallback.
    isFallback: boolean("is_fallback").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    sort: integer("sort").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug), index("categories_parent_idx").on(t.parentId)],
);

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    // null = private entry.
    groupId: uuid("group_id").references(() => groups.id),
    type: entryType("type").notNull(),
    // Always positive, in minor units (paise). Sign comes from `type`.
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    // Local calendar date in Asia/Kolkata.
    date: date("date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    merchant: text("merchant"),
    paymentMethod: paymentMethod("payment_method"),
    // Original free-text input, kept for audit and re-parsing.
    rawText: text("raw_text"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("entries_amount_positive", sql`${t.amountMinor} > 0`),
    check("entries_income_private", sql`${t.type} <> 'income' OR ${t.groupId} IS NULL`),
    index("entries_owner_date_idx").on(t.ownerId, t.date),
    index("entries_group_date_idx").on(t.groupId, t.date),
  ],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Lowercase, without the leading '#'.
  name: text("name").notNull().unique(),
});

export const entryTags = pgTable(
  "entry_tags",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] }), index("entry_tags_tag_idx").on(t.tagId)],
);

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Entry = typeof entries.$inferSelect;
