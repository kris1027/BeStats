import { GLASS } from "@bestats/core/tokens.generated";
import { useId, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { LinearGradient, Rect, Stop } from "react-native-svg";

/** The web's rim width: a 1.5px border painted with the rim gradient. */
export const RIM_WIDTH = 1.5;

type Gradient = (typeof GLASS.gradients)[keyof typeof GLASS.gradients];

/**
 * A CSS gradient angle as the two ends of an SVG gradient line in the box's
 * own units: 0deg points up and the angle turns clockwise, as in CSS.
 */
export function gradientLine(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians) / 2;
  const dy = -Math.cos(radians) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/**
 * A generated stop colour (the web's CSS form, alpha after a slash) as
 * an SVG colour and opacity. react-native-svg ignores the `/ alpha` part of
 * that form and would draw every stop solid, so the alpha goes to
 * `stopOpacity` instead.
 */
export function svgStop(color: string): { color: string; opacity: number } {
  const match =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(
      color,
    );
  if (!match) return { color, opacity: 1 };
  const hex = match
    .slice(1, 4)
    .map((channel) => Math.round(Number(channel)).toString(16).padStart(2, "0"))
    .join("");
  const alpha =
    match[4] === undefined
      ? 1
      : Number(match[4]) / (match[5] === "%" ? 100 : 1);
  return { color: `#${hex}`, opacity: alpha };
}

/** A gradient's stops as SVG `Stop`s, each with its own opacity. */
export function gradientStops(gradient: Gradient) {
  return gradient.stops.map((stop) => {
    const { color, opacity } = svgStop(stop.color);
    return (
      <Stop
        key={stop.at}
        offset={stop.at}
        stopColor={color}
        stopOpacity={opacity}
      />
    );
  });
}

/**
 * The rim's corner radius inside its stroke, capped at half the shorter side.
 * SVG caps `rx` and `ry` each against its own side, so a pill's large radius
 * alone would bend the stroke into an ellipse; one capped value for both keeps
 * the web's rounded rectangle.
 */
export function rimRadius(radius: number, width: number, height: number) {
  const inset = RIM_WIDTH / 2;
  return Math.max(
    0,
    Math.min(radius - inset, (width - RIM_WIDTH) / 2, (height - RIM_WIDTH) / 2),
  );
}

/**
 * The glass rim: the web's 1.5px gradient stroke (`glass-rim`, or the
 * personal score's cyan `glass-rim-score`), drawn as an SVG outline over its
 * parent because React Native has no gradient border
 * (prompts/mobile-web-parity-foundation.md, decision 5). It is decorative,
 * takes no touches and is hidden from screen readers.
 */
export function Rim({
  radius,
  tone = "default",
}: {
  radius: number;
  tone?: "default" | "score";
}) {
  const id = useId().replace(/:/g, "");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradient =
    GLASS.gradients[tone === "score" ? "glass-rim-score" : "glass-rim"];
  const inset = RIM_WIDTH / 2;
  const corner = rimRadius(radius, size.width, size.height);

  function measure(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  }

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={measure}
      style={StyleSheet.absoluteFill}
    >
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          <LinearGradient id={id} {...gradientLine(gradient.angle)}>
            {gradientStops(gradient)}
          </LinearGradient>
          <Rect
            x={inset}
            y={inset}
            width={Math.max(0, size.width - RIM_WIDTH)}
            height={Math.max(0, size.height - RIM_WIDTH)}
            rx={corner}
            ry={corner}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={RIM_WIDTH}
          />
        </Svg>
      ) : null}
    </View>
  );
}
