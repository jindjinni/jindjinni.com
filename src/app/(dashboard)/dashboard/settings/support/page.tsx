import { redirect } from "next/navigation";

// Moved: the Support inbox now lives in the Mothership tab. Old bookmarks and old emails still work.
export default async function OldSupportPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ["q", "filter", "page"] as const) if (sp[k]) qs.set(k, sp[k]!);
  redirect(`/dashboard/mothership/support${qs.toString() ? `?${qs}` : ""}`);
}
