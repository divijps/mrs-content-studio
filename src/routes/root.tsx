import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { AuthGate } from "../app/auth/auth-gate";
import { AppShell } from "../app/shell/app-shell";
import { BrandScreen } from "../app/surfaces/brand-screen";
import { LibraryScreen } from "../app/surfaces/library-screen";
import { PlannerScreen } from "../app/surfaces/planner-screen";
import { QueueScreen } from "../app/surfaces/queue-screen";
import { TasksScreen } from "../app/surfaces/tasks-screen";
import { AppHome } from "./index";

function RootLayout(): React.JSX.Element {
  return (
    <AuthGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGate>
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

const brandRoute = createRoute({
  component: BrandScreen,
  getParentRoute: () => rootRoute,
  path: "/brand",
});

const tasksRoute = createRoute({
  component: TasksScreen,
  getParentRoute: () => rootRoute,
  path: "/tasks",
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  libraryRoute,
  plannerRoute,
  queueRoute,
  brandRoute,
  tasksRoute,
]);
