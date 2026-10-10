"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markReadAction } from "@/app/actions/mailbox";

/** Marks the open message as read once it has been on screen (so just loading the page never changes anything by itself). */
export function MarkRead({ dept, boxId, id }: { dept: string; boxId: string; id: string }) {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    markReadAction(dept, boxId, id).then(() => live && router.refresh()).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [dept, boxId, id, router]);
  return null;
}
