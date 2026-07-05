import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { AppShell } from "../app/shell/app-shell";
import { LibraryScreen } from "../app/surfaces/library-screen";
import { PlannerScreen } from "../app/surfaces/planner-screen";
import { QueueScreen } from "../app/surfaces/queue-screen";
import { AppHome } from "./index";

function RootLayout(): React.JSX.Element {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  component: AppHome,
  getParentRoute: () => rootRoute,
  path: "/",
});

const libraryRoute = createRoute({
  component: LibraryScreen,
  getParentRoute: () => rootRoute,
  path: "/library",
});

const plannerRoute = createRoute({
  component: PlannerScreen,
  getParentRoute: () => rootRoute,
  path: "/planner",
});

const queueRoute = createRoute({
  component: QueueScreen,
  getParentRoute: () => rootRoute,
  path: "/queue",
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  libraryRoute,
  plannerRoute,
  queueRoute,
]);
