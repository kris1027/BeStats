import { LibraryScreen } from "@/screens/library-screen";

/**
 * `/library`: the Library tab's root, every library page from core's
 * `libraryPages`, picked by its `type` and `path` params
 * (prompts/mobile-library-tabs.md, decision 2).
 */
export default function LibraryTab() {
  return <LibraryScreen />;
}
