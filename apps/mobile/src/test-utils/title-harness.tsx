import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ToastProvider } from "@/components/toast";

/** One recorded `/api/v1` call: the method, path and body the app sent. */
export type ApiCall = { method: string; path: string; body: unknown };

type Handler = (body: unknown) => unknown;

/**
 * A stand in for `apiRequest` that answers by method and path, so a screen
 * test proves the exact routes and bodies the app sends (spec 0035, API
 * surface) without a server. An unknown call rejects loudly, so a test can
 * never pass on a request it did not expect. A test wires it with
 * `jest.mock("@/lib/api", …)` calling `mockApi.handle`.
 */
export function createApiMock() {
  const routes = new Map<string, Handler>();
  const calls: ApiCall[] = [];
  return {
    calls,
    /** Answers `METHOD path` with the handler's value (or its rejection). */
    on(method: string, path: string, handler: Handler) {
      routes.set(`${method} ${path}`, handler);
    },
    reset() {
      routes.clear();
      calls.length = 0;
    },
    /** The calls made to one method and path. */
    callsTo(method: string, path: string) {
      return calls.filter(
        (call) => call.method === method && call.path === path,
      );
    },
    handle(
      path: string,
      _schema: unknown,
      options: Record<string, unknown> = {},
    ) {
      const method = (options.method as string | undefined) ?? "GET";
      calls.push({ method, path, body: options.body });
      const handler = routes.get(`${method} ${path}`);
      if (!handler) {
        return Promise.reject(new Error(`Unexpected ${method} ${path}`));
      }
      return Promise.resolve().then(() => handler(options.body));
    },
  };
}

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** A fresh query client with no retries, as each screen test needs. */
export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** The providers a title screen reads: safe area, queries and the toast. */
export function titleWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  };
}
