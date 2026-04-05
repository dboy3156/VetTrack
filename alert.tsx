import { QuickStatusUpdate } from "@/components/QuickStatusUpdate";
import Dashboard from "@/pages/dashboard";
import { SyncIndicator } from "@/components/SyncIndicator";

import { useEffect, useRef } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

import {
  ClerkProvider,
  SignIn,
  SignUp,
  useClerk,
  useUser,
} from "@clerk/react";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import NewEquipment from "@/pages/new-equipment";
import EquipmentDetail from "@/pages/equipment-detail";
import Alerts from "@/pages/alerts";
import PrintLabels from "@/pages/print-labels";
import Analytics from "@/pages/analytics";
import Activity from "@/pages/activity";
import AdminUsers from "@/pages/admin-users";
import Settings from "@/pages/settings";

import { UndoProvider } from "@/hooks/useUndo";

/* ================= ENV ================= */

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

/* ================= QUERY ================= */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30,
    },
  },
});

/* ================= HELPERS ================= */

function stripBase(path: string): string {
  if (!basePath) return path;
  return path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

/* ================= AUTH PAGES ================= */

function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

/* ================= LOADING ================= */

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

/* ================= PROTECTED ================= */

function ProtectedRoute({
  component: Component,
  adminOnly = false,
}: {
  component: React.ComponentType;
  adminOnly?: boolean;
}) {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <LoadingScreen />;

  if (!user) {
    return <Redirect to={`${basePath}/sign-in`} />;
  }

  const role = user.publicMetadata?.role;

  if (adminOnly && role !== "admin") {
    return (
      <div className="p-10 text-center text-red-600 font-semibold">
        גישה נדחתה — נדרשת הרשאת מנהל
      </div>
    );
  }

  return <Component />;
}

/* ================= CACHE RESET ON USER CHANGE ================= */

function ClerkCacheReset() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prevUserId.current !== undefined && prevUserId.current !== id) {
        qc.clear();
      }
      prevUserId.current = id;
    });
    return unsub;
  }, [addListener, qc]);

  return null;
}

/* ================= ROUTES ================= */

function Router() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />

      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>

      <Route path="/equipment">
        <ProtectedRoute component={Home} />
      </Route>
      <Route path="/equipment/new">
        <ProtectedRoute component={NewEquipment} />
      </Route>
      <Route path="/equipment/:id">
        <ProtectedRoute component={EquipmentDetail} />
      </Route>

      <Route path="/activity">
        <ProtectedRoute component={Activity} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={Analytics} />
      </Route>
      <Route path="/alerts">
        <ProtectedRoute component={Alerts} />
      </Route>
      <Route path="/print">
        <ProtectedRoute component={PrintLabels} />
      </Route>
      <Route path="/scan">
        <ProtectedRoute component={QuickStatusUpdate} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={Settings} />
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute component={AdminUsers} adminOnly />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

/* ================= ROOT ================= */

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  // תוקן: proxyUrl מועבר רק אם קיים — מונע warning של Clerk על undefined
  const clerkProps = {
    publishableKey: clerkPubKey,
    routerPush: (to: string) => setLocation(stripBase(to)),
    routerReplace: (to: string) => setLocation(stripBase(to), { replace: true }),
    ...(clerkProxyUrl ? { proxyUrl: clerkProxyUrl } : {}),
  };

  return (
    <ClerkProvider {...clerkProps}>
      <QueryClientProvider client={queryClient}>
        <ClerkCacheReset />
        <TooltipProvider>
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
          <Toaster />
          <SyncIndicator />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

/* ================= APP ================= */

function App() {
  return (
    <WouterRouter base={basePath}>
      <UndoProvider>
        <ClerkProviderWithRoutes />
      </UndoProvider>
    </WouterRouter>
  );
}

export default App;
