// Theme colors. Every screen is written with Tailwind's "emerald" shades, so a theme
// swaps what those shades mean (a department set to Blue shows blue wherever the app
// used to show green). Each department has its own color.

import type { CSSProperties } from "react";

type Ramp = Record<string, string>;

const GREEN: Ramp = {
  "50": "oklch(97.9% 0.021 166.113)",
  "100": "oklch(95% 0.052 163.051)",
  "200": "oklch(90.5% 0.093 164.15)",
  "300": "oklch(84.5% 0.143 164.978)",
  "400": "oklch(76.5% 0.177 163.223)",
  "500": "oklch(69.6% 0.17 162.48)",
  "600": "oklch(59.6% 0.145 163.225)",
  "700": "oklch(50.8% 0.118 165.612)",
  "800": "oklch(43.2% 0.095 166.913)",
  "900": "oklch(37.8% 0.077 168.94)",
  "950": "oklch(26.2% 0.051 172.552)",
};

const PURPLE: Ramp = {
  "50": "oklch(96.9% 0.016 293.756)",
  "100": "oklch(94.3% 0.029 294.588)",
  "200": "oklch(89.4% 0.057 293.283)",
  "300": "oklch(81.1% 0.111 293.571)",
  "400": "oklch(70.2% 0.183 293.541)",
  "500": "oklch(60.6% 0.25 292.717)",
  "600": "oklch(54.1% 0.281 293.009)",
  "700": "oklch(49.1% 0.27 292.581)",
  "800": "oklch(43.2% 0.232 292.759)",
  "900": "oklch(38% 0.189 293.745)",
  "950": "oklch(28.3% 0.141 291.089)",
};

const BLUE: Ramp = {
  "50": "oklch(97% 0.014 254.604)",
  "100": "oklch(93.2% 0.032 255.585)",
  "200": "oklch(88.2% 0.059 254.128)",
  "300": "oklch(80.9% 0.105 251.813)",
  "400": "oklch(70.7% 0.165 254.624)",
  "500": "oklch(62.3% 0.214 259.815)",
  "600": "oklch(54.6% 0.245 262.881)",
  "700": "oklch(48.8% 0.243 264.376)",
  "800": "oklch(42.4% 0.199 265.638)",
  "900": "oklch(37.9% 0.146 265.522)",
  "950": "oklch(28.2% 0.091 267.935)",
};

const PINK: Ramp = {
  "50": "oklch(97.1% 0.014 343.198)",
  "100": "oklch(94.8% 0.028 342.258)",
  "200": "oklch(89.9% 0.061 343.231)",
  "300": "oklch(82.3% 0.12 346.018)",
  "400": "oklch(71.8% 0.202 349.761)",
  "500": "oklch(65.6% 0.241 354.308)",
  "600": "oklch(59.2% 0.249 0.584)",
  "700": "oklch(52.5% 0.223 3.958)",
  "800": "oklch(45.9% 0.187 3.815)",
  "900": "oklch(40.8% 0.153 2.432)",
  "950": "oklch(28.4% 0.109 3.907)",
};

const TEAL: Ramp = {
  "50": "oklch(98.4% 0.014 180.72)",
  "100": "oklch(95.3% 0.051 180.801)",
  "200": "oklch(91% 0.096 180.426)",
  "300": "oklch(85.5% 0.138 181.071)",
  "400": "oklch(77.7% 0.152 181.912)",
  "500": "oklch(70.4% 0.14 182.503)",
  "600": "oklch(60% 0.118 184.704)",
  "700": "oklch(51.1% 0.096 186.391)",
  "800": "oklch(43.7% 0.078 188.216)",
  "900": "oklch(38.6% 0.063 188.416)",
  "950": "oklch(27.7% 0.046 192.524)",
};

const ORANGE: Ramp = {
  "50": "oklch(98% 0.016 73.684)",
  "100": "oklch(95.4% 0.038 75.164)",
  "200": "oklch(90.1% 0.076 70.697)",
  "300": "oklch(83.7% 0.128 66.29)",
  "400": "oklch(75% 0.183 55.934)",
  "500": "oklch(70.5% 0.213 47.604)",
  "600": "oklch(64.6% 0.222 41.116)",
  "700": "oklch(55.3% 0.195 38.402)",
  "800": "oklch(47% 0.157 37.304)",
  "900": "oklch(40.8% 0.123 38.172)",
  "950": "oklch(26.6% 0.079 36.259)",
};

const AMBER: Ramp = {
  "50": "oklch(98.7% 0.022 95.277)",
  "100": "oklch(96.2% 0.059 95.617)",
  "200": "oklch(92.4% 0.12 95.746)",
  "300": "oklch(87.9% 0.169 91.605)",
  "400": "oklch(82.8% 0.189 84.429)",
  "500": "oklch(76.9% 0.188 70.08)",
  "600": "oklch(66.6% 0.179 58.318)",
  "700": "oklch(55.5% 0.163 48.998)",
  "800": "oklch(47.3% 0.137 46.201)",
  "900": "oklch(41.4% 0.112 45.904)",
  "950": "oklch(27.9% 0.077 45.635)",
};

// Yellow is light by nature, so white button text would be hard to read. Buttons and
// links use shades 600-800, so those are moved one step darker for this theme only.
const YELLOW: Ramp = {
  ...AMBER,
  "500": AMBER["600"],
  "600": AMBER["700"],
  "700": AMBER["800"],
  "800": AMBER["900"],
};

export const THEME_KEYS = ["green", "blue", "yellow", "purple", "pink", "teal", "orange"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export const THEMES: Record<ThemeKey, { label: string; ramp: Ramp; swatch: string; tint: string; accent: string }> = {
  green: { label: "Green", ramp: GREEN, swatch: "#059669", tint: "#d1fae5", accent: "#34d399" },
  blue: { label: "Blue", ramp: BLUE, swatch: "#2563eb", tint: "#dbeafe", accent: "#60a5fa" },
  yellow: { label: "Yellow", ramp: YELLOW, swatch: "#d97706", tint: "#fef3c7", accent: "#F7B838" },
  purple: { label: "Purple", ramp: PURPLE, swatch: "#7c3aed", tint: "#ede9fe", accent: "#a78bfa" },
  pink: { label: "Pink", ramp: PINK, swatch: "#db2777", tint: "#fce7f3", accent: "#f472b6" },
  teal: { label: "Teal", ramp: TEAL, swatch: "#0d9488", tint: "#ccfbf1", accent: "#2dd4bf" },
  orange: { label: "Orange", ramp: ORANGE, swatch: "#ea580c", tint: "#ffedd5", accent: "#fb923c" },
};

/** Every department has its own color. "general" covers Settings, Database and the home screen. */
export const DEPARTMENTS = [
  { key: "purchasing", label: "Purchasing", blurb: "Quotations, customers and the product catalog.", fallback: "green" },
  { key: "receiving", label: "Receiving", blurb: "Shipments, received items and order adjustments.", fallback: "yellow" },
  { key: "accounts", label: "Accounts", blurb: "Orders waiting to be paid and the Paid Orders database.", fallback: "blue" },
  { key: "customer-service", label: "Customer Service", blurb: "Payment emails to customers and the Emailed database.", fallback: "purple" },
  { key: "inventory", label: "Inventory", blurb: "Live stock by brand, condition and expiration.", fallback: "teal" },
  { key: "general", label: "Everything else", blurb: "Settings, Database and the home screen.", fallback: "green" },
] as const;
export type DepartmentKey = (typeof DEPARTMENTS)[number]["key"];
export type DepartmentThemes = Record<DepartmentKey, ThemeKey>;

export function isThemeKey(v: unknown): v is ThemeKey {
  return typeof v === "string" && (THEME_KEYS as readonly string[]).includes(v);
}

/** Reads the saved choices (JSON text); anything missing or unknown falls back to that department's default color. */
export function parseDepartmentThemes(raw: string | null | undefined): DepartmentThemes {
  let saved: Record<string, unknown> = {};
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") saved = v as Record<string, unknown>;
  } catch {
    saved = {};
  }
  const out = {} as DepartmentThemes;
  for (const d of DEPARTMENTS) out[d.key] = isThemeKey(saved[d.key]) ? (saved[d.key] as ThemeKey) : d.fallback;
  return out;
}

/** Which department a page belongs to. */
export function departmentOfPath(pathname: string): DepartmentKey {
  if (pathname === "/dashboard/purchasing" || pathname.startsWith("/dashboard/purchasing/")) return "purchasing";
  if (pathname === "/dashboard/receiving" || pathname.startsWith("/dashboard/receiving/")) return "receiving";
  if (pathname === "/dashboard/accounts" || pathname.startsWith("/dashboard/accounts/")) return "accounts";
  if (pathname === "/dashboard/customer-service" || pathname.startsWith("/dashboard/customer-service/")) return "customer-service";
  if (pathname === "/dashboard/inventory" || pathname.startsWith("/dashboard/inventory/")) return "inventory";
  return "general";
}

/**
 * Inline CSS variables for one department. Screens are written with Tailwind's "emerald" shades, so
 * pointing those at the chosen color recolors them. Receiving was designed in gold ("amber"), so its
 * amber shades follow the choice too -- unless the choice is yellow, which is what amber already is.
 */
export function themeStyle(key: ThemeKey, dept: DepartmentKey = "general"): CSSProperties {
  const style: Record<string, string> = {};
  const ramp = THEMES[key].ramp;
  if (key !== "green") for (const [shade, value] of Object.entries(ramp)) style[`--color-emerald-${shade}`] = value;
  // Receiving and Purchasing both have a colored sidebar, painted with the department's accent color.
  if (dept === "purchasing") style["--dept-accent"] = THEMES[key].accent;
  // Accounts and Customer Service reuse Receiving's photo and form pieces (written in gold), so their amber shades follow their color too.
  if (dept === "receiving" || dept === "accounts" || dept === "customer-service" || dept === "inventory") {
    style["--dept-accent"] = THEMES[key].accent;
    if (key !== "yellow") for (const [shade, value] of Object.entries(ramp)) style[`--color-amber-${shade}`] = value;
  }
  return style as CSSProperties;
}
