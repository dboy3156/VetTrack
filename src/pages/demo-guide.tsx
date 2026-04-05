import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Film,
  Camera,
  Clock,
  Scissors,
  Type,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/auth-store";

interface Scene {
  id: number;
  title: string;
  timing: string;
  duration: string;
  screen: string;
  tapTarget: string;
  inputData?: string;
  expectedResult: string;
  overlayText: string;
  overlayAppears: string;
  overlayDuration: string;
  editingNotes: string;
  highlightTap?: boolean;
}

const SCENES: Scene[] = [
  {
    id: 1,
    title: "Opening — The Problem",
    timing: "0 – 7s",
    duration: "7 seconds",
    screen: "Equipment List screen (/equipment)",
    tapTarget: "Scroll the equipment list slowly — do not tap any item",
    inputData: undefined,
    expectedResult:
      "List of equipment visible. Items showing various statuses. No action taken.",
    overlayText: '"Where is the equipment?"\n"No one knows who took it"',
    overlayAppears: "1s",
    overlayDuration:
      "First line at 1s (hold 3s), second line at 4s (hold 3s)",
    editingNotes:
      "Hard cut in from black. Trim to 7s max. Both text overlays fade in — centered, top 30% of frame. Keep the scroll slow. Remove any loading spinners.",
    highlightTap: false,
  },
  {
    id: 2,
    title: "Scan QR → Check-Out",
    timing: "7 – 20s",
    duration: "13 seconds",
    screen: "Equipment List → IV Pump #3 detail page",
    tapTarget:
      '1. On the Equipment List screen, tap the "Scan QR" button (top-right, beside "+ Add")\n2. Your device camera opens — point it at the QR label on "IV Pump #3"\n3. The app navigates directly to the IV Pump #3 detail page\n4. Find the green "Available for use" banner\n5. Tap the green "Check Out" button — checkout is immediate, no form or confirm dialog\n6. Wait for the blue "Checked out by you" banner to appear',
    inputData: undefined,
    expectedResult:
      'Camera opens on "Scan QR" tap. After scanning, app navigates to IV Pump #3. The green banner is replaced by a blue "Checked out by you" banner with a "Return" button.',
    overlayText: '"Scan. Assign. Done."',
    overlayAppears: "12s",
    overlayDuration: "3 seconds",
    editingNotes:
      'Hard cut from Scene 1. Add a highlight circle on the "Scan QR" button tap. Show a quick 1–2s clip of the camera view pointing at the QR label, then cut to the detail page already loaded. Add a second highlight circle on the green "Check Out" button. Trim any transition animations. Max 13s total. Overlay appears centered at the bottom third.',
    highlightTap: true,
  },
  {
    id: 3,
    title: "Real Usage Context — Equipment in Use",
    timing: "20 – 32s",
    duration: "12 seconds",
    screen: "IV Pump #3 detail page (post-checkout state)",
    tapTarget:
      'Scroll down slowly to show the full blue "Checked out by you" banner. Optionally tap the "History" tab to show the checkout log entry.',
    inputData: undefined,
    expectedResult:
      '"Checked out by you" is clearly visible with the time since checkout. History tab (if tapped) shows a log entry.',
    overlayText: '"Now tracked. Fully accountable."',
    overlayAppears: "23s",
    overlayDuration: "4 seconds",
    editingNotes:
      "Hard cut. Pause for 2s on the checkout banner so viewers can read it. Overlay top center. Trim blank space after scroll stops. Max 12s.",
    highlightTap: false,
  },
  {
    id: 4,
    title: "Issue Reporting",
    timing: "32 – 47s",
    duration: "15 seconds",
    screen: "Monitor #2 detail page",
    tapTarget:
      '1. Navigate back to Equipment List (back arrow, top-left)\n2. Tap "Monitor #2" in the list\n3. On the detail page, tap the blue "Scan" button (top-right of the status card)\n4. In the "Scan Equipment" dialog that opens, tap the "Issue" tile (red triangle icon)\n5. In the Note field, type: "Screen flickering — needs service"\n6. Tap the camera/photo area ("Take / Upload Photo")\n7. Attach any photo from your device\n8. Tap "Update Status" to confirm',
    inputData:
      'Status: Issue\nNote: "Screen flickering — needs service"\nPhoto: attach any photo from device',
    expectedResult:
      'Dialog closes. Monitor #2 detail page now shows a red "Issue" status badge. The status card turns red. A new scan log entry appears in the History tab with the note and photo.',
    overlayText: '"Clear issue reporting. No guesswork."',
    overlayAppears: "44s",
    overlayDuration: "3 seconds",
    editingNotes:
      'Hard cut. Add highlight circles on: the "Scan" button, the "Issue" tile in the dialog, the photo area tap, and the "Update Status" button. Speed up the note-typing slightly. Trim loading time after submit. Max 15s. Overlay bottom center.',
    highlightTap: true,
  },
  {
    id: 5,
    title: "Alerts",
    timing: "47 – 57s",
    duration: "10 seconds",
    screen: "Alerts screen (/alerts)",
    tapTarget:
      '1. Tap "Alerts" in the bottom navigation bar\n2. Find the CRITICAL section — "Monitor #2 — Active Issue" alert\n3. Tap the "I\'m handling this" text button at the bottom of the alert card',
    inputData: undefined,
    expectedResult:
      'The "I\'m handling this" button is replaced by a green "Handling: [your email]" confirmation row inside the alert card.',
    overlayText: '"No missed problems. No duplicates."',
    overlayAppears: "54s",
    overlayDuration: "3 seconds",
    editingNotes:
      'Hard cut. Scroll to CRITICAL section if needed. Add a highlight circle on "I\'m handling this". Cut immediately after the green confirmation row appears. Max 10s. Overlay top center.',
    highlightTap: true,
  },
  {
    id: 6,
    title: "My Equipment",
    timing: "57 – 65s",
    duration: "8 seconds",
    screen: "My Equipment screen (/my-equipment)",
    tapTarget:
      '1. Tap "Mine" in the bottom navigation bar\n2. Scroll slowly down the list — "IV Pump #3" and "Cardiac Monitor" should be visible with their locations and checkout times',
    inputData: undefined,
    expectedResult:
      'List shows at least "IV Pump #3" with an ICU/location badge and time since checkout.',
    overlayText: '"Full accountability per shift"',
    overlayAppears: "59s",
    overlayDuration: "4 seconds",
    editingNotes:
      "Hard cut. No taps needed — slow scroll down the list showing 2–3 items. Pause 1.5s after scroll. Overlay centered. Max 8s.",
    highlightTap: false,
  },
  {
    id: 7,
    title: "Return Flow",
    timing: "65 – 75s",
    duration: "10 seconds",
    screen: "My Equipment screen (/my-equipment)",
    tapTarget:
      '1. While still on "My Equipment", find "IV Pump #3"\n2. Tap the "Return" button (outlined, on the right of the IV Pump #3 row)\n3. Button shows a spinner briefly, then the item disappears from the list',
    inputData: undefined,
    expectedResult:
      '"Returned — equipment is now available" success toast appears at the bottom of the screen. IV Pump #3 is removed from the list.',
    overlayText: '"Everything goes back"',
    overlayAppears: "72s",
    overlayDuration: "3 seconds",
    editingNotes:
      'Hard cut. Add a highlight circle on the "Return" button. Trim the undo countdown toast — cut right after the success message. Max 10s. Overlay bottom center.',
    highlightTap: true,
  },
  {
    id: 8,
    title: "Ending — Closing Shot",
    timing: "75 – 80s",
    duration: "5 seconds",
    screen: "Home / Dashboard screen (/)",
    tapTarget:
      '1. Tap "Home" in the bottom navigation bar\n2. Hold still — no taps needed',
    inputData: undefined,
    expectedResult:
      "Clean dashboard visible. Equipment count, status summary, minimal or zero active alerts.",
    overlayText: '"Nothing gets lost."',
    overlayAppears: "76s",
    overlayDuration: "4 seconds",
    editingNotes:
      "Hard cut from Scene 7. Hold 5s on the dashboard. Overlay text large and centered — bold. Fade to black on the very last second. This is the only fade-out in the entire video.",
    highlightTap: false,
  },
];

const DEMO_EQUIPMENT = [
  { name: "IV Pump #3", location: "ICU", status: "ok" },
  { name: "Monitor #2", location: "Room 4", status: "issue" },
  { name: "Cardiac Monitor", location: "ICU", status: "ok (checked out)" },
  { name: "Ventilator #1", location: "Surgery", status: "ok" },
];

export default function DemoGuidePage() {
  const [expanded, setExpanded] = useState<number | null>(1);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  function toggleScene(id: number) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  async function seedDemoData() {
    setSeeding(true);
    try {
      const res = await fetch("/api/demo-seed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data: { message?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Seed failed");
      setSeeded(true);
      toast.success(data.message ?? "Demo data seeded successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to seed demo data";
      toast.error(message);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6 pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Film className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Demo Video Recording Guide</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            60–90 second screen-recorded demo for VetTrack. Follow each scene exactly in order.
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-3 text-center">
              <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xs font-semibold text-blue-700">Total Duration</p>
              <p className="text-lg font-bold text-blue-800">~80s</p>
            </CardContent>
          </Card>
          <Card className="border-violet-200 bg-violet-50">
            <CardContent className="p-3 text-center">
              <Camera className="w-5 h-5 text-violet-600 mx-auto mb-1" />
              <p className="text-xs font-semibold text-violet-700">Scenes</p>
              <p className="text-lg font-bold text-violet-800">8</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-3 text-center">
              <Scissors className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-xs font-semibold text-emerald-700">Cuts</p>
              <p className="text-lg font-bold text-emerald-800">Hard</p>
            </CardContent>
          </Card>
        </div>

        {/* Setup: Seed Demo Data */}
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-amber-800 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Step 0 — Seed Demo Data First
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-amber-700 mb-3">
              Before recording, make sure the app has the correct demo equipment loaded. Click below
              to add all required items to the database (skips any already present).
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {DEMO_EQUIPMENT.map((item) => (
                <Badge
                  key={item.name}
                  variant="outline"
                  className="border-amber-300 text-amber-800 text-xs"
                >
                  {item.name} — {item.location}
                </Badge>
              ))}
            </div>
            <Button
              size="sm"
              onClick={seedDemoData}
              disabled={seeding || seeded}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {seeding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Seeding…
                </>
              ) : seeded ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Demo Data Ready
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5 mr-1.5" />
                  Seed Demo Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recording Setup */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Recording Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-600 space-y-1">
            <p>• Record from a mobile device (preferred) or browser — use screen recording</p>
            <p>
              • Log in as:{" "}
              <span className="font-mono bg-slate-100 px-1 rounded">demo@vettrack.dev</span>
            </p>
            <p>• Keep UI clean: close other apps, dismiss notifications, full screen</p>
            <p>• Practice each scene once before recording</p>
            <p>
              • Transitions: <strong>hard cuts only</strong> (no wipes or fades between scenes)
            </p>
            <p>
              • Tap highlights: add a subtle orange circle in post for every deliberate tap (any
              screen recorder tap indicator works)
            </p>
          </CardContent>
        </Card>

        {/* Scenes */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            Scene-by-Scene Plan
          </h2>

          {SCENES.map((scene) => (
            <Card
              key={scene.id}
              className="border"
              style={{
                borderColor:
                  scene.id <= 2
                    ? "#dbeafe"
                    : scene.id <= 4
                    ? "#ede9fe"
                    : scene.id <= 6
                    ? "#d1fae5"
                    : "#fef3c7",
              }}
            >
              <button className="w-full text-left" onClick={() => toggleScene(scene.id)}>
                <CardContent className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {scene.id}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{scene.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {scene.timing}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{scene.duration}</span>
                      </div>
                    </div>
                  </div>
                  {expanded === scene.id ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </CardContent>
              </button>

              {expanded === scene.id && (
                <div className="border-t px-3.5 pb-3.5 pt-3 flex flex-col gap-3">
                  {/* Screen */}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">
                      Screen
                    </p>
                    <p className="text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                      {scene.screen}
                    </p>
                  </div>

                  {/* Tap Targets */}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1 flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      Exact Taps / Actions
                      {scene.highlightTap && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 border-orange-300 text-orange-600"
                        >
                          Add highlight circle
                        </Badge>
                      )}
                    </p>
                    <pre className="text-xs bg-blue-50 rounded-lg px-3 py-2 border border-blue-200 whitespace-pre-wrap font-sans">
                      {scene.tapTarget}
                    </pre>
                  </div>

                  {/* Input Data */}
                  {scene.inputData && (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">
                        Data to Enter
                      </p>
                      <pre className="text-xs bg-violet-50 rounded-lg px-3 py-2 border border-violet-200 whitespace-pre-wrap font-sans">
                        {scene.inputData}
                      </pre>
                    </div>
                  )}

                  {/* Expected Result */}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">
                      Expected Result on Screen
                    </p>
                    <p className="text-xs bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
                      {scene.expectedResult}
                    </p>
                  </div>

                  {/* Text Overlay */}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1 flex items-center gap-1">
                      <Type className="w-3 h-3" />
                      Text Overlay
                    </p>
                    <div className="bg-gray-900 rounded-lg px-3 py-2 border border-gray-700">
                      <pre className="text-xs text-white whitespace-pre-wrap font-sans">
                        {scene.overlayText}
                      </pre>
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        Appears at: <span className="text-gray-200">{scene.overlayAppears}</span>{" "}
                        — Duration: <span className="text-gray-200">{scene.overlayDuration}</span>
                      </p>
                    </div>
                  </div>

                  {/* Editing Notes */}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1 flex items-center gap-1">
                      <Scissors className="w-3 h-3" />
                      Editing Instructions
                    </p>
                    <p className="text-xs bg-amber-50 rounded-lg px-3 py-2 border border-amber-200 leading-relaxed">
                      {scene.editingNotes}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Global Editing Rules */}
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Global Editing Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-700 space-y-1.5">
            <p>
              • <strong>All cuts are hard cuts</strong> — no wipes, no cross-dissolves between
              scenes
            </p>
            <p>
              • <strong>Remove all dead time:</strong> loading spinners, hesitations, navigation
              delays
            </p>
            <p>
              • <strong>Tap highlights:</strong> use a subtle orange circle (30–40px) on every
              deliberate tap
            </p>
            <p>
              • <strong>Text overlays:</strong> white text, bold weight, centered horizontally. Use
              top or bottom third — never over the main UI element being demonstrated
            </p>
            <p>
              • <strong>No voiceover</strong> — overlays only
            </p>
            <p>
              • <strong>No background music</strong> required (optional: low ambient)
            </p>
            <p>
              • <strong>Fade to black</strong> on the very last frame only (Scene 8)
            </p>
            <p>
              • <strong>Total target:</strong> 75–82 seconds. Do not exceed 90 seconds
            </p>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Pre-Recording Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-emerald-800 space-y-1">
            <p>
              ☐ Demo data seeded (IV Pump #3, Monitor #2, Cardiac Monitor, Ventilator #1)
            </p>
            <p>☐ Monitor #2 has status "Issue" with note pre-populated from seed</p>
            <p>☐ Logged in as demo@vettrack.dev</p>
            <p>☐ Screen recording started, notifications silenced</p>
            <p>☐ Ran through all 8 scenes once as a dry run</p>
            <p>
              ☐ IV Pump #3 visible near the top of the Equipment List (available / not checked out)
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
