import { Layout } from "@/components/layout";
import { Helmet } from "react-helmet-async";
import {
  QrCode,
  LogIn,
  LogOut,
  AlertTriangle,
  BellRing,
  Radar,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  XCircle,
  Nfc,
  Droplets,
  Wrench,
  Package,
  HelpCircle,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface CheatItemProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}

function CheatItem({ icon: Icon, iconBg, iconColor, title, description }: CheatItemProps) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden">
      <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground px-4 pt-4 pb-1">
        {title}
      </p>
      <div className="px-4 pb-1">{children}</div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Layout>
      <Helmet>
        <title>Quick Guide — VetTrack</title>
      </Helmet>

      <div className="flex flex-col gap-5 pb-20 animate-fade-in">
        {/* Header */}
        <div className="flex items-start gap-3 pt-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Quick Guide</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Everything you need to know to use VetTrack</p>
          </div>
        </div>

        {/* Daily tasks */}
        <Section title="Daily Tasks">
          <CheatItem
            icon={QrCode}
            iconBg="bg-blue-50 dark:bg-blue-950/50"
            iconColor="text-blue-600 dark:text-blue-400"
            title="Scan a QR code"
            description="Tap the blue Scan button (bottom centre) to scan any piece of equipment. Instantly loads its status and history."
          />
          <CheatItem
            icon={LogIn}
            iconBg="bg-indigo-50 dark:bg-indigo-950/50"
            iconColor="text-indigo-600 dark:text-indigo-400"
            title="Check out equipment"
            description="Open an item → tap 'Check Out'. Your name appears on the item so the team knows who has it."
          />
          <CheatItem
            icon={LogOut}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="Return equipment"
            description="Open the item you checked out → tap 'Return'. Clears your name and marks it available."
          />
          <CheatItem
            icon={AlertTriangle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="Report an issue"
            description="Found broken gear? Open the item → tap 'Issue'. The team gets notified immediately. You can also use the menu → Report Issue."
          />
        </Section>

        {/* Status badges */}
        <Section title="Equipment Status">
          <CheatItem
            icon={CheckCircle2}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="OK — operational"
            description="Equipment has been scanned and is ready for use."
          />
          <CheatItem
            icon={Droplets}
            iconBg="bg-teal-50 dark:bg-teal-950/50"
            iconColor="text-teal-600 dark:text-teal-400"
            title="Sterilized — cleaned and ready"
            description="Item has been sterilized. Will alert when the sterilization window expires."
          />
          <CheatItem
            icon={Wrench}
            iconBg="bg-amber-50 dark:bg-amber-950/50"
            iconColor="text-amber-600 dark:text-amber-400"
            title="Maintenance — needs attention"
            description="Logged for maintenance. Check with your admin before using."
          />
          <CheatItem
            icon={AlertTriangle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="Issue — do not use"
            description="A fault has been reported. Item should not be used until cleared."
          />
          <CheatItem
            icon={Package}
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            title="Inactive — out of service"
            description="Item is decommissioned or temporarily removed from service."
          />
        </Section>

        {/* Asset Radar */}
        <Section title="Asset Radar">
          <CheatItem
            icon={Radar}
            iconBg="bg-blue-50 dark:bg-blue-950/50"
            iconColor="text-blue-600 dark:text-blue-400"
            title="Health Ring"
            description="The coloured ring on each room card shows the percentage of items verified in the last 24 hours. Green ≥ 80%, Amber ≥ 40%, Red < 40%."
          />
          <CheatItem
            icon={CheckCircle2}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="Synced"
            description="All items in this room have been verified within the last 24 hours."
          />
          <CheatItem
            icon={Clock}
            iconBg="bg-amber-50 dark:bg-amber-950/50"
            iconColor="text-amber-600 dark:text-amber-400"
            title="Stale"
            description="The room has not been audited in over 24 hours. Tap the room to verify items."
          />
          <CheatItem
            icon={AlertTriangle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="Needs Audit"
            description="An item in this room has been flagged. A full audit is required before the room can be cleared."
          />
          <CheatItem
            icon={Nfc}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            title="NFC door sticker"
            description="Tap the NFC sticker on the room door to instantly open the verification overlay. Confirm to mark all items as verified in one tap."
          />
        </Section>

        {/* Sync indicator */}
        <Section title="Sync Indicator (top header)">
          <CheatItem
            icon={Clock}
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            title="Pending"
            description="Your action was saved locally and is waiting to be sent to the server. This happens when offline. It will sync automatically when you reconnect."
          />
          <CheatItem
            icon={CheckCircle2}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="Synced"
            description="All changes have been successfully saved to the server. Everything is up to date."
          />
          <CheatItem
            icon={XCircle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="Failed"
            description="An action could not be synced after several attempts. Tap the cloud icon to view failed items and retry."
          />
          <CheatItem
            icon={WifiOff}
            iconBg="bg-amber-50 dark:bg-amber-950/50"
            iconColor="text-amber-600 dark:text-amber-400"
            title="Offline"
            description="No internet connection. The app keeps working — all changes are queued and synced automatically when you reconnect."
          />
        </Section>

        {/* Alerts */}
        <Section title="Alerts">
          <CheatItem
            icon={BellRing}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="Active alerts"
            description="The red badge on the bell icon shows how many items need attention. Tap to view and acknowledge alerts."
          />
          <CheatItem
            icon={Wifi}
            iconBg="bg-blue-50 dark:bg-blue-950/50"
            iconColor="text-blue-600 dark:text-blue-400"
            title="Push notifications"
            description="Enable push notifications in Settings → Push Notifications to receive real-time alerts even when the app is in the background."
          />
        </Section>

        <div className="text-center pt-2 pb-4">
          <Link href="/">
            <Button variant="outline" className="gap-2 h-11">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
