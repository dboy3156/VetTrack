import { Switch, Route, Redirect } from "wouter";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Loader2, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const HomePage = lazy(() => import("@/pages/home"));
const SignInPage = lazy(() => import("@/pages/signin"));
const EquipmentPage = lazy(() => import("@/pages/equipment-list"));
const StabilityDashboardPage = lazy(() => import("@/pages/stability-dashboard"));

function AuthGuard({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { isLoaded, isSignedIn, status, signOut } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!isSignedIn) return <Redirect to="/signin" />;

  if (status === "pending") return (
    <div className="flex h-screen flex-col items-center justify-center text-center p-6">
      <Clock className="h-16 w-16 text-amber-500 mb-4" />
      <h1 className="text-2xl font-bold">החשבון ממתין לאישור הנהלת ביה"ח</h1>
      <Button className="mt-4" onClick={signOut}>התנתק</Button>
    </div>
  );

  if (status === "blocked") return (
    <div className="flex h-screen flex-col items-center justify-center text-center p-6 bg-destructive/5">
      <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold text-destructive">גישה חסומה</h1>
      <p>פנה למחלקת מערכות מידע לבירור.</p>
      <Button className="mt-4" onClick={signOut}>התנתק</Button>
    </div>
  );

  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<div className="p-10 text-center">טוען מערכת...</div>}>
      <Switch>
        <Route path="/signin" component={SignInPage} />
        <Route path="/"><AuthGuard><HomePage /></AuthGuard></Route>
        <Route path="/equipment"><AuthGuard><EquipmentPage /></AuthGuard></Route>
        <Route path="/stability"><AuthGuard><StabilityDashboardPage /></AuthGuard></Route>
      </Switch>
    </Suspense>
  );
}
