import type { ComponentProps, Ref } from "react";
import { Text as NativeText, TextInput as NativeTextInput } from "react-native";

/**
 * The family every Text draws in: Inter, the web's typeface, embedded in the
 * native build by the expo-font plugin in `app.json`, so it shows from the
 * first frame with no runtime load (apps/mobile/AGENTS.md, Styling). iOS and Android pick each weight from `fontWeight`, which the
 * `font-*` classes set.
 */
export const FONT_FAMILY = "Inter";

/**
 * React Native's Text in Inter. React Native text inherits no font, so every
 * screen imports this one instead (apps/mobile/AGENTS.md, Styling, checked
 * by `ui-boundary.test.ts`). It keeps the system text size scaling (Dynamic
 * Type, Android's font scale); a fixed height control caps it with
 * `maxFontSizeMultiplier` so its label never clips.
 */
export function Text({ style, ...props }: ComponentProps<typeof NativeText>) {
  return <NativeText {...props} style={[{ fontFamily: FONT_FAMILY }, style]} />;
}

/** React Native's TextInput in Inter, for the same reason as `Text`. */
export function TextInput({
  style,
  ref,
  ...props
}: ComponentProps<typeof NativeTextInput> & {
  ref?: Ref<NativeTextInput>;
}) {
  return (
    <NativeTextInput
      {...props}
      ref={ref}
      style={[{ fontFamily: FONT_FAMILY }, style]}
    />
  );
}
