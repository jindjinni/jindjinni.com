import Link from "next/link";
import { featureOn } from "@/lib/features";
import { GUIDES, guideAnchor, helpHref, type GuideKey } from "@/lib/connect-guides";
import { requireOrg } from "@/lib/tenant";
import { ShareBox } from "@/components/connect-guide-share";

/**
 * The plain "Connect it" guide: what it does, what it costs, numbered steps, how to check it worked, what to do when it breaks,
 * text to share with the team, and a Need help link that opens a Support ticket already filled in. It only shows words (nothing
 * here writes anything). `open` is true while the thing is not connected, so a first-timer sees the steps without hunting.
 */
export async function ConnectGuide({ guideKey, open }: { guideKey: GuideKey; open?: boolean }) {
  const g = GUIDES[guideKey];
  const org = await requireOrg();
  const supportOn = await featureOn("support-center", org.organizationId);
  const head = "text-sm font-medium text-slate-900 dark:text-slate-50";
  return (
    <details id={guideAnchor(guideKey)} open={open} className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid={`guide-${guideKey}`}>
      <summary className="cursor-pointer px-5 py-4 text-base font-semibold text-slate-900 dark:text-slate-50">{g.title}</summary>
      <div className="space-y-4 border-t border-slate-200 px-5 py-4 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
        <div>
          <p className={head}>What this does</p>
          <p>{g.what}</p>
        </div>
        <div>
          <p className={head}>What it costs</p>
          <p>{g.cost}</p>
        </div>
        <div>
          <p className={head}>Steps</p>
          <ol className="ml-5 list-decimal space-y-1" data-testid={`guide-${guideKey}-steps`}>
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className={head}>How to check it worked</p>
          <p>{g.check}</p>
        </div>
        <div>
          <p className={head}>If it stops working</p>
          <p>{g.ifBroken}</p>
        </div>
        <ShareBox id={`share-${guideKey}`} text={g.share(org.organizationName)} />
        <p className="text-xs text-slate-500 dark:text-slate-400" data-testid={`guide-${guideKey}-help`}>
          Need help?{" "}
          {supportOn ? (
            <>
              <Link className="underline" href={helpHref(guideKey)}>Send us a message</Link> and we&apos;ll walk you through it. Your company ID is attached automatically.
            </>
          ) : (
            <>Ask the person who looks after your Jindjinni account to contact us, and we&apos;ll walk you through it.</>
          )}
        </p>
      </div>
    </details>
  );
}
