import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { parseDepartmentThemes } from "@/lib/theme";
import { ThemeForm } from "./theme-form";

export default async function AppearancePage() {
  const org = await requireOrg();
  const [row] = await db.select({ departmentThemes: organizations.departmentThemes }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1);
  const current = parseDepartmentThemes(row?.departmentThemes);

  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Appearance</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Every department has its own color, so you can tell at a glance where you are. The top bar, buttons, tabs and highlights follow
        the color of the department you&rsquo;re in.
      </p>
      {isAdmin(org.role) ? (
        <ThemeForm current={current} />
      ) : (
        <p className="mt-6 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Only an Administrator or Master Admin can change the colors.
        </p>
      )}
    </div>
  );
}
