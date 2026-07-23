import { Suspense, lazy, type ComponentType } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { routeModules } from "@/routeModules";

const Home = lazy(() => routeModules.home().then((m) => ({ default: m.Home })));
const Agent = lazy(() => routeModules.agent().then((m) => ({ default: m.Agent })));
const RunDetail = lazy(() =>
  routeModules.runDetail().then((m) => ({ default: m.RunDetail })),
);
const Compare = lazy(() =>
  routeModules.compare().then((m) => ({ default: m.Compare })),
);
const Settings = lazy(() =>
  routeModules.settings().then((m) => ({ default: m.Settings })),
);
const Runtime = lazy(() =>
  routeModules.runtime().then((m) => ({ default: m.Runtime })),
);
const Reports = lazy(() =>
  routeModules.reports().then((m) => ({ default: m.Reports })),
);
const Correlation = lazy(() =>
  routeModules.correlation().then((m) => ({ default: m.Correlation })),
);
const AlphaZoo = lazy(() =>
  routeModules.alphaZoo().then((m) => ({ default: m.AlphaZoo })),
);

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

function wrap(Component: ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: wrap(Home) },
      { path: "/agent", element: wrap(Agent) },
      { path: "/runtime", element: wrap(Runtime) },
      { path: "/reports", element: wrap(Reports) },
      { path: "/settings", element: wrap(Settings) },
      { path: "/runs/:runId", element: wrap(RunDetail) },
      { path: "/compare", element: wrap(Compare) },
      { path: "/correlation", element: wrap(Correlation) },
      { path: "/alpha-zoo", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/bench", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/compare", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/:alphaId", element: wrap(AlphaZoo) },
    ],
  },
]);
