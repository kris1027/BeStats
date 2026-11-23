import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { fractionToken, tokenColor } from "@/theme/token-vars";

import { gradientLine } from "./glass/rim";

const GRAIN = require("../../assets/images/grain.png");

/**
 * The web's three blobs (`components/layout/page-background.tsx`) at their
 * still positions, in viewport fractions: left or right edge, top, size.
 */
const BLOBS = [
  {
    id: "red",
    color: "color-page-blob-red",
    alpha: "page-blob-red-alpha",
    left: -0.15,
    top: -0.2,
    size: 0.7,
  },
  {
    id: "amber",
    color: "color-page-blob-amber",
    alpha: "page-blob-amber-alpha",
    right: -0.2,
    top: 0.2,
    size: 0.65,
  },
  {
    id: "deep",
    color: "color-page-blob-deep",
    alpha: "page-blob-deep-alpha",
    left: 0.1,
    top: 0.6,
    size: 0.8,
  },
] as const;

/** The pinstripe's period and width, as the web's `page-stripes`. */
const STRIPE_PERIOD = 14;
const STRIPE_WIDTH = 2;

/**
 * The page background behind every screen: the web's warm gradient, three
 * soft blobs, the pinstripe, the wash, the vignette and the grain, in the
 * web's paint order and from its tokens (prompts/warm-page-background.md).
 * It is still: the web moves its layers with time and scroll, the app never
 * does (prompts/mobile-web-parity-foundation.md, decision 2). It is drawn
 * once per screen at the window's size, takes no touches and is hidden from
 * screen readers.
 */
export function PageBackground() {
  const { width, height } = useWindowDimensions();
  const vignetteRadius = width * 1.2;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="page-gradient" {...gradientLine(165)}>
            <Stop offset={0} stopColor={tokenColor("color-page-top")} />
            <Stop offset={0.45} stopColor={tokenColor("color-page-mid")} />
            <Stop offset={1} stopColor={tokenColor("color-page-deep")} />
          </LinearGradient>
          {BLOBS.map((blob) => (
            <RadialGradient key={blob.id} id={`page-blob-${blob.id}`}>
              <Stop
                offset={0}
                stopColor={tokenColor(blob.color)}
                stopOpacity={fractionToken(blob.alpha)}
              />
              <Stop
                offset={0.65}
                stopColor={tokenColor(blob.color)}
                stopOpacity={0}
              />
            </RadialGradient>
          ))}
          <Pattern
            id="page-stripes"
            width={STRIPE_PERIOD}
            height={STRIPE_PERIOD}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Rect
              width={STRIPE_WIDTH}
              height={STRIPE_PERIOD}
              fill={tokenColor("color-page-stripe")}
              fillOpacity={fractionToken("page-stripe-alpha")}
            />
          </Pattern>
          <RadialGradient
            id="page-vignette"
            gradientUnits="userSpaceOnUse"
            cx={width / 2}
            cy={height * 0.4}
            r={vignetteRadius}
            gradientTransform={`translate(0 ${height * 0.4}) scale(1 ${
              (height * 0.9) / vignetteRadius
            }) translate(0 ${-height * 0.4})`}
          >
            <Stop
              offset={0.45}
              stopColor={tokenColor("color-page-shade")}
              stopOpacity={0}
            />
            <Stop
              offset={1}
              stopColor={tokenColor("color-page-shade")}
              stopOpacity={fractionToken("page-shade-alpha")}
            />
          </RadialGradient>
        </Defs>
        <Rect
          y={-height * 0.1}
          width={width}
          height={height * 1.4}
          fill="url(#page-gradient)"
        />
        {BLOBS.map((blob) => {
          const size = width * blob.size;
          const left =
            "left" in blob
              ? width * blob.left
              : width * (1 - blob.right) - size;
          return (
            <Circle
              key={blob.id}
              cx={left + size / 2}
              cy={height * blob.top + size / 2}
              r={size / 2}
              fill={`url(#page-blob-${blob.id})`}
            />
          );
        })}
        <Rect width={width} height={height} fill="url(#page-stripes)" />
        <Rect
          width={width}
          height={height}
          fill={tokenColor("color-page-wash")}
          fillOpacity={fractionToken("page-wash-alpha")}
        />
        <Rect width={width} height={height} fill="url(#page-vignette)" />
      </Svg>
      {/* React Native's own Image, since only it tiles (`resizeMode="repeat"`). */}
      <Image
        source={GRAIN}
        resizeMode="repeat"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: fractionToken("page-grain-alpha"),
            mixBlendMode: "overlay",
          },
        ]}
      />
    </View>
  );
}
