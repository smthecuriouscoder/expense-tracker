import { ENTRY_TYPES, PAYMENT_METHODS, type EntryType, type PaymentMethod } from "./constants";
import { endOfMonth, isISODate, startOfMonth, todayIST } from "./dates";

/** Whose entries a view covers. "me" = entries I own; "group" = all entries in a group I belong to. */
export type Scope = { kind: "me"; includeShared: boolean } | { kind: "group"; groupId: string };

/** Global filter bar state, shared by the dashboard, transactions list, and CSV export. URL is the source of truth. */
export type Filters = {
  scope: Scope;
  from: string;
  to: string;
  categoryId?: string;
  memberId?: string;
  tag?: string;
  paymentMethod?: PaymentMethod;
  type?: EntryType;
  q?: string;
};

export type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const uuidOrUndefined = (v: string | undefined) => (v && UUID.test(v) ? v : undefined);

export function parseFilters(params: SearchParams, today: string = todayIST()): Filters {
  const scopeParam = first(params.scope);
  const groupId = uuidOrUndefined(scopeParam);
  const scope: Scope = groupId
    ? { kind: "group", groupId }
    : { kind: "me", includeShared: first(params.shared) !== "0" };

  let from = first(params.from);
  let to = first(params.to);
  if (!from || !isISODate(from)) from = startOfMonth(today);
  if (!to || !isISODate(to)) to = endOfMonth(today);
  if (from > to) [from, to] = [to, from];

  const pm = first(params.pm);
  const type = first(params.type);
  const tag = first(params.tag)?.replace(/^#/, "").toLowerCase();

  return {
    scope,
    from,
    to,
    categoryId: uuidOrUndefined(first(params.cat)),
    memberId: scope.kind === "group" ? uuidOrUndefined(first(params.member)) : undefined,
    tag: tag || undefined,
    paymentMethod: PAYMENT_METHODS.includes(pm as PaymentMethod) ? (pm as PaymentMethod) : undefined,
    type: ENTRY_TYPES.includes(type as EntryType) ? (type as EntryType) : undefined,
    q: first(params.q)?.slice(0, 100),
  };
}

export function filtersToSearchParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.scope.kind === "group") p.set("scope", f.scope.groupId);
  else if (!f.scope.includeShared) p.set("shared", "0");
  p.set("from", f.from);
  p.set("to", f.to);
  if (f.categoryId) p.set("cat", f.categoryId);
  if (f.memberId) p.set("member", f.memberId);
  if (f.tag) p.set("tag", f.tag);
  if (f.paymentMethod) p.set("pm", f.paymentMethod);
  if (f.type) p.set("type", f.type);
  if (f.q) p.set("q", f.q);
  return p;
}
