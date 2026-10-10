// Shared CSV/Excel upload parsing, used by every "Import from CSV/Excel"
// button across the app (Purchasing Products, Purchasing Customers, and
// anywhere else one gets added later -- see the ImportSpreadsheetForm
// component for the matching UI half).
//
// .csv/.txt go through a small hand-written parser so the common case
// never touches the xlsx package's regex-heavy parsing code (it carries a
// couple of known high-severity advisories -- prototype pollution and
// ReDoS -- in the handling of certain crafted spreadsheet formats). Actual
// .xlsx/.xls binary files still need it; those are only ever uploaded here
// by an already-authenticated Purchasing user acting on their own file, not
// by an anonymous visitor, which is the scenario those advisories are
// about.
import * as XLSX from "xlsx";

export type ParsedSheet = { headers: string[]; rows: Record<string, string>[] };

/** The non-empty rows of a CSV as plain lists of trimmed text (for files whose first lines are titles, like QuickBooks exports). */
export function parseCsvGrid(text: string): string[][] {
  return csvRows(text).filter((r) => r.some((cell) => cell.trim() !== "")).map((r) => r.map((c) => c.trim()));
}

function csvRows(text: string): string[][] {
  // Minimal RFC4180-style parser: quoted fields, embedded commas/newlines,
  // and "" as an escaped quote. Good enough for exports from Excel/Sheets.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const body = text.replace(/\r\n/g, "\n").replace(/^﻿/, ""); // strip BOM

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsvText(text: string): ParsedSheet {
  const nonEmpty = csvRows(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const dataRows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows: dataRows };
}

function parseWorkbookBuffer(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const nonEmpty = rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => String(h ?? "").trim());
  const dataRows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = String(r[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows: dataRows };
}

export function parseSpreadsheetFile(buffer: Buffer, filename: string): ParsedSheet {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt") {
    return parseCsvText(buffer.toString("utf8"));
  }
  return parseWorkbookBuffer(buffer);
}

/** Case/whitespace-insensitive header match against a list of accepted spellings. */
export function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const candidateSet = candidates.map(normalized);
  for (const header of headers) {
    if (candidateSet.includes(normalized(header))) return header;
  }
  return null;
}
