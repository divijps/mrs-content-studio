import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { AuthGate } from "../app/auth/auth-gate";
import { AppShell } from "../app/shell/app-shell";
import { BrandScreen } from "../app/surfaces/brand-screen";
import { CopyScreen } from "../app/surfaces/copy-screen";
import { EmailScreen } from "../app/surfaces/email-screen";
import { LibraryScreen } from "../app/surfaces/library-screen";
import { PlannerScreen } from "../app/surfaces/planner-screen";
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
  // Shared deep links: /library?asset=<id> or ?board=<id>. Declared so the
  // params survive initial load; LibraryScreen reads them on mount. Keys are
  // optional so existing navigate({ to: "/library" }) calls need no search.
  validateSearch: (search: Record<string, unknown>): { asset?: string; board?: string } => {
    const out: { asset?: string; board?: string } = {};
    if (typeof search.asset === "string") out.asset = search.asset;
    if (typeof search.board === "string") out.board = search.board;
    return out;
  },
});

const plannerRoute = createRoute({
  component: PlannerScreen,
  getParentRoute: () => rootRoute,
  path: "/planner",
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

const copyRoute = createRoute({
  component: CopyScreen,
  getParentRoute: () => rootRoute,
  path: "/copy",
});

const emailRoute = createRoute({
  component: EmailScreen,
  getParentRoute: () => rootRoute,
  path: "/email",
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  libraryRoute,
  plannerRoute,
  brandRoute,
  tasksRoute,
  copyRoute,
  emailRoute,
]);
