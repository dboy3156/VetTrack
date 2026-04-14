import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout";

export default function WhatsNewPage() {
  return (
    <Layout>
      <Helmet>
        <title>What's New — VetTrack</title>
      </Helmet>

      <div className="max-w-2xl space-y-4 animate-fade-in">
        <h1 className="text-2xl font-bold">What&apos;s New</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re viewing the latest VetTrack updates.
        </p>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-sm">
            Release notes will appear here in a future update.
          </p>
        </div>
      </div>
    </Layout>
  );
}
