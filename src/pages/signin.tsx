import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { QrCode, LogIn, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

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

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            {isLoaded && isSignedIn ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-4">You are already signed in.</p>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Go to Dashboard
                </Link>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
                  <LogIn className="w-6 h-6 text-teal-600" />
                </div>
                <p className="text-sm text-gray-600 mb-6">
                  Authentication is managed via your clinic's identity provider.
                  Contact your administrator if you need access.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              </div>
            )}
          </div>

          <div className="text-center mt-6">
            <Link
              href="/landing"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Learn more about VetTrack
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
