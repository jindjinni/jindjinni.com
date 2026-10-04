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
  configured: () => !!process.env.BLOB_READ_WRITE_TOKEN,
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

let driver: StorageDriver = blobDriver;
/** For tests only. */
export function setStorageDriver(d: StorageDriver | null) {
  driver = d ?? blobDriver;
}
export const storage = {
  configured: () => driver.configured(),
  save: (p: string, b: Uint8Array, c: string) => driver.save(p, b, c),
  read: (p: string) => driver.read(p),
  remove: (p: string) => driver.remove(p),
};

export const STORAGE_NOT_CONNECTED =
  "Photo storage isn't connected yet. An admin needs to connect the file storage in Vercel (see the setup note), then photos can be added.";
