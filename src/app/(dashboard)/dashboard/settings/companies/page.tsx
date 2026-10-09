import { redirect } from "next/navigation";

// Moved: the Companies list now lives in the Lamp tab. Old bookmarks still work.
export default async function OldCompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ["q", "filter", "page"] as const) if (sp[k]) qs.set(k, sp[k]!);
  redirect(`/dashboard/lamp/companies${qs.toString() ? `?${qs}` : ""}`);
}
