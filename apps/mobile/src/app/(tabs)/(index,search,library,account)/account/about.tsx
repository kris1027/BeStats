import { AboutScreen } from "@/screens/about-screen";

/**
 * `/account/about`, pushed on the Account tab's stack from its About row; a
 * route file only, its body in `screens/` (apps/mobile/AGENTS.md, Files).
 */
export default function AboutRoute() {
  return <AboutScreen />;
}
