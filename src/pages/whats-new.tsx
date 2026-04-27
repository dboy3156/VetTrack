import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bell,
  Shield,
  Users,
  Clock,
  Smartphone,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

interface ReleaseEntry {
  version: string;
  date: string;
  highlights: {
    icon: React.ReactNode;
    title: string;
    description: string;
    badge?: { label: string; variant: "default" | "secondary" | "outline" };
  }[];
}

const releases: ReleaseEntry[] = [
  {
    version: "1.1.0",
    date: "April 2026",
    highlights: [
      {
        icon: <Bell className="w-5 h-5 text-primary" />,
        title: "Smart Notifications",
        description:
          "Push notifications for return reminders, team overdue alerts (senior technicians), and admin hourly summaries — all configurable per role in Settings.",
        badge: { label: "New", variant: "default" },
      },
      {
        icon: <Shield className="w-5 h-5 text-primary" />,
        title: "Shift-Aware Roles",
        description:
          "Your effective role now follows your active shift. Permissions, notifications, and dashboard context all adapt automatically when you're on shift.",
        badge: { label: "New", variant: "default" },
      },
      {
        icon: <Smartphone className="w-5 h-5 text-primary" />,
        title: "Browser Push Notifications",
        description:
          "Subscribe to push notifications directly from your browser. Granular toggles let you control which alerts you receive — return reminders, team updates, or admin digests.",
        badge: { label: "New", variant: "default" },
      },
      {
        icon: <Clock className="w-5 h-5 text-primary" />,
        title: "Scheduled Return Reminders",
        description:
          "When equipment is checked out with a return time, the system automatically sends a push reminder when it's due. Reminders are cancelled if the item is returned early.",
      },
      {
        icon: <Users className="w-5 h-5 text-primary" />,
        title: "Admin User Management",
        description:
          "Paginated user list with filters for pending, active, and blocked users. Approve or reject sign-ups, change roles, and manage user status — all from the Admin panel.",
      },
      {
        icon: <RefreshCw className="w-5 h-5 text-primary" />,
        title: "Auto-Update Banner",
        description:
          "A banner appears when a new VetTrack version is deployed, linking straight to this page. Service worker updates prompt a one-click refresh.",
      },
    ],
  },
];

export default function WhatsNewPage() {
  return (
    <Layout>
      <Helmet>
        <title>What&apos;s New — VetTrack</title>
      </Helmet>

      <div className="max-w-2xl space-y-6 animate-fade-in">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">What&apos;s New</h1>
          <p className="text-sm text-muted-foreground">
            The latest VetTrack features and improvements.
          </p>
        </div>

        {releases.map((release) => (
          <section key={release.version} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                v{release.version}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {release.date}
              </span>
            </div>

            <div className="space-y-3">
              {release.highlights.map((item) => (
                <Card
                  key={item.title}
                  className="border-border/60 transition-colors hover:border-border"
                >
                  <CardHeader className="pb-1">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="flex items-center gap-2 flex-wrap">
                          {item.title}
                          {item.badge && (
                            <Badge
                              variant={item.badge.variant}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {item.badge.label}
                            </Badge>
                          )}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="ps-12">
                    <CardDescription>{item.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}

        <div className="pt-2 pb-4">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2"
          >
            Configure notifications in Settings
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </Layout>
  );
}
