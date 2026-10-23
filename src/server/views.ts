import "server-only";
import { parseFilters, type SearchParams } from "@/lib/filters";
import { todayIST } from "@/lib/dates";
import { listCategories } from "./categories";
import type { Db } from "./db/client";
import { getGroupDetail, listMyGroups } from "./groups";

/**
 * Shared loader for pages with the global filter bar. Falls back to "Me" if the URL points at a group
 * the user is no longer in, so a stale link never errors.
 */
export async function loadFilterContext(db: Db, userId: string, searchParams: SearchParams) {
  const today = todayIST();
  let filters = parseFilters(searchParams, today);
  const [groups, categories] = await Promise.all([listMyGroups(db, userId), listCategories(db)]);

  let members: { id: string; name: string }[] = [];
  if (filters.scope.kind === "group") {
    const groupId = filters.scope.groupId;
    if (groups.some((g) => g.id === groupId)) {
      const detail = await getGroupDetail(db, userId, groupId);
      members = detail.members.map((m) => ({ id: m.userId, name: m.active ? m.name : `${m.name} (inactive)` }));
    } else {
      filters = { ...filters, scope: { kind: "me", includeShared: true }, memberId: undefined };
    }
  }

  return {
    today,
    filters,
    categories,
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    members,
  };
}
