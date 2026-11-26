import { Image } from "expo-image";
import { Stack, useIsPreview } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { type ComponentProps, createContext, type ReactNode, use } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { PageBackground } from "@/components/page-background";
import { Text } from "@/components/text";
import { artworkHeight, sizedImageUri } from "@/lib/images";
import { useReduceMotion } from "@/lib/reduce-motion";
import { useReduceTransparency } from "@/lib/reduce-transparency";
import {
  BACKDROP_HEADER_OPTIONS,
  HEADER_BACKGROUND,
} from "@/theme/stack-options";
import { fractionToken, tokenColorAlpha } from "@/theme/token-vars";

/** The scroll distance over which the header turns solid. */
const FADE_DISTANCE = 48;
/** How much of the poster hangs over the backdrop's lower edge. */
export const POSTER_OVERLAP = 64;

/**
 * The backdrop's height: the 16:9 artwork plus the header it runs under.
 * Shared with `TitleSkeleton`, so the hero does not jump when the detail
 * arrives (AGENTS.md section 3, loading states).
 */
export function backdropHeight(width: number, headerHeight: number): number {
  return Math.round(artworkHeight(width) + headerHeight);
}

/**
 * Whether the hero sits under a backdrop, so its poster hangs over the
 * artwork's lower edge. `TitleScroll` provides it, since it alone knows
 * whether it drew one, so no screen passes the same fact twice
 * (feature 29, slice 2, decision 5).
 */
export const OverBackdrop = createContext(false);

type Props = {
  title: string;
  backdropUrl: string | null;
  children: ReactNode;
};

/**
 * The stack header's options, left out inside a long press preview of the
 * title (prompts/mobile-look-card-actions.md): a preview has no header of
 * its own, and Expo Router warns when a previewed screen sets one.
 */
function HeaderOptions(props: ComponentProps<typeof Stack.Screen>) {
  return useIsPreview() ? null : <Stack.Screen {...props} />;
}

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
 * renders no React frame. Reduce Motion and Reduce Transparency both keep
 * the header usable without the effect (AGENTS.md section 3, accessibility).
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
  const reduceTransparency = useReduceTransparency();
  const height = backdropHeight(width, headerHeight);
  const solidAt = height - headerHeight;

  if (backdropUrl && reduceTransparency) {
    // Reduce Transparency keeps the solid header: the artwork starts under
    // it, nothing shows through the bar, and nothing stretches (decision 4,
    // requirement 6).
    return (
      <Animated.ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
      >
        <HeaderOptions options={{ title, headerTransparent: false }} />
        <Backdrop
          uri={sizedImageUri(backdropUrl, width)}
          height={backdropHeight(width, 0)}
          scrollY={scrollY}
          stretch={false}
        />
        <OverBackdrop value>{children}</OverBackdrop>
      </Animated.ScrollView>
    );
  }

  if (!backdropUrl) {
    return (
      <Animated.ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
      >
        <HeaderOptions options={{ title, headerTransparent: false }} />
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
      <HeaderOptions
        options={{
          title,
          // `HeaderFade` alone draws the solid colour, on scroll.
          ...BACKDROP_HEADER_OPTIONS,
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
        scrollY={scrollY}
        stretch={!reduceMotion}
      />
      <OverBackdrop value>{children}</OverBackdrop>
    </Animated.ScrollView>
  );
}

/**
 * A title screen before its scroll view: loading, not found or a failed
 * read. It draws the page background itself, so these states stay backed once
 * the title routes lose the stack layout's one
 * (prompts/mobile-backdrop-clear-top.md; AGENTS.md section 3, every state).
 */
export function TitleState({ children }: { children: ReactNode }) {
  return (
    <View style={styles.fill}>
      <PageBackground />
      {children}
    </View>
  );
}

type FadeProps = {
  scrollY: SharedValue<number>;
  solidAt: number;
  reduceMotion: boolean;
};

/**
 * 0 while the artwork fills the bar, 1 once it has scrolled under it. Under
 * Reduce Motion it switches at once instead of fading (decision 4,
 * requirement 6; AGENTS.md section 3, accessibility).
 */
export function solidness(
  y: number,
  solidAt: number,
  reduceMotion: boolean,
): number {
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
        { backgroundColor: HEADER_BACKGROUND },
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
 * The backdrop's transform for a scroll offset: pulled past the top, it
 * grows from its bottom edge; otherwise, and always under Reduce Motion, it
 * stays put (decision 4, requirement 6; AGENTS.md section 3, accessibility).
 */
export function stretchTransform(
  y: number,
  height: number,
  stretch: boolean,
): Array<{ translateY: number } | { scale: number }> {
  "worklet";
  const pull = Math.min(y, 0);
  if (!stretch || pull === 0) return [];
  return [{ translateY: pull / 2 }, { scale: 1 - pull / height }];
}

/**
 * The full bleed artwork, washed into the page at its bottom and left clear
 * at its top (prompts/mobile-backdrop-clear-top.md). Pulled down past the top
 * (iOS bounce), it grows from its bottom edge so its top stays at the
 * screen's top; it never moves at another speed than the content.
 */
function Backdrop({
  uri,
  height,
  scrollY,
  stretch,
}: {
  uri: string;
  height: number;
  scrollY: SharedValue<number>;
  stretch: boolean;
}) {
  const style = useAnimatedStyle(() => ({
    transform: stretchTransform(scrollY.value, height, stretch),
  }));
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
