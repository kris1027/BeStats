import type { AuthActionState } from "@bestats/core/auth/action-state";
import { type ComponentProps, useState } from "react";
import { Pressable, View } from "react-native";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { Text, TextInput } from "@/components/text";
import { lengthToken, tokenColor } from "@/theme/token-vars";
import { GlassPlate } from "./glass/plate";
import { Notice } from "./notice";

/**
 * The flat 44pt field the filters sheet's platform search still uses. Every
 * form field goes through `FormField` below instead.
 */
export const INPUT_CLASS =
  "min-h-11 rounded-2xl border-[1.5px] border-input bg-glass-plate px-4 text-base text-foreground";

type FieldProps = Omit<
  ComponentProps<typeof TextInput>,
  "className" | "accessibilityLabel" | "accessibilityHint" | "secureTextEntry"
> & {
  label: string;
  /** A standing rule under the field, read with it, as the web's hint. */
  hint?: string;
  /** What is wrong with this field, shown under it and read with it. */
  error?: string | null;
  /** A password: hidden while typed, with the Show password eye. */
  secure?: boolean;
};

/**
 * One labelled field, the web's `AuthField` on the phone
 * (prompts/mobile-look-account.md, decision 4): 56pt tall on the control
 * plate with the gradient rim (the web's `h-14 glass glass-rim rounded-2xl`),
 * the label above, the hint and then the error under it. Every form uses it,
 * so sign in, sign up, Change password and Account never drift (AGENTS.md
 * section 3).
 *
 * A screen reader hears the label as the field's name and the error and hint
 * as its hint, and the error is also an alert, so a refusal is never shown by
 * colour alone (AGENTS.md section 11). A password field gets a 44pt eye that
 * says what it will do, Show or Hide password; it only swaps
 * `secureTextEntry` and never copies the value anywhere else.
 */
export function FormField({
  label,
  hint,
  error,
  secure = false,
  editable = true,
  ...input
}: FieldProps) {
  const [revealed, setRevealed] = useState(false);
  // Each part ends as a sentence, so a screen reader pauses between them.
  const spoken = [error, hint]
    .filter((part): part is string => Boolean(part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(" ");
  const Eye = revealed ? EyeOffIcon : EyeIcon;

  return (
    <View className="gap-2">
      <Text className="text-[15px] font-semibold text-text-label">{label}</Text>
      <GlassPlate
        plate="control"
        radius={lengthToken("radius-2xl")}
        className={`min-h-14 flex-row items-center ${editable ? "" : "opacity-50"}`}
      >
        <TextInput
          placeholderTextColor={tokenColor("color-muted-foreground")}
          {...input}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={spoken || undefined}
          secureTextEntry={secure && !revealed}
          className={`min-h-14 flex-1 py-3 pl-4 text-base ${
            error ? "text-destructive" : "text-foreground"
          } ${secure ? "pr-1" : "pr-4"}`}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            accessibilityState={{ selected: revealed }}
            onPress={() => setRevealed((shown) => !shown)}
            className="mr-1 size-11 items-center justify-center rounded-full"
          >
            <Eye size={20} color={tokenColor("color-text-secondary")} />
          </Pressable>
        ) : null}
      </GlassPlate>
      {hint ? (
        <Text className="text-sm text-muted-foreground">{hint}</Text>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The form level message to show above a form's button, or `null`: the
 * state's message, unless a field already says those exact words under
 * itself (a taken username, a wrong current password), so a phone screen
 * never repeats one refusal twice. Zod's summary ("Check the highlighted
 * fields") differs from every field's words, so it still shows, as on the web.
 */
export function formAlert(state: AuthActionState): string | null {
  if (state.status !== "error" || !state.message) return null;
  const fieldWords = Object.values(state.fieldErrors ?? {});
  return fieldWords.includes(state.message) ? null : state.message;
}

/** `formAlert`'s message as the form's error `Notice`, or nothing. */
export function FormAlert({ state }: { state: AuthActionState }) {
  const message = formAlert(state);
  return message ? <Notice tone="error" message={message} /> : null;
}
