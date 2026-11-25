import { ScrollView, View } from "react-native";
import { Text } from "@/components/text";

/**
 * A stand in for the slice of Reanimated the app uses, for Jest. Reanimated
 * 4's own mock and resolver load its native or web runtime, neither of which
 * runs here. Animations jump to their end value at once but report finishing
 * only after their duration, on Jest's timers, so a test can still check
 * when the launch overlay leaves (prompts/mobile-app-icon-launch.md).
 */

const identity = (x: number) => x;

export const Easing = {
  linear: identity,
  bezier: () => identity,
  bezierFn: () => identity,
};

export const Extrapolation = {
  CLAMP: "clamp",
  EXTEND: "extend",
  IDENTITY: "identity",
};

export const useSharedValue = <T>(initial: T) => {
  const { useRef } = require("react") as typeof import("react");
  return useRef({
    value: initial,
    get() {
      return this.value;
    },
    set(next: T) {
      this.value = next;
    },
  }).current;
};

export const useAnimatedStyle = (updater: () => object) => updater();

export const useReducedMotion = () => false;

export const interpolate = (
  _value: number,
  _input: number[],
  output: number[],
) => output[0];

export const cancelAnimation = () => {};

/** A scroll handler that does nothing: Jest never scrolls a title screen. */
export const useAnimatedScrollHandler = () => undefined;

export function withTiming<T>(
  toValue: T,
  config?: { duration?: number },
  callback?: (finished: boolean) => void,
): T {
  if (callback) setTimeout(() => callback(true), config?.duration ?? 300);
  return toValue;
}

/** A spring lands at once here, as `withTiming` does. */
export function withSpring<T>(toValue: T): T {
  return toValue;
}

const Animated = { View, Text, ScrollView };
export default Animated;
