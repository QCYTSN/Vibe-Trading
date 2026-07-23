export const routeModules = {
  home: () => import("@/pages/Home"),
  agent: () => import("@/pages/Agent"),
  runDetail: () => import("@/pages/RunDetail"),
  compare: () => import("@/pages/Compare"),
  settings: () => import("@/pages/Settings"),
  runtime: () => import("@/pages/Runtime"),
  reports: () => import("@/pages/Reports"),
  correlation: () => import("@/pages/Correlation"),
  alphaZoo: () => import("@/pages/AlphaZoo"),
};

const routeLoaders: Array<[test: (path: string) => boolean, load: () => Promise<unknown>]> = [
  [(path) => path === "/", routeModules.home],
  [(path) => path.startsWith("/agent"), routeModules.agent],
  [(path) => path.startsWith("/runtime"), routeModules.runtime],
  [(path) => path.startsWith("/reports"), routeModules.reports],
  [(path) => path.startsWith("/settings"), routeModules.settings],
  [(path) => path.startsWith("/runs/"), routeModules.runDetail],
  [(path) => path.startsWith("/compare"), routeModules.compare],
  [(path) => path.startsWith("/correlation"), routeModules.correlation],
  [(path) => path.startsWith("/alpha-zoo"), routeModules.alphaZoo],
];

export function preloadRoute(path: string): void {
  const loader = routeLoaders.find(([test]) => test(path))?.[1];
  if (loader) void loader();
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleCommonRoutePreloads(): () => void {
  const routes = ["/agent", "/runtime", "/settings"];
  const idleWindow = window as IdleWindow;
  let cancelled = false;
  let timeoutHandle: number | undefined;
  let idleHandle: number | undefined;

  const loadNext = () => {
    if (cancelled) return;
    const route = routes.shift();
    if (!route) return;
    preloadRoute(route);
    timeoutHandle = window.setTimeout(loadNext, 450);
  };

  if (idleWindow.requestIdleCallback) {
    idleHandle = idleWindow.requestIdleCallback(loadNext, { timeout: 1500 });
  } else {
    timeoutHandle = window.setTimeout(loadNext, 700);
  }

  return () => {
    cancelled = true;
    if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
  };
}
