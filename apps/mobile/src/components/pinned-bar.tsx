import { type ReactNode, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { HEADER_BACKGROUND } from "@/theme/stack-options";

/** How far the fade runs past the bar's lower edge, in points. */
const FADE_TAIL = 16;

/**
 * The room a screen's scroll view keeps under a bar pinned over its top
 * (prompts/mobile-media-switch-glass.md, decisions 5 and 10). `barTop` is
 * where the bar sits: the status bar's height, or the header's on Search.
 * The bar's measured height pads the top of the content, so every state the
 * list draws starts below the bar, and offsets the pull to refresh spinner
 * to below it. On iOS the automatic inset already covers `barTop`; Android
 * has none, so its padding and offset take it too. Padding rather than an
 * extra `contentInset`, whose late arrival left the list's first position
 * under the bar.
 */
export function usePinnedBar(barTop: number) {
  const [height, setHeight] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.height);
    setHeight((current) => (current === next ? current : next));
  }

  const room = Platform.OS === "ios" ? height : barTop + height;
  return {
    barTop,
    onLayout,
    /** The content's top padding, so the first row starts below the bar. */
    paddingTop: room,
    /** The pull spinner's offset, so it shows below the bar. */
    refreshOffset: room,
  };
}

/**
 * The bar pinned over the top of a tab root's content, with a fade in the
 * header colour behind it and the status bar, so content scrolling under
 * them never clashes with either (prompts/mobile-media-switch-glass.md,
 * decision 6). It takes touches only on the bar itself.
 */
export function PinnedBar({
  barTop,
  onLayout,
  children,
}: {
  barTop: number;
  onLayout: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const [height, setHeight] = useState(0);
  const fade = barTop + height + FADE_TAIL;
  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { bottom: undefined }]}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: fade,
        }}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="pinned-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0"
                stopColor={HEADER_BACKGROUND}
                stopOpacity={0.9}
              />
              <Stop
                offset="0.6"
                stopColor={HEADER_BACKGROUND}
                stopOpacity={0.6}
              />
              <Stop offset="1" stopColor={HEADER_BACKGROUND} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#pinned-fade)" />
        </Svg>
      </View>
      <View
        pointerEvents="box-none"
        className="px-4 py-2"
        style={{ marginTop: barTop }}
        onLayout={(event) => {
          setHeight(event.nativeEvent.layout.height);
          onLayout(event);
        }}
      >
        {children}
      </View>
    </View>
  );
}
