import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { entries } from "@/server/db/schema";
import { createEntries, listEntries, restoreEntry, softDeleteEntry, updateEntry } from "@/server/entries";
import { addMember, createGroup, leaveGroup, removeMember, setMemberRole } from "@/server/groups";
import { getCategoryBreakdown, getIncomeVsExpense, getKpis, getSpendByMember } from "@/server/analytics";
import { addCustomSubcategory, deleteCustomCategory, listCategories } from "@/server/categories";
import { removeAllowedEmail, upsertUserOnSignIn } from "@/server/users";
import { parseFilters } from "@/lib/filters";
import { categoryId, createTestDb, createUser, defaultGroupId, entry } from "./helpers/db";

const TODAY = "2026-10-22";
const meFilters = (extra: Record<string, string> = {}) => parseFilters(extra, TODAY);
const groupFilters = (groupId: string, extra: Record<string, string> = {}) => parseFilters({ scope: groupId, ...extra }, TODAY);

describe("users & sign-in", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("rejects emails that aren't invited", async () => {
    expect(await upsertUserOnSignIn(db, { email: "stranger@example.com" }, "admin@example.com")).toBeNull();
  });

  it("creates the Family group for the first user and joins later users to it", async () => {
    const admin = await createUser(db, "admin@example.com", "Admin");
    expect(admin.isAppAdmin).toBe(true);
    const mom = await createUser(db, "mom@example.com", "Mom");
    expect(mom.isAppAdmin).toBe(false);
    const familyId = await defaultGroupId(db);
    const list = await listEntries(db, mom.id, groupFilters(familyId));
    expect(list.total).toBe(0); // mom can view Family (no throw)
  });

  it("deactivates removed users but keeps their entries", async () => {
    const admin = await createUser(db, "admin@example.com");
    const temp = await createUser(db, "temp@example.com", "Temp");
    const familyId = await defaultGroupId(db);
    await createEntries(db, temp.id, [entry({ categoryId: await categoryId(db, "food.dining"), groupId: familyId })]);
    await removeAllowedEmail(db, admin, "temp@example.com");
    expect(await upsertUserOnSignIn(db, { email: "temp@example.com" }, "admin@example.com")).toBeNull();
    const list = await listEntries(db, admin.id, groupFilters(familyId));
    expect(list.rows.find((r) => r.ownerName === "Temp")?.ownerActive).toBe(false);
  });
});

describe("entry access rules", () => {
  let db: Db;
  let me: Awaited<ReturnType<typeof createUser>>;
  let sis: Awaited<ReturnType<typeof createUser>>;
  let outsider: Awaited<ReturnType<typeof createUser>>;
  let familyId: string;
  let tripId: string;
  let dining: string;
  let salary: string;

  beforeAll(async () => {
    db = await createTestDb();
    me = await createUser(db, "admin@example.com", "Me");
    sis = await createUser(db, "sis@example.com", "Sis");
    outsider = await createUser(db, "cousin@example.com", "Cousin");
    familyId = await defaultGroupId(db);
    tripId = (await createGroup(db, me.id, "Goa Trip")).id;
    await addMember(db, me.id, tripId, sis.id);
    dining = await categoryId(db, "food.dining");
    salary = await categoryId(db, "income.salary");
  });

  it("hides private entries from groups and shows group entries to all members", async () => {
    await createEntries(db, me.id, [
      entry({ categoryId: dining, description: "private dinner" }),
      entry({ categoryId: dining, description: "trip dinner", groupId: tripId }),
    ]);
    const sisTrip = await listEntries(db, sis.id, groupFilters(tripId));
    expect(sisTrip.rows.map((r) => r.description)).toEqual(["trip dinner"]);
    const myAll = await listEntries(db, me.id, meFilters());
    expect(myAll.total).toBe(2);
    expect(myAll.rows[0].categorySlug).toBe("food.dining");
    const myPrivate = await listEntries(db, me.id, meFilters({ shared: "0" }));
    expect(myPrivate.rows.map((r) => r.description)).toEqual(["private dinner"]);
  });

  it("forbids non-members from viewing or posting to a group", async () => {
    await expect(listEntries(db, outsider.id, groupFilters(tripId))).rejects.toThrow(/not a member/);
    await expect(createEntries(db, outsider.id, [entry({ categoryId: dining, groupId: tripId })])).rejects.toThrow(/not a member/);
  });

  it("keeps income private", async () => {
    await expect(createEntries(db, me.id, [entry({ type: "income", categoryId: salary, groupId: familyId })])).rejects.toThrow(
      /Income is always private/,
    );
    await expect(
      db.insert(entries).values({
        ownerId: me.id,
        groupId: familyId,
        type: "income",
        amountMinor: 1,
        categoryId: salary,
        date: TODAY,
        description: "x",
      }),
    ).rejects.toThrow();
  });

  it("requires the category kind to match the entry type", async () => {
    await expect(createEntries(db, me.id, [entry({ type: "income", categoryId: dining })])).rejects.toThrow(/income category/);
    await expect(createEntries(db, me.id, [entry({ categoryId: await categoryId(db, "food") })])).rejects.toThrow(/subcategory/);
  });

  it("saves a batch atomically", async () => {
    const before = (await listEntries(db, sis.id, meFilters())).total;
    await expect(
      createEntries(db, sis.id, [entry({ categoryId: dining }), entry({ categoryId: dining, amountMinor: -5 })]),
    ).rejects.toThrow();
    expect((await listEntries(db, sis.id, meFilters())).total).toBe(before);
  });

  it("lets only the owner edit, delete, and restore", async () => {
    const [id] = await createEntries(db, sis.id, [entry({ categoryId: dining, groupId: familyId, tags: ["#Diwali"] })]);
    await expect(updateEntry(db, me.id, id, entry({ categoryId: dining }))).rejects.toThrow(/Only the person/);
    await expect(softDeleteEntry(db, me.id, id)).rejects.toThrow(/Only the person/);

    await updateEntry(db, sis.id, id, entry({ categoryId: dining, groupId: familyId, amountMinor: 34_000, tags: ["diwali", "gifts"] }));
    let fam = await listEntries(db, me.id, groupFilters(familyId, { tag: "gifts" }));
    expect(fam.rows[0]).toMatchObject({ amountMinor: 34_000, tags: ["diwali", "gifts"] });

    await softDeleteEntry(db, sis.id, id);
    fam = await listEntries(db, me.id, groupFilters(familyId, { tag: "gifts" }));
    expect(fam.total).toBe(0);
    await restoreEntry(db, sis.id, id);
    fam = await listEntries(db, me.id, groupFilters(familyId, { tag: "gifts" }));
    expect(fam.total).toBe(1);
  });

  it("searches description and merchant", async () => {
    await createEntries(db, me.id, [entry({ categoryId: dining, description: "Biryani", merchant: "Swiggy" })]);
    expect((await listEntries(db, me.id, meFilters({ q: "swig" }))).total).toBe(1);
    expect((await listEntries(db, me.id, meFilters({ q: "biry" }))).total).toBe(1);
    expect((await listEntries(db, me.id, meFilters({ q: "100%" }))).total).toBe(0);
  });
});

describe("groups", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("enforces admin rules and keeps entries after a member leaves", async () => {
    const a = await createUser(db, "admin@example.com", "A");
    const b = await createUser(db, "b@example.com", "B");
    const g = await createGroup(db, a.id, "Flat");
    await expect(addMember(db, b.id, g.id, b.id)).rejects.toThrow(/not a member/);
    await addMember(db, a.id, g.id, b.id);
    await expect(addMember(db, b.id, g.id, a.id)).rejects.toThrow(/Only group admins/);

    await expect(leaveGroup(db, a.id, g.id)).rejects.toThrow(/last admin/);
    await expect(setMemberRole(db, a.id, g.id, a.id, "member")).rejects.toThrow(/at least one admin/);

    await createEntries(db, b.id, [entry({ categoryId: await categoryId(db, "housing.rent"), groupId: g.id })]);
    await leaveGroup(db, b.id, g.id);
    await expect(listEntries(db, b.id, groupFilters(g.id))).rejects.toThrow(/not a member/);
    expect((await listEntries(db, a.id, groupFilters(g.id))).total).toBe(1);
    expect((await listEntries(db, b.id, meFilters())).total).toBe(1);

    await addMember(db, a.id, g.id, b.id);
    await setMemberRole(db, a.id, g.id, b.id, "admin");
    await leaveGroup(db, a.id, g.id);
    await expect(removeMember(db, b.id, g.id, a.id)).rejects.toThrow(/isn't in this group/);
  });
});

describe("categories", () => {
  it("adds custom children and reassigns entries on delete", async () => {
    const db = await createTestDb();
    const a = await createUser(db, "admin@example.com");
    const b = await createUser(db, "b@example.com");
    const food = await categoryId(db, "food");
    const pets = await addCustomSubcategory(db, b.id, food, "Pet food");
    expect(pets.slug).toBe("food.c-pet-food");
    await expect(addCustomSubcategory(db, b.id, food, "pet FOOD")).rejects.toThrow(/already exists/);
    await expect(addCustomSubcategory(db, b.id, pets.id, "Nested")).rejects.toThrow(/top-level/);

    await createEntries(db, a.id, [entry({ categoryId: pets.id })]);
    const other = await categoryId(db, "food.other");
    await expect(deleteCustomCategory(db, { id: a.id, isAppAdmin: false }, pets.id, other)).rejects.toThrow(/creator/);
    await expect(deleteCustomCategory(db, b, pets.id, await categoryId(db, "food.other"))).resolves.toEqual({ moved: 1 });
    expect((await listCategories(db)).some((c) => c.id === pets.id)).toBe(false);
    await expect(deleteCustomCategory(db, a, other, pets.id)).rejects.toThrow();
  });

  it("lists parents before children with Other last", async () => {
    const db = await createTestDb();
    const list = await listCategories(db);
    const food = list.filter((c) => c.parentName === "Food");
    expect(list[0].parentId).toBeNull();
    expect(food.at(-1)?.name).toBe("Other");
  });
});

describe("analytics", () => {
  let db: Db;
  let me: Awaited<ReturnType<typeof createUser>>;
  let dad: Awaited<ReturnType<typeof createUser>>;
  let familyId: string;

  beforeAll(async () => {
    db = await createTestDb();
    me = await createUser(db, "admin@example.com", "Me");
    dad = await createUser(db, "dad@example.com", "Dad");
    familyId = await defaultGroupId(db);
    const [groceries, dining, shopping, salary] = await Promise.all(
      ["food.groceries", "food.dining", "shopping.clothing", "income.salary"].map((s) => categoryId(db, s)),
    );
    await createEntries(db, me.id, [
      entry({ categoryId: groceries, amountMinor: 300_000, date: "2026-10-05", groupId: familyId }),
      entry({ categoryId: dining, amountMinor: 100_000, date: "2026-10-06" }),
      entry({ categoryId: shopping, amountMinor: 200_000, date: "2026-10-07" }),
      entry({ type: "refund", categoryId: shopping, amountMinor: 50_000, date: "2026-10-08" }),
      entry({ type: "income", categoryId: salary, amountMinor: 1_000_000, date: "2026-10-01" }),
      entry({ categoryId: dining, amountMinor: 80_000, date: "2026-09-15" }),
    ]);
    await createEntries(db, dad.id, [entry({ categoryId: groceries, amountMinor: 500_000, date: "2026-10-03", groupId: familyId })]);
  });

  it("computes spend net of refunds, savings rate, and change vs last month", async () => {
    const k = await getKpis(db, me.id, meFilters());
    expect(k.spend).toBe(550_000);
    expect(k.income).toBe(1_000_000);
    expect(k.savingsRate).toBeCloseTo(0.45);
    expect(k.previousSpend).toBe(80_000);
    expect(k.avgPerDay).toBe(Math.round(550_000 / 31));
  });

  it("hides income in group scope", async () => {
    const k = await getKpis(db, me.id, groupFilters(familyId));
    expect(k.spend).toBe(800_000);
    expect(k.income).toBeNull();
    expect(await getIncomeVsExpense(db, me.id, groupFilters(familyId))).toBeNull();
  });

  it("breaks down by parent, and by child when drilling into a parent", async () => {
    const top = await getCategoryBreakdown(db, me.id, meFilters());
    expect(top.rows.map((r) => [r.name, r.slug, r.spend])).toEqual([
      ["Food", "food", 400_000],
      ["Shopping", "shopping", 150_000],
    ]);
    const drill = await getCategoryBreakdown(db, me.id, meFilters({ cat: await categoryId(db, "food") }));
    expect(drill.drillParent?.name).toBe("Food");
    expect(drill.rows.map((r) => r.name).sort()).toEqual(["Dining out", "Groceries / Kirana"]);
  });

  it("shows spend per member in a group", async () => {
    const rows = await getSpendByMember(db, me.id, groupFilters(familyId));
    expect(rows.map((r) => [r.name, r.spend])).toEqual([
      ["Dad", 500_000],
      ["Me", 300_000],
    ]);
  });

  it("returns monthly income vs expense only when income exists", async () => {
    const months = await getIncomeVsExpense(db, me.id, meFilters());
    expect(months).toHaveLength(6);
    expect(months?.at(-1)).toMatchObject({ month: "2026-10-01", income: 1_000_000, spend: 550_000, hasIncome: true });
    expect(months?.at(-2)).toMatchObject({ month: "2026-09-01", hasIncome: false });
    expect(await getIncomeVsExpense(db, dad.id, meFilters())).toEqual([]);
  });

  it("counts every row exactly once", async () => {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(entries);
    expect(n).toBe(7);
  });
});
