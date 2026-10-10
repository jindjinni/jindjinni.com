"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { saveAuditor, setAuditorHidden } from "@/lib/audit-insights-service";

export type DirectoryState = { error?: string; message?: string; /** What was typed, sent back after a refusal so the boxes keep it. */ values?: Record<string, string> } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Everyone who works in Accounts may keep the directory; a platform person looking in never can. Re-checked here on the server. */
async function worker() {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed) return { error: "The Audit Center isn't available here." } as const;
  if (!acc.canWork) return { error: "Your role can look at the directory but can't change it." } as const;
  return { org } as const;
}

export async function saveAuditorAction(id: string | null, _prev: DirectoryState, fd: FormData): Promise<DirectoryState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  const typed = { kind: str(fd, "kind"), name: str(fd, "name"), company: str(fd, "company"), email: str(fd, "email"), phone: str(fd, "phone"), notes: str(fd, "notes") };
  const res = await saveAuditor({ organizationId: w.org.organizationId, userId: w.org.userId }, typed, id);
  if (!res.ok) return { error: res.error, values: typed };
  revalidatePath("/dashboard/accounts/audit-center/directory");
  return { message: id ? "Saved." : "Added to the directory." };
}

export async function hideAuditorAction(id: string, hidden: boolean): Promise<DirectoryState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  const res = await setAuditorHidden(w.org.organizationId, String(id), !!hidden);
  if (!res.ok) return { error: res.error };
  revalidatePath("/dashboard/accounts/audit-center/directory");
  return { message: hidden ? "Hidden. You can bring it back below." : "Brought back." };
}
