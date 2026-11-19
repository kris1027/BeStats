import { UNDO_TOAST_MS } from "@bestats/core/tracking/messages";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** How long a toast with no action stays up. */
const PLAIN_TOAST_MS = 4_000;

/** Room for the native tab bar under the toast. */
const TAB_BAR_HEIGHT = 56;

type ToastAction = {
  label: string;
  /** Runs the action; the toast stays, without its action, until it settles. */
  onPress: () => void;
};

type Toast = {
  message: string;
  tone?: "info" | "error";
  action?: ToastAction;
};

type ShownToast = Toast & { key: number; busy: boolean };

type ToastApi = {
  /** Shows a toast, replacing the one on screen. Returns its key. */
  show: (toast: Toast) => number;
  /** Turns the toast's action off while it runs, so it cannot run twice. */
  busy: (key: number) => void;
  /** Closes the toast, if it is still the one on screen. */
  dismiss: (key: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The app's one toast (prompts/mobile-title-tracking.md, decision 3): a glass
 * plate above the tab bar with one line and at most one action, Undo after a
 * write that removed something, or none for a failed write. A new toast
 * replaces the one on screen rather than stacking, as each web control keeps
 * one toast of its own. One with Undo stays `UNDO_TOAST_MS`, the web's
 * duration, so a screen reader user can reach it; it is announced, so a
 * failure is never silent (AGENTS.md sections 3 and 11).
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ShownToast | null>(null);
  const next = useRef(0);

  const show = useCallback((value: Toast) => {
    next.current += 1;
    const key = next.current;
    setToast({ ...value, key, busy: false });
    AccessibilityInfo.announceForAccessibility(value.message);
    return key;
  }, []);
  const busy = useCallback((key: number) => {
    setToast((current) =>
      current?.key === key ? { ...current, busy: true } : current,
    );
  }, []);
  const dismiss = useCallback((key: number) => {
    setToast((current) => (current?.key === key ? null : current));
  }, []);
  const api = useMemo(() => ({ show, busy, dismiss }), [show, busy, dismiss]);

  // A running action keeps the toast until its outcome closes or replaces it.
  useEffect(() => {
    if (!toast || toast.busy) return;
    const timer = setTimeout(
      () => dismiss(toast.key),
      toast.action ? UNDO_TOAST_MS : PLAIN_TOAST_MS,
    );
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <ToastView toast={toast} onClose={() => dismiss(toast.key)} />
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  onClose,
}: {
  toast: ShownToast;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 px-4"
      style={{ bottom: insets.bottom + TAB_BAR_HEIGHT + 8 }}
    >
      <View
        accessibilityRole={toast.tone === "error" ? "alert" : undefined}
        accessibilityLiveRegion="polite"
        className={`flex-row items-center gap-2 rounded-2xl border bg-glass-plate-panel py-1 pl-4 pr-1 ${
          toast.tone === "error" ? "border-destructive" : "border-border"
        }`}
      >
        <Text
          className={`flex-1 py-2 ${
            toast.tone === "error" ? "text-destructive" : "text-foreground"
          }`}
        >
          {toast.message}
        </Text>
        {toast.busy ? (
          <ActivityIndicator
            accessibilityLabel="Working"
            className="min-h-11 min-w-11"
          />
        ) : toast.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={toast.action.onPress}
            className="min-h-11 min-w-11 items-center justify-center rounded-full px-3"
          >
            <Text className="font-semibold text-primary">
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Text aria-hidden className="text-lg text-text-secondary">
            ×
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The toast of the nearest `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider above it");
  return api;
}
