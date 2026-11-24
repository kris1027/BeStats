import type { ReactNode } from "react";
import { lengthToken } from "@/theme/token-vars";

import { GlassPlate } from "./glass/plate";

/**
 * The card every Account, About and Delete account section sits on, the
 * web's `PANEL` (`glass glass-rim glass-plate-panel glass-shadow
 * rounded-panel`): the panel plate with its sheen, rim and shadow
 * (prompts/mobile-look-account.md, decision 8). One component, so those
 * screens keep one look (AGENTS.md section 3: reuse, never redesign).
 */
export function GlassPanel({
  children,
  className = "gap-4 px-5 py-6",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassPlate
      plate="panel"
      radius={lengthToken("radius-panel")}
      shadow
      className={className}
    >
      {children}
    </GlassPlate>
  );
}
