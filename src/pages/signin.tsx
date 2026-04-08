import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { QrCode } from "lucide-react";
import { SignIn } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";
import { PhoneSignIn } from "@/components/phone-sign-in";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();
  const [usePhoneFlow, setUsePhoneFlow] = useState(false);

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

      <div className="min-h-[100dvh] bg-gradient-to-b from-blue-50 to-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <Link href="/landing" className="inline-flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">VetTrack</span>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h1>
            <p className="text-sm text-gray-500">Sign in to access your veterinary equipment dashboard</p>
          </div>

          {CLERK_PUBLISHABLE_KEY ? (
            <div className="flex flex-col items-center gap-4">
              {usePhoneFlow ? (
                <>
                  <PhoneSignIn />
                  <button
                    type="button"
                    onClick={() => setUsePhoneFlow(false)}
                    className="text-xs text-gray-500 hover:text-blue-600 transition-colors underline"
                  >
                    ← Back to standard sign-in
                  </button>
                </>
              ) : (
                <>
                  <SignIn
                    routing="hash"
                    fallbackRedirectUrl="/"
                    appearance={{
                      variables: {
                        colorPrimary: "#2563EB",
                        colorBackground: "#ffffff",
                        borderRadius: "1rem",
                      },
                    }}
                  />
                  <p className="text-xs text-gray-400 text-center max-w-xs">
                    Signing in with an Israeli number (+972)?{" "}
                    <button
                      type="button"
                      onClick={() => setUsePhoneFlow(true)}
                      className="underline hover:text-blue-600 transition-colors"
                    >
                      Use the Israeli phone sign-in
                    </button>{" "}
                    to enter your number in local format (e.g. 0501234567).
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-center">
              <p className="text-sm text-gray-500 mb-4">
                Authentication is running in development mode.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors"
              >
                Continue to Dashboard
              </Link>
            </div>
          )}

          <div className="text-center mt-6">
            <Link
              href="/landing"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
            >
              ← Learn more about VetTrack
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
