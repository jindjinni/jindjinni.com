import { requireOrg } from "@/lib/tenant";
import { getPurchasingCategories } from "@/lib/queries";
import { createPurchasingCategory, updatePurchasingCategory } from "@/app/actions/purchasing";

export default async function PurchasingCategoriesPage() {
  const org = await requireOrg();
  const categories = await getPurchasingCategories(org.organizationId, { includeInactive: true });
  const canEdit = org.role !== "staff";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Categories</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Brand/category groupings for the product catalog (Dexcom, Omnipod, Freestyle...). Editable by a Purchasing Manager or Master Admin only.
      </p>

      {canEdit && (
        <form
          action={createPurchasingCategory}
          className="mt-6 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Category name</span>
            <input
              name="name"
              required
              placeholder="e.g. Dexcom"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Add category
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Active</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                {canEdit ? (
                  <td colSpan={3} className="px-4 py-2">
                    <form action={updatePurchasingCategory.bind(null, c.id)} className="flex items-center gap-3">
                      <input
                        name="name"
                        defaultValue={c.name}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                        <input type="checkbox" name="active" defaultChecked={c.active} /> Active
                      </label>
                      <button type="submit" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                        Save
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{c.name}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.active ? "Yes" : "No"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
