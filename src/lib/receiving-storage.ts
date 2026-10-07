// Where receiving photos live: a private Vercel Blob store. Photos are never
// public links -- the app streams them through a signed-in, company-checked
// route (/api/receiving/photos/[id]). Tests swap in an in-memory driver.

import { put, get, del } from "@vercel/blob";

export type StorageDriver = {
  configured(): boolean;
  save(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; size?: number } | null>;
  remove(pathname: string): Promise<void>;
};

const blobDriver: StorageDriver = {
  // Vercel connects a store either with a read-write token or (newer, safer) a store id used with the deployment's own sign-in (OIDC). Either works.
  configured: () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  async save(pathname, bytes, contentType) {
    await put(pathname, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  },
  async read(pathname) {
    const res = await get(pathname, { access: "private" });
    if (!res || !res.stream) return null;
    return { stream: res.stream as ReadableStream<Uint8Array> };
  },
  async remove(pathname) {
    await del(pathname);
  },
};

// Test hook, like the *_TEST_BASE switches: STORAGE_TEST_MEMORY=1 keeps files in memory so end-to-end tests can send and open files without a
// real store. Ignored on Vercel.
const memoryFiles: Map<string, Uint8Array> = ((globalThis as { __memFiles?: Map<string, Uint8Array> }).__memFiles ??= new Map());
const memoryDriver: StorageDriver = {
  configured: () => true,
  async save(pathname, bytes) {
    memoryFiles.set(pathname, new Uint8Array(bytes));
  },
  async read(pathname) {
    const b = memoryFiles.get(pathname);
    if (!b) return null;
    return { stream: new Blob([b as BlobPart]).stream() as ReadableStream<Uint8Array>, size: b.length };
  },
  async remove(pathname) {
    memoryFiles.delete(pathname);
  },
};
const testMemory = () => process.env.STORAGE_TEST_MEMORY === "1" && !process.env.VERCEL;

let driver: StorageDriver = blobDriver;
/** For tests only. */
export function setStorageDriver(d: StorageDriver | null) {
  driver = d ?? blobDriver;
}
const active = () => (driver === blobDriver && testMemory() ? memoryDriver : driver);
export const storage = {
  configured: () => active().configured(),
  save: (p: string, b: Uint8Array, c: string) => active().save(p, b, c),
  read: (p: string) => active().read(p),
  remove: (p: string) => active().remove(p),
};

export const STORAGE_NOT_CONNECTED =
  "Photo storage isn't connected yet. An admin needs to connect the file storage in Vercel (see the setup note), then photos can be added.";
