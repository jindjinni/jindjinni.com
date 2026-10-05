"use client";

import { usePathname } from "next/navigation";
import { departmentOfPath, themeStyle, type DepartmentThemes } from "@/lib/theme";

/** Wraps the signed-in screens so each department shows in its own color as you move between them. */
export function ThemeScope({ themes, children }: { themes: DepartmentThemes; children: React.ReactNode }) {
  const dept = departmentOfPath(usePathname());
  return (
    <div style={themeStyle(themes[dept], dept)} className="themed-page flex min-h-full flex-1 flex-col">
      {children}
    </div>
  );
}
