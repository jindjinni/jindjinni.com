"use client";

import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("human check failed to load")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * The "are you a human?" part of a public form. It always carries a hidden trap field that only bots fill in. When the site
 * has Cloudflare Turnstile keys, it also shows the check (usually invisible) and puts its answer in the form. Place it inside
 * the <form>.
 */
export function HumanCheck() {
  const box = useRef<HTMLDivElement>(null);
  const [cfg, setCfg] = useState<{ siteKey: string | null; test: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/human-check", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => live && setCfg(c))
      .catch(() => live && setCfg({ siteKey: null, test: false }));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!cfg?.siteKey || cfg.test || !box.current) return;
    const el = box.current;
    const form = el.closest("form");
    let id: string | undefined;
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !window.turnstile) return;
        id = window.turnstile.render(el, { sitekey: cfg.siteKey, appearance: "interaction-only", theme: "light" });
      })
      .catch(() => {});
    // A check answer works once. Get a fresh one right after each press of the button, ready for a retry.
    const again = () => setTimeout(() => { if (id && window.turnstile) window.turnstile.reset(id); }, 0);
    form?.addEventListener("submit", again);
    return () => {
      gone = true;
      form?.removeEventListener("submit", again);
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [cfg]);

  return (
    <>
      {/* The trap: invisible to people, tempting to bots. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Leave this empty
          <input type="text" name="hp_company_url" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {cfg?.test && <input type="text" name="cf-turnstile-response" data-testid="human-check-test" defaultValue="" aria-hidden="true" tabIndex={-1} style={{ position: "absolute", left: "-10000px" }} />}
      {cfg?.siteKey && !cfg.test && <div ref={box} data-testid="human-check" />}
    </>
  );
}
