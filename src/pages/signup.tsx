import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { Loader2, QrCode } from "lucide-react";
import { ClerkFailed, ClerkLoaded, ClerkLoading, SignUp } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";
import { clerkAppearance } from "@/lib/clerk-appearance";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export default function SignUpPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate("/");
    }
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <>
      <Helmet>
        <title>Sign Up — VetTrack</title>
        <meta name="description" content="Create a VetTrack account to manage veterinary equipment, scan QR codes, and track your clinic's fleet in real time." />
        <link rel="canonical" href="https://vettrack.replit.app/signup" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-[100dvh] bg-gradient-to-b from-primary/5 to-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <Link
              href="/landing"
              className="inline-flex items-center gap-2 mb-6 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <QrCode className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold text-foreground">VetTrack</span>
            </Link>
            <h1 className="text-2xl font-bold text-foreground mb-2">Create your account</h1>
            <p className="text-sm text-muted-foreground">Sign up to access your veterinary equipment dashboard</p>
          </div>

          {CLERK_PUBLISHABLE_KEY ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <ClerkLoading>
                <div className="flex w-full min-h-[12rem] justify-center items-center" aria-busy>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </ClerkLoading>
              <ClerkFailed>
                <p className="text-sm text-center text-destructive px-2" role="alert">
                  Sign-up could not load. Check your connection, then refresh. If this persists, confirm Clerk is configured for this domain and that the publishable key matches this deployment.
                </p>
              </ClerkFailed>
              <ClerkLoaded>
                <div className="w-full min-h-[24rem] flex flex-col items-center justify-start">
                  <SignUp
                    routing="hash"
                    signInUrl="/signin"
                    fallbackRedirectUrl="/"
                    appearance={clerkAppearance}
                  />
                </div>
              </ClerkLoaded>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Authentication is running in development mode.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-3 rounded-xl transition-colors"
              >
                Continue to Dashboard
              </Link>
            </div>
          )}

          <div className="text-center mt-6">
            <Link
              href="/landing"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              ← Learn more about VetTrack
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
