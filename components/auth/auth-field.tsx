"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import type * as React from "react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * One labelled field with its error, for the auth forms (spec 0005, AC-21).
 *
 * The label is a real `<label>` bound by id, and the error is bound by
 * `aria-describedby` with `aria-invalid` on the input, so a screen reader
 * announces which field is wrong and why. Colour alone never carries that,
 * which is the failure mode a red border on its own would have.
 *
 * A client component only because of the reveal toggle below. The field is
 * otherwise plain markup.
 */
function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  placeholder,
  required = true,
  error,
  defaultValue,
  hint,
  disabled,
  maxLength,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  defaultValue?: string;
  /** A standing rule shown under the field, bound like the error. */
  hint?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;
  const [revealed, setRevealed] = useState(false);

  const isPassword = type === "password";

  // Everything but a password is controlled here. React 19 resets a form's
  // uncontrolled inputs once its action returns, and Base UI warns when an
  // uncontrolled default changes after mount, so holding the value is what
  // keeps a typed address on screen after a refusal. A new default handed back
  // by the action (`AuthActionState.values`) replaces it. A password stays
  // uncontrolled, so the reset still clears it.
  const [value, setValue] = useState(defaultValue ?? "");
  const [seenDefault, setSeenDefault] = useState(defaultValue);
  if (defaultValue !== seenDefault) {
    setSeenDefault(defaultValue);
    setValue(defaultValue ?? "");
  }
  const valueProps = isPassword
    ? {}
    : {
        value,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          setValue(event.target.value),
      };
  // The reveal swaps the input's type. It never renders the value anywhere
  // else, so nothing is copied into the DOM that was not already there.
  const resolvedType = isPassword && revealed ? "text" : type;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[15px] leading-none font-semibold text-text-label"
      >
        {label}
      </label>

      <div className="relative">
        <Input
          id={id}
          name={name}
          type={resolvedType}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          // A username or address is never a sentence: no capital first
          // letter and no spell check underline on a phone keyboard.
          autoCapitalize={isPassword ? undefined : "none"}
          spellCheck={isPassword ? undefined : false}
          {...valueProps}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={isPassword ? "pr-14" : undefined}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            /*
             * 44px square so it meets the touch target size in
             * components/AGENTS.md, and inset far enough that its hit area does
             * not overlap the text the field is showing.
             */
            className="absolute inset-y-0 right-1 flex size-11 cursor-pointer items-center justify-center self-center rounded-full text-text-secondary hover:text-foreground"
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
          >
            {revealed ? (
              <EyeOffIcon className="size-5" aria-hidden="true" />
            ) : (
              <EyeIcon className="size-5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { AuthField };
