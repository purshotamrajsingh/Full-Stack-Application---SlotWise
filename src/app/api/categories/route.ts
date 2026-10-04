import { db } from "@/lib/db";
import { handle, ok } from "@/lib/api";

/** GET /api/categories — distinct active categories with service counts. */
export async function GET() {
  return handle(async () => {
    const services = await db.service.findMany({
      where: { isActive: true },
      select: { category: true },
    });
    const counts = new Map<string, number>();
    for (const s of services) {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    const items = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return ok({ items });
  });
}
