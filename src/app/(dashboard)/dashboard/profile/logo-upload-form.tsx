"use client";

import { useActionState, useRef, useState } from "react";
import { uploadBusinessLogo, removeBusinessLogo, type ActionState } from "@/app/actions/business-profile";

export function LogoUploadForm({ logoDataUrl }: { logoDataUrl: string | null }) {
  const [uploadState, uploadAction, uploadPending] = useActionState<ActionState, FormData>(uploadBusinessLogo, undefined);
  const [removeState, removeAction, removePending] = useActionState<ActionState, FormData>(removeBusinessLogo, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shown = preview ?? logoDataUrl;

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Company logo" className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-[10px] text-slate-400">No logo</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">Company Logo</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">PNG or JPG, up to 2MB. Used on quotation receipts and throughout the system.</p>
        <form
          action={uploadAction}
          onSubmit={() => {
            const file = fileInputRef.current?.files?.[0];
            if (file) setPreview(URL.createObjectURL(file));
          }}
          className="flex items-center gap-2"
        >
          <input ref={fileInputRef} type="file" name="logo" accept="image/png,image/jpeg" required className="text-xs text-slate-600 dark:text-slate-400" />
          <button
            type="submit"
            disabled={uploadPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {uploadPending ? "Uploading..." : logoDataUrl ? "Replace Logo" : "Upload Logo"}
          </button>
        </form>
        {logoDataUrl && (
          <form action={removeAction}>
            <button
              type="submit"
              disabled={removePending}
              onClick={() => setPreview(null)}
              className="text-xs text-red-600 hover:underline disabled:opacity-60 dark:text-red-400"
            >
              {removePending ? "Removing..." : "Remove Logo"}
            </button>
          </form>
        )}
        {uploadState?.error && <p className="text-xs text-red-600 dark:text-red-400">{uploadState.error}</p>}
        {removeState?.error && <p className="text-xs text-red-600 dark:text-red-400">{removeState.error}</p>}
      </div>
    </div>
  );
}
