import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { QrCode } from "lucide-react";
import { SignIn } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export default function SignInPage() {
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
        <title>Sign In — VetTrack</title>
        <meta name="description" content="Sign in to VetTrack to manage veterinary equipment, scan QR codes, and track your clinic's fleet in real time." />
        <link rel="canonical" href="https://vettrack.replit.app/signin" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <Link href="/landing" className="inline-flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">VetTrack</span>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h1>
            <p className="text-sm text-gray-500">Sign in to access your veterinary equipment dashboard</p>
          </div>

          {CLERK_PUBLISHABLE_KEY ? (
            <div className="flex justify-center">
              <SignIn
                routing="hash"
                redirectUrl="/"
                appearance={{
                  variables: {
                    colorPrimary: "#0d9488",
                    colorBackground: "#ffffff",
                    borderRadius: "1rem",
                  },
                }}
              />
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-center">
              <p className="text-sm text-gray-500 mb-4">
                Authentication is running in development mode.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors"
              >
                Continue to Dashboard
              </Link>
            </div>
          )}

          <div className="text-center mt-6">
            <Link
              href="/landing"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors"
            >
              ← Learn more about VetTrack
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
