"use server";

// The platform owner's work on Jin's library and the feedback inbox. Every action re-checks that the person is the
// platform owner; hiding the page is never the guard.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jinFeedback, jinKnowledge } from "@/db/schema";
import { newId } from "@/lib/ids";
import { requireOrg } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { isCategory } from "@/lib/jin-library";
import { parseFormats, validateFormat } from "@/lib/industry-checks";

export type LibState = { error?: string; message?: string } | undefined;

async function requireOwnerOfPlatform() {
  const org = await requireOrg();
  if (!(await isPlatformAdmin(org))) throw new Error("Only the platform owner can change Jin's library.");
  return org;
}

const txt = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").replace(/\r/g, "").trim().slice(0, max);
const realDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

function refresh() {
  revalidatePath("/dashboard/settings/jin-library");
}

/** Saves a library entry. Going LIVE needs a source and a "last verified" day: nothing unsourced reaches Jin. */
export async function saveEntryAction(_prev: LibState, fd: FormData): Promise<LibState> {
  const org = await requireOwnerOfPlatform();
  const id = txt(fd, "id", 60);
  const title = txt(fd, "title", 120);
  const category = txt(fd, "category", 30);
  const brand = txt(fd, "brand", 60) || null;
  const body = txt(fd, "body", 4000);
  const source = txt(fd, "source", 300);
  const verifiedOn = txt(fd, "verifiedOn", 10);
  const formatsRaw = txt(fd, "formats", 800);
  const formatKind = txt(fd, "formatKind", 10);
  const status: "LIVE" | "DRAFT" = txt(fd, "status", 10) === "LIVE" ? "LIVE" : "DRAFT";
  if (!title) return { error: "Give the entry a title." };
  if (!isCategory(category)) return { error: "Choose a category." };
  if (!body) return { error: "Write what Jin should know." };
  if (verifiedOn && !realDate(verifiedOn)) return { error: "The verified date isn't a real date." };
  const formats = parseFormats(formatsRaw);
  if (formats.length) {
    if (!brand) return { error: "A lot or serial layout needs the brand it belongs to." };
    if (formatKind !== "lot" && formatKind !== "serial") return { error: "Say whether the layouts are for lot numbers or serial numbers." };
    for (const f of formats) {
      const bad = validateFormat(f);
      if (bad) return { error: bad };
    }
    if (formats.length > 20) return { error: "Keep it to 20 layouts per entry." };
  }
  if (status === "LIVE" && (!source || !verifiedOn)) return { error: "Before an entry goes live it needs its source and the day you last verified it. Save it as a draft until you have both." };
  const values = { title, category, brand, body, source, verifiedOn: verifiedOn || null, formats: formats.length ? formats.join("\n") : null, formatKind: formats.length ? formatKind : null, status, updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") };
  if (id) {
    const r = await db.update(jinKnowledge).set(values).where(eq(jinKnowledge.id, id));
    if (!r.rowsAffected) return { error: "That entry no longer exists." };
  } else {
    await db.insert(jinKnowledge).values({ id: newId("jk"), createdByUserId: org.userId, ...values });
  }
  refresh();
  return { message: status === "LIVE" ? "Saved. Jin can use this now." : "Saved as a draft. Jin can't see it yet." };
}

export async function deleteEntryAction(_prev: LibState, fd: FormData): Promise<LibState> {
  await requireOwnerOfPlatform();
  await db.delete(jinKnowledge).where(eq(jinKnowledge.id, txt(fd, "id", 60)));
  refresh();
  return { message: "Deleted." };
}

export async function setFeedbackStatusAction(_prev: LibState, fd: FormData): Promise<LibState> {
  await requireOwnerOfPlatform();
  const status = txt(fd, "status", 10);
  if (status !== "REVIEWED" && status !== "DISMISSED") return { error: "Unknown status." };
  await db.update(jinFeedback).set({ status }).where(eq(jinFeedback.id, txt(fd, "id", 60)));
  refresh();
  return { message: "Done." };
}

/** Turns a correction into a DRAFT entry for the owner to rewrite. It is never copied live automatically. */
export async function draftFromFeedbackAction(_prev: LibState, fd: FormData): Promise<LibState> {
  const org = await requireOwnerOfPlatform();
  const [f] = await db.select().from(jinFeedback).where(eq(jinFeedback.id, txt(fd, "id", 60))).limit(1);
  if (!f) return { error: "That feedback no longer exists." };
  await db.insert(jinKnowledge).values({
    id: newId("jk"),
    title: f.question.slice(0, 100),
    category: "other",
    body: `RAW FROM FEEDBACK. Rewrite this as a general fact and remove any customer, company or price details before going live.\n\nQuestion: ${f.question}\n\nWhat Jin said: ${f.answer}\n\nCorrection: ${f.note ?? "(none)"}`.slice(0, 4000),
    source: "",
    status: "DRAFT",
    createdByUserId: org.userId,
  });
  await db.update(jinFeedback).set({ status: "REVIEWED" }).where(eq(jinFeedback.id, f.id));
  refresh();
  return { message: "Saved as a draft entry. Rewrite it below before it goes live." };
}
