import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import {
  QrCode,
  WifiOff,
  Bell,
  CheckCircle2,
  Scan,
  FileDown,
  ArrowRight,
  Play,
  ShieldCheck,
  Zap,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate("/");
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded || isSignedIn) return null;

  return (
    <>
      <Helmet>
        <title>VetTrack — Veterinary Equipment QR Tracking System</title>
        <meta
          name="description"
          content="VetTrack — veterinary equipment QR tracking for vet hospitals and ER clinics. Real-time status, offline sync, alerts, and shift handoffs from any phone."
        />
        <meta
          name="keywords"
          content="veterinary equipment tracking software, vet hospital QR tracking system, ER veterinary workflow tool, animal hospital equipment management, veterinary management software"
        />
        <link rel="canonical" href="https://vettrack.replit.app/landing" />
        <meta property="og:title" content="VetTrack — Veterinary Equipment QR Tracking System" />
        <meta
          property="og:description"
          content="Mobile-first QR equipment tracking for veterinary hospitals and ER clinics. Real-time status, offline support, issue alerts, and shift handoffs — all from any device."
        />
        <meta property="og:image" content="https://vettrack.replit.app/og-image.png" />
        <meta property="og:url" content="https://vettrack.replit.app/landing" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="VetTrack — Veterinary Equipment QR Tracking System" />
        <meta
          name="twitter:description"
          content="Mobile-first QR equipment tracking for veterinary hospitals and ER clinics."
        />
        <meta name="twitter:image" content="https://vettrack.replit.app/og-image.png" />
      </Helmet>

      <div className="min-h-screen bg-white font-sans">
        {/* ── Navigation ────────────────────────────────── */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/landing" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center">
                <QrCode className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">VetTrack</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/video" className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-teal-600 transition-colors">
                <Play className="w-3.5 h-3.5" />
                Watch demo
              </Link>
              <Link
                href="/signin"
                className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Sign In
                <ArrowRight className="w-4 h-4" />
              </Link>
            </nav>
          </div>
        </header>

        <main>
          {/* ── Hero ─────────────────────────────────────── */}
          <section className="bg-gradient-to-b from-teal-50 to-white py-16 px-4 text-center">
            <div className="max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                <Zap className="w-3 h-3" />
                Built for veterinary ER teams
              </div>

              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
                Veterinary Equipment QR Tracking{" "}
                <span className="text-teal-600">That Saves Every Minute.</span>
              </h1>

              <p className="text-lg text-gray-600 leading-relaxed mb-8 max-w-2xl mx-auto">
                VetTrack is the QR-based equipment tracking system designed for veterinary
                hospitals and ER clinics. Scan, assign, and report — even without internet.
                No more lost equipment, missed maintenance, or shift confusion.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/signin"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-8 py-3.5 rounded-xl text-base transition-colors shadow-sm"
                >
                  <Scan className="w-5 h-5" />
                  Get Started Free
                </Link>
                <Link
                  href="/video"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-gray-300 hover:border-teal-400 text-gray-700 hover:text-teal-700 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Watch 90-second demo
                </Link>
              </div>
            </div>
          </section>

          {/* ── Trust bar ────────────────────────────────── */}
          <section className="border-y border-gray-100 bg-gray-50 py-5 px-4">
            <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-500 font-medium">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-teal-500" />Works offline</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-teal-500" />QR code scanning</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-teal-500" />Real-time alerts</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-teal-500" />Shift handoffs</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-teal-500" />Monthly PDF reports</span>
            </div>
          </section>

          {/* ── Features grid ────────────────────────────── */}
          <section className="py-16 px-4" aria-labelledby="features-heading">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 id="features-heading" className="text-3xl font-bold text-gray-900 mb-3">
                  Built for the speed of clinical work
                </h2>
                <p className="text-gray-500 max-w-xl mx-auto">
                  Every feature is designed around the real pressures of a vet hospital floor —
                  fast decisions, constant movement, and zero tolerance for confusion.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <article className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-sm transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-4">
                    <QrCode className="w-5 h-5 text-teal-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">One-Tap QR Scanning</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Scan any piece of equipment with your phone to update its status, check it out,
                    or report an issue — no app download required.
                  </p>
                </article>

                <article className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-sm transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                    <WifiOff className="w-5 h-5 text-amber-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Offline-First Reliability</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    VetTrack works without Wi-Fi or cellular signal. Changes queue locally and
                    sync automatically the moment you're back online.
                  </p>
                </article>

                <article className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-sm transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
                    <Bell className="w-5 h-5 text-red-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Severity-Graded Alerts</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    CRITICAL issues, overdue maintenance, sterilization reminders, and inactive
                    equipment — all surfaced instantly with "I'm handling this" acknowledgment.
                  </p>
                </article>

                <article className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-sm transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                    <MapPin className="w-5 h-5 text-blue-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Checkout & Ownership</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Every technician checks equipment in and out by name. "My Equipment" shows
                    exactly what each person holds — with Return All for clean shift handoffs.
                  </p>
                </article>

                <article className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-sm transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Role-Based Access</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Admin and Technician roles keep floor staff focused on their work while giving
                    managers full visibility into equipment status and history.
                  </p>
                </article>

                <article className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-sm transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
                    <FileDown className="w-5 h-5 text-purple-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Monthly PDF Reports</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Generate one-click compliance reports covering maintenance history,
                    sterilization records, and issue logs — ready for audits and reviews.
                  </p>
                </article>
              </div>
            </div>
          </section>

          {/* ── How it works ─────────────────────────────── */}
          <section className="bg-teal-50 py-16 px-4" aria-labelledby="how-it-works-heading">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 id="how-it-works-heading" className="text-3xl font-bold text-gray-900 mb-3">
                  Up and running in 3 steps
                </h2>
                <p className="text-gray-500">No training sessions. No IT tickets. Just scan and go.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-2xl font-extrabold mb-4 shadow-sm">
                    1
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Print & Stick</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Generate QR code labels from the admin panel and attach them to any piece of
                    equipment. One label — all the data.
                  </p>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-2xl font-extrabold mb-4 shadow-sm">
                    2
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Scan & Log</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Staff scan with any smartphone camera. Update status, check out, or report
                    an issue in under 5 seconds — with or without internet.
                  </p>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-2xl font-extrabold mb-4 shadow-sm">
                    3
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Track & Report</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Monitor your entire fleet live on the management dashboard. Export monthly
                    compliance reports whenever you need them.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Testimonial / social proof ────────────────── */}
          <section className="py-16 px-4" aria-labelledby="testimonial-heading">
            <div className="max-w-2xl mx-auto text-center">
              <h2 id="testimonial-heading" className="sr-only">What veterinary teams say</h2>
              <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                <div className="flex justify-center mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <blockquote>
                  <p className="text-xl font-medium text-gray-900 italic mb-4">
                    "No more whiteboards, no more confusion. We know exactly where every
                    ventilator and monitor is, and who has it."
                  </p>
                  <footer>
                    <cite className="not-italic">
                      <span className="block font-semibold text-gray-900">ER Veterinary Team</span>
                      <span className="text-sm text-gray-500">24-hour Animal Hospital</span>
                    </cite>
                  </footer>
                </blockquote>
              </div>
            </div>
          </section>

          {/* ── Final CTA ─────────────────────────────────── */}
          <section className="bg-teal-600 py-16 px-4 text-center text-white" aria-labelledby="cta-heading">
            <div className="max-w-2xl mx-auto">
              <h2 id="cta-heading" className="text-3xl font-bold mb-4">
                Ready to stop losing equipment?
              </h2>
              <p className="text-teal-100 mb-8 leading-relaxed">
                VetTrack is free to get started. No credit card. No setup fee.
                Your team can be scanning equipment in minutes.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/signin"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-teal-700 font-bold px-8 py-3.5 rounded-xl text-base hover:bg-teal-50 transition-colors shadow-sm"
                >
                  <Scan className="w-5 h-5" />
                  Start Tracking Now
                </Link>
                <Link
                  href="/video"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/40 text-white font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Watch the demo
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* ── Footer ───────────────────────────────────── */}
        <footer className="border-t border-gray-100 bg-white py-8 px-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-teal-600 flex items-center justify-center">
                <QrCode className="w-3 h-3 text-white" />
              </div>
              <span className="font-semibold text-gray-700">VetTrack</span>
              <span>· QR Equipment Tracking for Veterinary Clinics</span>
            </div>
            <nav className="flex items-center gap-4">
              <Link href="/" className="hover:text-teal-600 transition-colors">Dashboard</Link>
              <Link href="/video" className="hover:text-teal-600 transition-colors">Demo</Link>
              <Link href="/equipment" className="hover:text-teal-600 transition-colors">Equipment</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
