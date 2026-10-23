import { todayIST } from "@/lib/dates";
import { listCategories } from "@/server/categories";
import { listMyGroups } from "@/server/groups";
import { authed } from "@/server/session";
import { LogScreen } from "./log-screen";

export default async function LogPage() {
  const { user, db } = await authed();
  const [categories, groups] = await Promise.all([listCategories(db), listMyGroups(db, user.id)]);
  return <LogScreen categories={categories} groups={groups.map((g) => ({ id: g.id, name: g.name }))} today={todayIST()} />;
}
