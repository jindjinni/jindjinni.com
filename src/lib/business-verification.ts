// Who a company really is. New companies give these details (and one proof document) when they sign up and stay on an
// "Under review" screen until the platform owner approves them. Shared by the sign-up action, the safety-net onboarding
// action and the "fix and resubmit" action, so all three ask for exactly the same things.

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { businessVerifications, organizations } from "@/db/schema";
import { newId } from "@/lib/ids";

export { US_STATES, ENTITY_TYPES, BUSINESS_TYPES, PROOF_TYPES, MAX_PROOF_BYTES, MIN_DESCRIPTION } from "@/lib/business-verification-options";
import { US_STATES, ENTITY_TYPES, BUSINESS_TYPES, PROOF_TYPES, MAX_PROOF_BYTES, MIN_DESCRIPTION } from "@/lib/business-verification-options";

const VALID_EIN_PREFIXES = new Set(
  [
    ...range(1, 6), ...range(10, 16), ...range(20, 27), ...range(30, 39), ...range(40, 48), ...range(50, 68),
    ...range(71, 77), ...range(80, 88), ...range(90, 95), 98, 99,
  ].map((n) => String(n).padStart(2, "0")),
);

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** "12-3456789" for a well-formed EIN, or an error. Catches typos, made-up prefixes and obvious fakes (all one digit, 1234567). */
export function normalizeEin(raw: string): { ein: string } | { error: string } {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(digits)) return { error: "EIN must be 9 digits, like 12-3456789." };
  if (!VALID_EIN_PREFIXES.has(digits.slice(0, 2))) return { error: "That EIN doesn't look right: the first two digits aren't one the IRS issues. Check it against your IRS letter." };
  if (/^(\d)\1{8}$/.test(digits) || digits.slice(2) === "1234567" || digits.slice(2) === "0000000") {
    return { error: "That EIN doesn't look real. Enter the EIN from your IRS letter." };
  }
  return { ein: `${digits.slice(0, 2)}-${digits.slice(2)}` };
}

export type VerificationInput = {
  ein: string;
  registeredState: string;
  entityType: string;
  stateFileNumber: string;
  yearFormed: number;
  businessType: string;
  businessDescription: string;
  proofType: string;
  proofFileName: string;
  proofContentType: string;
  proofData: string;
};

const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").replace(/\r/g, "").trim().slice(0, max);

/** True when the bytes really are a PDF, PNG or JPEG: the file's own label is not trusted. */
function sniff(buf: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (buf.length > 4 && buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

/** Reads and checks every verification field from a submitted form. Returns the cleaned data, or the first thing to fix. */
export async function readVerification(fd: FormData): Promise<{ data: VerificationInput } | { error: string }> {
  const einRes = normalizeEin(text(fd, "ein", 20));
  if ("error" in einRes) return einRes;

  const registeredState = text(fd, "registeredState", 2).toUpperCase();
  if (!US_STATES.some((s) => s.code === registeredState)) return { error: "Choose the state your business is registered in." };

  const entityType = text(fd, "entityType", 40);
  if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) return { error: "Choose your business type (LLC, corporation, and so on)." };

  const stateFileNumber = text(fd, "stateFileNumber", 40);
  if (stateFileNumber.length < 3) return { error: "State registration / file number is required. It's on your state business filing." };

  const yearFormed = Number(text(fd, "yearFormed", 4));
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(yearFormed) || yearFormed < 1900 || yearFormed > thisYear) {
    return { error: `Enter the year your business was formed (1900 to ${thisYear}).` };
  }

  const businessType = text(fd, "businessType", 40);
  if (!(BUSINESS_TYPES as readonly string[]).includes(businessType)) return { error: "Choose the kind of business you run." };

  const businessDescription = text(fd, "businessDescription", 600);
  if (businessDescription.length < MIN_DESCRIPTION) return { error: `Tell us in a sentence or two what your business does (at least ${MIN_DESCRIPTION} characters).` };

  const proofType = text(fd, "proofType", 80);
  if (!(PROOF_TYPES as readonly string[]).includes(proofType)) return { error: "Choose which proof document you are uploading." };

  const file = fd.get("proof");
  if (!(file instanceof File) || file.size === 0) return { error: "Upload one proof document: your IRS EIN letter or your state registration." };
  if (file.size > MAX_PROOF_BYTES) return { error: "The proof document must be 4MB or smaller." };
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return { error: "The proof document must be a PDF, PNG or JPG." };

  return {
    data: {
      ein: einRes.ein,
      registeredState,
      entityType,
      stateFileNumber,
      yearFormed,
      businessType,
      businessDescription,
      proofType,
      proofFileName: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "proof",
      proofContentType: kind,
      proofData: buf.toString("base64"),
    },
  };
}

/** Another company (other than this one) already uses this EIN and has not been turned down. */
export async function einInUse(ein: string, exceptOrgId?: string): Promise<boolean> {
  const rows = await db
    .select({ orgId: businessVerifications.organizationId, status: organizations.approvalStatus })
    .from(businessVerifications)
    .innerJoin(organizations, eq(organizations.id, businessVerifications.organizationId))
    .where(exceptOrgId ? and(eq(businessVerifications.ein, ein), ne(businessVerifications.organizationId, exceptOrgId)) : eq(businessVerifications.ein, ein));
  return rows.some((r) => r.status !== "rejected");
}

export const EIN_IN_USE_MESSAGE = "That EIN is already registered with another company on this platform. If it is yours, contact support so we can sort it out.";

/** Saves (or replaces) a company's verification and puts it in the review queue. */
export async function saveVerification(organizationId: string, v: VerificationInput): Promise<void> {
  const now = new Date().toISOString();
  const [existing] = await db.select({ id: businessVerifications.id }).from(businessVerifications).where(eq(businessVerifications.organizationId, organizationId)).limit(1);
  if (existing) {
    await db.update(businessVerifications).set({ ...v, submittedAt: now, updatedAt: now }).where(eq(businessVerifications.id, existing.id));
  } else {
    await db.insert(businessVerifications).values({ id: newId("bverif"), organizationId, ...v, submittedAt: now });
  }
}

export function stateName(code: string): string {
  return US_STATES.find((s) => s.code === code)?.name ?? code;
}
