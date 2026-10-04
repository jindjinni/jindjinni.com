import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/legal";

export type LegalSection = { heading: string; paras?: string[]; items?: string[]; after?: string[] };

/** Renders a legal document from plain data so the wording is easy to edit without touching layout. */
export function LegalPage({ title, intro, sections, children }: { title: string; intro: string; sections: LegalSection[]; children?: ReactNode }) {
  return (
    <article className="legal-doc">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm font-semibold text-muted">Last updated {LEGAL_UPDATED}</p>
      <p className="mt-6 text-base leading-7 text-ink">{intro}</p>
      {sections.map((s, i) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-xl font-bold text-ink">
            {i + 1}. {s.heading}
          </h2>
          {s.paras?.map((p) => (
            <p key={p} className="mt-3 text-base leading-7 text-ink/90">
              {p}
            </p>
          ))}
          {s.items && (
            <ul className="mt-3 list-disc space-y-2 pl-6 text-base leading-7 text-ink/90">
              {s.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          )}
          {s.after?.map((p) => (
            <p key={p} className="mt-3 text-base leading-7 text-ink/90">
              {p}
            </p>
          ))}
        </section>
      ))}
      {children}
    </article>
  );
}
