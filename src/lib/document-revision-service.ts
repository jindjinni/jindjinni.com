// The history of revisions sent on a document: one row each time, with the note that went to the other company and the document
// exactly as it was just before the change, so an earlier version can always be looked at. Scoped by organizationId.

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documentRevisions } from "@/db/schema";
import { newId } from "@/lib/ids";

export type RevisionSource = "purchasing_po" | "sales_doc";
export type RevisionRow = typeof documentRevisions.$inferSelect;

export async function addRevisionRecord(args: { organizationId: string; userId: string; source: RevisionSource; documentId: string; revision: number; note: string; before: unknown; emailedTo: string | null }) {
  await db.insert(documentRevisions).values({
    id: newId("drev"),
    organizationId: args.organizationId,
    source: args.source,
    documentId: args.documentId,
    revision: args.revision,
    note: args.note,
    snapshot: JSON.stringify(args.before),
    emailedTo: args.emailedTo,
    createdByUserId: args.userId,
  });
}

export async function listRevisions(organizationId: string, source: RevisionSource, documentId: string): Promise<RevisionRow[]> {
  return db
    .select()
    .from(documentRevisions)
    .where(and(eq(documentRevisions.organizationId, organizationId), eq(documentRevisions.source, source), eq(documentRevisions.documentId, documentId)))
    .orderBy(asc(documentRevisions.revision));
}
