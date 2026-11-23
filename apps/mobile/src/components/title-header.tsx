import { Image } from "expo-image";
import { Stack } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { type ReactNode, use } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { Text } from "@/components/text";
import { sizedImageUri } from "@/lib/images";
import { useReduceMotion } from "@/lib/reduce-motion";
import { STACK_SCREEN_OPTIONS } from "@/theme/stack-options";
import { fractionToken, tokenColorAlpha } from "@/theme/token-vars";

/**
 * How far below the header the web's `backdrop-scrim` keeps lifting (8rem),
 * and its shade across the bar (75% of the background), so the back button
 * and title keep their contrast over any artwork (components/AGENTS.md, the
 * navbar's scrim; prompts/mobile-look-title-pages.md, decision 4).
 */
const SCRIM_FADE = 128;
const SCRIM_ALPHA = 0.75;
/** The scroll distance over which the header turns solid. */
const FADE_DISTANCE = 48;
/** How much of the poster hangs over the backdrop's lower edge. */
export const POSTER_OVERLAP = 64;

/** The backdrop's height: the 16:9 artwork plus the header it runs under. */
export function backdropHeight(width: number, headerHeight: number): number {
  return Math.round((width * 9) / 16 + headerHeight);
}

type Props = {
  title: string;
  backdropUrl: string | null;
  children: ReactNode;
};

/**
 * A title screen's scroll view and its header (feature 29, slice 2,
 * decision 4): with a backdrop, the artwork runs full bleed under a clear
 * native header, which turns solid with the title as the artwork scrolls
 * under it, and stretches when pulled down. The backdrop moves 1:1 with the
 * content (the owner ruled out parallax), and under Reduce Motion it does
 * not stretch and the header switches at once. Without a backdrop the
 * screen keeps the stack's solid header and its title.
 *
 * The scroll handler and both styles run on the UI thread, so scrolling
 * renders no React frame.
 */
export function TitleScroll({ title, backdropUrl, children }: Props) {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  // The context, not `useHeaderHeight`, which throws outside a stack header
  // (a screen rendered on its own, as the screen tests do): no header means
  // nothing for the artwork to run under.
  const headerHeight = use(HeaderHeightContext) ?? 0;
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const height = backdropHeight(width, headerHeight);
  const solidAt = height - headerHeight;

  if (!backdropUrl) {
    return (
      <Animated.ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
      >
        <Stack.Screen options={{ title, headerTransparent: false }} />
        {children}
      </Animated.ScrollView>
    );
  }

  return (
    <Animated.ScrollView
      style={styles.fill}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="never"
      scrollEventThrottle={16}
      onScroll={onScroll}
    >
      <Stack.Screen
        options={{
          title,
          headerTransparent: true,
          headerBackground: () => (
            <HeaderFade
              scrollY={scrollY}
              solidAt={solidAt}
              reduceMotion={reduceMotion}
            />
          ),
          headerTitle: () => (
            <HeaderTitle
              title={title}
              scrollY={scrollY}
              solidAt={solidAt}
              reduceMotion={reduceMotion}
            />
          ),
        }}
      />
      <Backdrop
        uri={sizedImageUri(backdropUrl, width)}
        height={height}
        headerHeight={headerHeight}
        scrollY={scrollY}
        stretch={!reduceMotion}
      />
      {children}
    </Animated.ScrollView>
  );
}

type FadeProps = {
  scrollY: SharedValue<number>;
  solidAt: number;
  reduceMotion: boolean;
};

/** 0 while the artwork fills the bar, 1 once it has scrolled under it. */
function solidness(y: number, solidAt: number, reduceMotion: boolean) {
  "worklet";
  if (reduceMotion) return y >= solidAt ? 1 : 0;
  return interpolate(
    y,
    [solidAt - FADE_DISTANCE, solidAt],
    [0, 1],
    Extrapolation.CLAMP,
  );
}

/** The header's own colour, faded in over the artwork. */
function HeaderFade({ scrollY, solidAt, reduceMotion }: FadeProps) {
  const style = useAnimatedStyle(() => ({
    opacity: solidness(scrollY.value, solidAt, reduceMotion),
  }));
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: STACK_SCREEN_OPTIONS.headerStyle.backgroundColor },
        style,
      ]}
    />
  );
}

/**
 * The title, shown with the solid header only: over the artwork the hero
 * already carries it. Inter through the app's `Text`, faded by its parent.
 */
function HeaderTitle({
  title,
  scrollY,
  solidAt,
  reduceMotion,
}: FadeProps & { title: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: solidness(scrollY.value, solidAt, reduceMotion),
  }));
  return (
    <Animated.View style={style}>
      <Text
        numberOfLines={1}
        accessibilityRole="header"
        className="text-[17px] font-semibold text-foreground"
      >
        {title}
      </Text>
    </Animated.View>
  );
}

/**
 * The full bleed artwork with the web's scrim at its top. Pulled down past
 * the top (iOS bounce), it grows from its bottom edge so its top stays at the
 * screen's top; it never moves at another speed than the content.
 */
function Backdrop({
  uri,
  height,
  headerHeight,
  scrollY,
  stretch,
}: {
  uri: string;
  height: number;
  headerHeight: number;
  scrollY: SharedValue<number>;
  stretch: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const pull = Math.min(scrollY.value, 0);
    if (!stretch || pull === 0) return { transform: [] };
    return {
      transform: [{ translateY: pull / 2 }, { scale: 1 - pull / height }],
    };
  });
  const shade = tokenColorAlpha("color-background", SCRIM_ALPHA);
  return (
    <Animated.View
      testID="title-backdrop"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ height }, style]}
    >
      <Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundImage: `linear-gradient(to bottom, ${shade} 0px, ${shade} ${headerHeight}px, ${tokenColorAlpha("color-background", 0)} ${headerHeight + SCRIM_FADE}px)`,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundImage: `linear-gradient(to bottom, ${tokenColorAlpha("color-background", 0)} 60%, ${tokenColorAlpha("color-background", fractionToken("page-wash-alpha"))} 100%)`,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: 96 },
});
