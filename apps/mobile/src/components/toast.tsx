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

/** The most toasts on screen at once; a new one past it drops the oldest. */
const MAX_TOASTS = 3;

/** Room for the native tab bar under the toast. */
const TAB_BAR_HEIGHT = 56;

type ToastAction = {
  label: string;
  /** Runs the action; the toast stays, without its action, until it settles. */
  onPress: () => void;
};

type Toast = {
  /**
   * The control the toast speaks for. A new toast with the same id replaces
   * the old one; toasts with other ids, or none, stack beside it.
   */
  id?: string;
  message: string;
  tone?: "info" | "error";
  action?: ToastAction;
};

type ShownToast = Toast & { key: number; busy: boolean };

type ToastApi = {
  /** Shows a toast, replacing the one with the same `id`. Returns its key. */
  show: (toast: Toast) => number;
  /** Turns the toast's action off while it runs, so it cannot run twice. */
  busy: (key: number) => void;
  /** Closes the toast, if it is still on screen. */
  dismiss: (key: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The app's toasts (prompts/mobile-title-tracking.md, decision 3): glass
 * plates above the tab bar, each with one line and at most one action, Undo
 * after a write that removed something, or none for a failed write. Each
 * control keeps one toast of its own, replaced rather than stacked by its
 * next one, as the web keys its toasts; another control's toast stacks
 * beside it, so a later failure never wipes a pending Undo. One with Undo
 * stays `UNDO_TOAST_MS`, the web's duration, so a screen reader user can
 * reach it; each is announced, so a failure is never silent (AGENTS.md
 * sections 3 and 11).
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ShownToast[]>([]);
  const next = useRef(0);

  const show = useCallback((value: Toast) => {
    next.current += 1;
    const key = next.current;
    setToasts((current) => {
      const others =
        value.id === undefined
          ? current
          : current.filter((toast) => toast.id !== value.id);
      return [...others, { ...value, key, busy: false }].slice(-MAX_TOASTS);
    });
    AccessibilityInfo.announceForAccessibility(value.message);
    return key;
  }, []);
  const busy = useCallback((key: number) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.key === key ? { ...toast, busy: true } : toast,
      ),
    );
  }, []);
  const dismiss = useCallback((key: number) => {
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }, []);
  const api = useMemo(() => ({ show, busy, dismiss }), [show, busy, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 ? (
        <ToastStack toasts={toasts} dismiss={dismiss} />
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastStack({
  toasts,
  dismiss,
}: {
  toasts: ShownToast[];
  dismiss: (key: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 gap-2 px-4"
      style={{ bottom: insets.bottom + TAB_BAR_HEIGHT + 8 }}
    >
      {toasts.map((toast) => (
        <TimedToast key={toast.key} toast={toast} dismiss={dismiss} />
      ))}
    </View>
  );
}

/** One toast with its own timer; a running action holds the timer off. */
function TimedToast({
  toast,
  dismiss,
}: {
  toast: ShownToast;
  dismiss: (key: number) => void;
}) {
  useEffect(() => {
    if (toast.busy) return;
    const timer = setTimeout(
      () => dismiss(toast.key),
      toast.action ? UNDO_TOAST_MS : PLAIN_TOAST_MS,
    );
    return () => clearTimeout(timer);
  }, [toast, dismiss]);
  return <ToastView toast={toast} onClose={() => dismiss(toast.key)} />;
}

function ToastView({
  toast,
  onClose,
}: {
  toast: ShownToast;
  onClose: () => void;
}) {
  return (
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
  );
}

/**
 * The toasts of the nearest `ToastProvider`, the one way a screen reports a
 * write's outcome, so no failure is silent (AGENTS.md section 11).
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider above it");
  return api;
}
