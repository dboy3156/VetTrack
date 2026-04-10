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
        <Section title="משימות יומיות">
          <CheatItem
            icon={QrCode}
            iconBg="bg-blue-50 dark:bg-blue-950/50"
            iconColor="text-blue-600 dark:text-blue-400"
            title="סרוק קוד QR"
            description="לחץ על כפתור הסריקה הכחול בתחתית המסך לסריקת ציוד. טוען מיד את הסטטוס וההיסטוריה."
          />
          <CheatItem
            icon={LogIn}
            iconBg="bg-indigo-50 dark:bg-indigo-950/50"
            iconColor="text-indigo-600 dark:text-indigo-400"
            title="הוצאת ציוד לשימוש"
            description="פתח פריט ← לחץ 'הוצא לשימוש'. שמך יופיע על הפריט כדי שהצוות ידע מי מחזיק בו."
          />
          <CheatItem
            icon={LogOut}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="החזרת ציוד"
            description="פתח את הפריט שלקחת ← לחץ 'החזר'. מסיר את שמך ומסמן כזמין."
          />
          <CheatItem
            icon={AlertTriangle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="דיווח על תקלה"
            description="מצאת ציוד פגום? פתח פריט ← לחץ 'תקלה'. הצוות מקבל התראה מיידית."
          />
        </Section>

        {/* Status badges */}
        <Section title="סטטוס ציוד">
          <CheatItem
            icon={CheckCircle2}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="OK — operational"
            description="הציוד נסרק ומוכן לשימוש."
          />
          <CheatItem
            icon={Droplets}
            iconBg="bg-teal-50 dark:bg-teal-950/50"
            iconColor="text-teal-600 dark:text-teal-400"
            title="עבר חיטוי — נקי ומוכן"
            description="הפריט עבר חיטוי. יתריע כשחלון החיטוי יפוג."
          />
          <CheatItem
            icon={Wrench}
            iconBg="bg-amber-50 dark:bg-amber-950/50"
            iconColor="text-amber-600 dark:text-amber-400"
            title="תחזוקה — נדרש טיפול"
            description="מסומן לתחזוקה. בדוק עם האדמין לפני שימוש."
          />
          <CheatItem
            icon={AlertTriangle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="תקלה — אין להשתמש"
            description="A fault has been reported. Item should not be used until cleared."
          />
          <CheatItem
            icon={Package}
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            title="לא פעיל — מחוץ לשירות"
            description="הפריט הוצא משירות זמנית או לצמיתות."
          />
        </Section>

        {/* Asset Radar */}
        <Section title="רדאר ציוד">
          <CheatItem
            icon={Radar}
            iconBg="bg-blue-50 dark:bg-blue-950/50"
            iconColor="text-blue-600 dark:text-blue-400"
            title="טבעת בריאות"
            description="הטבעת הצבעונית על כל כרטיס חדר מציגה את אחוז הפריטים שאומתו ב-24 שעות האחרונות. ירוק ≥ 80%, כתום ≥ 40%, אדום < 40%."
          />
          <CheatItem
            icon={CheckCircle2}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="מסונכרן"
            description="כל הפריטים בחדר זה אומתו ב-24 שעות האחרונות."
          />
          <CheatItem
            icon={Clock}
            iconBg="bg-amber-50 dark:bg-amber-950/50"
            iconColor="text-amber-600 dark:text-amber-400"
            title="לא עדכני"
            description="החדר לא נבדק ביותר מ-24 שעות. לחץ על החדר לאימות פריטים."
          />
          <CheatItem
            icon={AlertTriangle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="נדרש ביקורת"
            description="פריט בחדר זה סומן. נדרשת ביקורת מלאה לפני שהחדר יוכל להיות נקי."
          />
          <CheatItem
            icon={Nfc}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            title="NFC door sticker"
            description="לחץ על מדבקת NFC בדלת החדר לפתיחת מסך האימות. אשר לסמן את כל הפריטים כמאומתים בלחיצה אחת."
          />
        </Section>

        {/* Sync indicator */}
        <Section title="מחוון סנכרון (כותרת עליונה)">
          <CheatItem
            icon={Clock}
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            title="ממתין"
            description="הפעולה נשמרה מקומית וממתינה לשליחה לשרת. קורה כשאתה לא מחובר. יסתנכרן אוטומטית כשתתחבר."
          />
          <CheatItem
            icon={CheckCircle2}
            iconBg="bg-emerald-50 dark:bg-emerald-950/50"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="Synced"
            description="כל השינויים נשמרו בשרת בהצלחה. הכל עדכני."
          />
          <CheatItem
            icon={XCircle}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="נכשל"
            description="פעולה לא הצליחה להסתנכרן לאחר מספר ניסיונות. לחץ על אייקון הענן לצפייה ולניסיון חוזר."
          />
          <CheatItem
            icon={WifiOff}
            iconBg="bg-amber-50 dark:bg-amber-950/50"
            iconColor="text-amber-600 dark:text-amber-400"
            title="לא מחובר"
            description="אין חיבור לאינטרנט. האפליקציה ממשיכה לעבוד — כל השינויים בתור ויסונכרנו אוטומטית."
          />
        </Section>

        {/* Alerts */}
        <Section title="התראות">
          <CheatItem
            icon={BellRing}
            iconBg="bg-red-50 dark:bg-red-950/50"
            iconColor="text-red-600 dark:text-red-400"
            title="התראות פעילות"
            description="התג האדום על אייקון הפעמון מציג כמה פריטים דורשים תשומת לב. לחץ לצפייה ואישור."
          />
          <CheatItem
            icon={Wifi}
            iconBg="bg-blue-50 dark:bg-blue-950/50"
            iconColor="text-blue-600 dark:text-blue-400"
            title="התראות Push"
            description="אפשר התראות Push בהגדרות → התראות Push לקבלת התראות בזמן אמת גם כשהאפליקציה ברקע."
          />
        </Section>

        <div className="text-center pt-2 pb-4">
          <Link href="/">
            <Button variant="outline" className="gap-2 h-11">
              חזרה ללוח הבקרה
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
