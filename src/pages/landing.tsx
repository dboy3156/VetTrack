import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import {
  QrCode,
  WifiOff,
  Bell,
  CheckCircle2,
  Scan,
  FileDown,
  Shield,
  MapPin,
  LayoutDashboard,
  BarChart3,
  Smartphone,
  Sparkles,
  Building2,
  Package,
  Radio,
  Star,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { MarketingLayout } from "@/components/marketing-layout";

function SectionTitle({
  kicker,
  title,
  subtitle,
  className,
  id,
}: {
  kicker?: string;
  title: string;
  subtitle: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("text-center max-w-3xl mx-auto mb-12 md:mb-16", className)}>
      {kicker ? (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-3">{kicker}</p>
      ) : null}
      <h2
        id={id}
        className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight text-balance mb-4"
      >
        {title}
      </h2>
      <p className="text-muted-foreground text-lg leading-relaxed text-pretty">{subtitle}</p>
    </div>
  );
}

export default function LandingPage() {
  const { isLoaded, isSignedIn, isOfflineSession } = useAuth();
  const showAuthCta = (isLoaded || isOfflineSession) && !isSignedIn;
  const showAppCta = (isLoaded || isOfflineSession) && isSignedIn;
  const lp = t.landingPage;

  const quickLinks = [
    { id: "scan" as const, label: lp.quickLinkScan },
    { id: "map" as const, label: lp.quickLinkMap },
    { id: "alerts" as const, label: lp.quickLinkAlerts },
    { id: "handoff" as const, label: lp.quickLinkHandoff },
    { id: "inventory" as const, label: lp.quickLinkInventory },
    { id: "reports" as const, label: lp.quickLinkReports },
  ];

  const stats = [
    { value: lp.stat1Value, label: lp.stat1Label },
    { value: lp.stat2Value, label: lp.stat2Label },
    { value: lp.stat3Value, label: lp.stat3Label },
  ];

  const previewRows = [
    { name: lp.previewRow1Name, status: lp.previewRow1Status, issue: false },
    { name: lp.previewRow2Name, status: lp.previewRow2Status, issue: false },
    { name: lp.previewRow3Name, status: lp.previewRow3Status, issue: true },
  ];

  const howSteps: {
    n: "01" | "02" | "03";
    title: string;
    body: string;
    icon: typeof QrCode;
  }[] = [
    { n: "01", title: lp.how1Title, body: lp.how1Body, icon: QrCode },
    { n: "02", title: lp.how2Title, body: lp.how2Body, icon: Scan },
    { n: "03", title: lp.how3Title, body: lp.how3Body, icon: FileDown },
  ];

  return (
    <>
      <Helmet>
        <title>{lp.seoTitle}</title>
        <meta name="description" content={lp.seoDescription} />
        <meta name="keywords" content={lp.seoKeywords} />
        <link rel="canonical" href="https://vettrack.replit.app/landing" />
        <meta property="og:title" content={lp.ogTitle} />
        <meta property="og:description" content={lp.ogDescription} />
        <meta property="og:image" content="https://vettrack.replit.app/og-image.png" />
        <meta property="og:url" content="https://vettrack.replit.app/landing" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={lp.twitterTitle} />
        <meta name="twitter:description" content={lp.twitterDescription} />
        <meta name="twitter:image" content="https://vettrack.replit.app/og-image.png" />
      </Helmet>

      <MarketingLayout showAppCta={showAppCta} showAuthCta={showAuthCta}>
        <main>
          <section className="relative pt-10 pb-16 md:pt-16 md:pb-24 px-4 sm:px-6" aria-labelledby="hero-heading">
            <div className="max-w-6xl mx-auto">
              <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground/90 shadow-sm mb-6">
                    <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden />
                    <span>{lp.heroBadge}</span>
                  </div>
                  <h1
                    id="hero-heading"
                    className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-balance leading-[1.1] mb-6"
                  >
                    {lp.heroTitleBefore}{" "}
                    <span className="text-primary">{lp.heroTitleHighlight}</span>
                  </h1>
                  <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl mb-8">
                    {lp.heroBody}
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                    {showAppCta && (
                      <Link
                        href="/"
                        className={cn(
                          "inline-flex items-center justify-center gap-2 rounded-2xl font-bold px-7 py-3.5 min-h-[52px]",
                          "bg-primary text-primary-foreground shadow-lg shadow-primary/25",
                          "hover:bg-primary/90 active:scale-[0.99] motion-reduce:active:scale-100 transition-all duration-200",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        )}
                      >
                        <LayoutDashboard className="w-5 h-5" />
                        {lp.heroCtaDashboard}
                      </Link>
                    )}
                    {showAuthCta && (
                      <Link
                        href="/signin"
                        className={cn(
                          "inline-flex items-center justify-center gap-2 rounded-2xl font-bold px-7 py-3.5 min-h-[52px]",
                          "bg-primary text-primary-foreground shadow-lg shadow-primary/25",
                          "hover:bg-primary/90 active:scale-[0.99] motion-reduce:active:scale-100 transition-all duration-200",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        )}
                      >
                        <Scan className="w-5 h-5" />
                        {lp.heroCtaGetStarted}
                      </Link>
                    )}
                    <span className="text-sm text-muted-foreground sm:pl-2 text-center sm:text-left">
                      {lp.heroNoCard}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      {lp.heroTrust1}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      {lp.heroTrust2}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      {lp.heroTrust3}
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <div
                    className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-2xl"
                    aria-hidden
                  />
                  <div
                    className={cn(
                      "relative rounded-3xl border border-border/80 bg-card/80 backdrop-blur-sm shadow-2xl",
                      "p-5 sm:p-6 space-y-4"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Smartphone className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground font-medium">
                            {lp.previewFloorSnapshot}
                          </p>
                          <p className="text-sm font-semibold truncate">{lp.previewLiveBoard}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        {lp.previewLive}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {previewRows.map((row) => (
                        <div
                          key={row.name}
                          className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-background/50 px-3 py-2.5"
                        >
                          <span className="text-sm font-medium truncate">{row.name}</span>
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-2 py-0.5 rounded-md shrink-0",
                              row.issue
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <Radio className="w-3.5 h-3.5 text-primary" aria-hidden />
                      <span>{lp.previewSyncNote}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="border-y border-border/60 bg-muted/30 py-3.5"
            aria-label={lp.productAreasAria}
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1">
                {quickLinks.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-xs sm:text-sm font-medium text-foreground/90 whitespace-nowrap shadow-sm"
                  >
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="py-12 md:py-16 px-4 sm:px-6" aria-label={lp.statsOutcomesAria}>
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="text-center sm:text-left rounded-2xl border border-border/50 bg-card/50 px-6 py-6 md:py-7"
                  >
                    <p className="text-3xl sm:text-4xl font-extrabold text-primary tabular-nums tracking-tight mb-2">
                      {s.value}
                    </p>
                    <p className="text-sm text-muted-foreground leading-snug max-w-xs mx-auto sm:mx-0">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-12 md:py-20 px-4 sm:px-6" aria-labelledby="platform-heading">
            <div className="max-w-6xl mx-auto">
              <SectionTitle
                kicker={lp.bentoKicker}
                id="platform-heading"
                title={lp.bentoTitle}
                subtitle={lp.bentoSubtitle}
              />

              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-5">
                <article
                  className={cn(
                    "md:col-span-3 rounded-3xl border border-border/70 bg-gradient-to-br from-card to-card/50 p-6 sm:p-8",
                    "shadow-sm hover:shadow-md transition-shadow duration-300"
                  )}
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                    <QrCode className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{lp.bento1Title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{lp.bento1Body}</p>
                </article>
                <article
                  className={cn(
                    "md:col-span-3 rounded-3xl border border-border/70 bg-gradient-to-br from-card to-card/50 p-6 sm:p-8",
                    "shadow-sm hover:shadow-md transition-shadow duration-300"
                  )}
                >
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5">
                    <WifiOff className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{lp.bento2Title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{lp.bento2Body}</p>
                </article>
                <article className="md:col-span-2 rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/20 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
                    <Bell className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1.5">{lp.bento3Title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{lp.bento3Body}</p>
                </article>
                <article className="md:col-span-2 rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/20 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1.5">{lp.bento4Title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{lp.bento4Body}</p>
                </article>
                <article className="md:col-span-2 rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/20 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                    <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1.5">{lp.bento5Title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{lp.bento5Body}</p>
                </article>
                <article className="md:col-span-3 rounded-2xl border border-border/60 bg-card p-6 sm:p-7 hover:border-primary/20 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
                    <Package className="w-5 h-5 text-foreground" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{lp.bento6Title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{lp.bento6Body}</p>
                </article>
                <article className="md:col-span-3 rounded-2xl border border-border/60 bg-card p-6 sm:p-7 hover:border-primary/20 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
                    <Shield className="w-5 h-5 text-foreground" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{lp.bento7Title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{lp.bento7Body}</p>
                </article>
              </div>
            </div>
          </section>

          <section
            className="py-16 md:py-24 px-4 sm:px-6 bg-muted/25 border-y border-border/50"
            aria-labelledby="how-heading"
          >
            <div className="max-w-6xl mx-auto">
              <SectionTitle
                kicker={lp.howKicker}
                id="how-heading"
                title={lp.howTitle}
                subtitle={lp.howSubtitle}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 relative">
                <div
                  className="hidden md:block absolute top-10 start-[16%] end-[16%] h-0.5 bg-border/80 -z-0"
                  aria-hidden
                />
                {howSteps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.n} className="relative z-[1] flex flex-col items-center text-center">
                      <div
                        className={cn(
                          "w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg",
                          "bg-primary text-primary-foreground"
                        )}
                      >
                        <Icon className="w-7 h-7" />
                      </div>
                      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        {t.landingPage.howStepLabel(step.n)}
                      </h3>
                      <p className="text-lg font-bold text-foreground mb-2">{step.title}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                        {step.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="py-16 md:py-24 px-4 sm:px-6" aria-labelledby="quote-heading">
            <div className="max-w-4xl mx-auto">
              <h2 id="quote-heading" className="sr-only">
                {lp.quoteHeadingSr}
              </h2>
              <div
                className={cn(
                  "relative rounded-3xl p-8 sm:p-10 md:p-12",
                  "border border-border/60 bg-card/60 backdrop-blur-sm",
                  "shadow-[0_24px_80px_-32px_rgba(0,0,0,0.25)]"
                )}
              >
                <div
                  className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/5 to-transparent pointer-events-none"
                  aria-hidden
                />
                <div className="relative">
                  <div
                    className="flex justify-center gap-0.5 mb-6"
                    role="img"
                    aria-label={lp.quoteStarsAria}
                  >
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="w-5 h-5 fill-amber-400 text-amber-400" aria-hidden />
                    ))}
                  </div>
                  <blockquote>
                    <p className="text-xl sm:text-2xl font-medium text-foreground text-balance leading-snug mb-6">
                      {lp.quoteBody}
                    </p>
                    <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <cite className="not-italic font-semibold text-foreground">
                          {lp.quoteAttribution}
                        </cite>
                        <p className="text-sm text-muted-foreground">{lp.quoteOrg}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Building2 className="w-4 h-4" aria-hidden />
                        <span>{lp.quoteMultiSite}</span>
                      </div>
                    </footer>
                  </blockquote>
                </div>
              </div>
            </div>
          </section>

          <section
            className="relative py-20 md:py-28 px-4 sm:px-6 text-primary-foreground overflow-hidden"
            aria-labelledby="final-cta"
          >
            <div className="absolute inset-0 bg-primary" aria-hidden />
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(800px 400px at 20% 20%, white 0%, transparent 50%), radial-gradient(600px 300px at 80% 80%, hsl(200 100% 70% / 0.3) 0%, transparent 55%)",
              }}
              aria-hidden
            />
            <div className="relative max-w-3xl mx-auto text-center z-[1]">
              <h2
                id="final-cta"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-balance"
              >
                {lp.finalTitle}
              </h2>
              <p className="text-primary-foreground/90 text-lg mb-10 leading-relaxed">{lp.finalBody}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {showAppCta && (
                  <Link
                    href="/"
                    className={cn(
                      "w-full sm:w-auto inline-flex items-center justify-center gap-2",
                      "rounded-2xl font-bold px-8 py-3.5 min-h-[52px] bg-background text-foreground",
                      "hover:bg-background/90 active:scale-[0.99] transition-all",
                      "shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/40"
                    )}
                  >
                    <LayoutDashboard className="w-5 h-5" />
                    {lp.finalCtaApp}
                  </Link>
                )}
                {showAuthCta && (
                  <Link
                    href="/signin"
                    className={cn(
                      "w-full sm:w-auto inline-flex items-center justify-center gap-2",
                      "rounded-2xl font-bold px-8 py-3.5 min-h-[52px] bg-background text-foreground",
                      "hover:bg-background/90 active:scale-[0.99] transition-all",
                      "shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/40"
                    )}
                  >
                    <Scan className="w-5 h-5" />
                    {lp.finalCtaSignIn}
                  </Link>
                )}
              </div>
            </div>
          </section>
        </main>
      </MarketingLayout>
    </>
  );
}
