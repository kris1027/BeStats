import { MAX_QUERY_LENGTH } from "@bestats/core/search/constants";
import { Pressable, View } from "react-native";

import { SearchIcon, XIcon } from "@/components/icons";
import { TextInput } from "@/components/text";
import { PILL_FONT_SCALE_CAP } from "@/theme/pill";
import { tokenColor } from "@/theme/token-vars";

import { LiquidBar } from "./glass/liquid-bar";

/** The field's height, a little under the switch's above it. */
const FIELD_HEIGHT = 48;

/**
 * Search's title field, pinned under the media switch
 * (prompts/mobile-media-switch-glass.md, Search follow up): the native
 * header search bar can only sit above screen content, and the switch goes
 * first, so the field is the app's own in the same glass as the switch. It
 * caps the text at `MAX_QUERY_LENGTH` the web's field keeps (AGENTS.md
 * section 11, validate input), in `onChangeText` too, since a paste can
 * outrun the native limit. The clear button is 44pt for the touch rule.
 */
export function SearchField({
  value,
  placeholder,
  onChangeText,
}: {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
}) {
  const muted = tokenColor("color-muted-foreground");
  return (
    <LiquidBar
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: FIELD_HEIGHT,
        paddingLeft: 16,
        paddingRight: 2,
        gap: 8,
      }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no">
        <SearchIcon size={20} color={muted} />
      </View>
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={muted}
        value={value}
        onChangeText={(text) => onChangeText(text.slice(0, MAX_QUERY_LENGTH))}
        maxLength={MAX_QUERY_LENGTH}
        maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        className="min-h-11 flex-1 text-base text-foreground"
      />
      {value === "" ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          className="size-11 items-center justify-center"
        >
          <XIcon size={18} color={muted} />
        </Pressable>
      )}
    </LiquidBar>
  );
}
