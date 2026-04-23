import { Layout } from "@/components/layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, Film, Share2 } from "lucide-react";
import { useState } from "react";

const APP_TOUR_VIDEO_FILENAME = "copy_7E88749A-28D9-4306-9CB2-807CF4452369 (1).mp4";
const ENCODED_VIDEO_FILENAME = encodeURIComponent(APP_TOUR_VIDEO_FILENAME);
const APP_TOUR_VIDEO_SOURCES = [
  `/videos/${ENCODED_VIDEO_FILENAME}`,
  `/assets/${ENCODED_VIDEO_FILENAME}`,
  `/${ENCODED_VIDEO_FILENAME}`,
];
const APP_TOUR_FILENAME = "vettrack-app-tour.mp4";

export default function AppTourPage() {
  const [activeSourcePath, setActiveSourcePath] = useState(APP_TOUR_VIDEO_SOURCES[0]);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);

  function toAbsoluteUrl(path: string): string {
    return new URL(path, window.location.origin).toString();
  }

  function normalizePath(source: string): string {
    try {
      const url = new URL(source);
      return `${url.pathname}${url.search}`;
    } catch {
      return source;
    }
  }

  function getDownloadSource(): string {
    return activeSourcePath || APP_TOUR_VIDEO_SOURCES[0];
  }

  async function downloadTourVideo(): Promise<void> {
    try {
      const response = await fetch(getDownloadSource(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`failed to load video: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = APP_TOUR_FILENAME;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("הורדת הסרטון התחילה");
    } catch (error) {
      console.error("Failed to download app tour video", error);
      toast.error("לא הצלחנו להוריד את הסרטון. נסה שוב.");
    }
  }

  async function shareTourVideo(): Promise<void> {
    try {
      if (!navigator.share) {
        toast.error("שיתוף לא זמין במכשיר הזה");
        return;
      }
      await navigator.share({
        title: "סיור באפליקציה VetTrack",
        text: "לצפייה בסיור באפליקציה:",
        url: toAbsoluteUrl(getDownloadSource()),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to share app tour video link", error);
      toast.error("השיתוף נכשל. נסה שוב.");
    }
  }

  return (
    <Layout>
      <Helmet>
        <title>סיור באפליקציה — VetTrack</title>
      </Helmet>
      <div className="flex flex-col gap-4 pb-20">
        <div className="pt-1">
          <h1 className="text-2xl font-bold text-foreground">סיור באפליקציה</h1>
          <p className="text-sm text-muted-foreground mt-1">
            סרטון הדרכה קצר לצוות החדש, כולל אפשרות הורדה לנייד.
          </p>
        </div>

        <Card className="border-border/70">
          <CardContent className="p-4 space-y-4">
            <div className="rounded-xl overflow-hidden border border-border/60 bg-black aspect-video">
              <video
                controls
                playsInline
                preload="metadata"
                className="w-full h-full"
                onLoadedMetadata={(event) => {
                  setVideoLoadFailed(false);
                  setActiveSourcePath(normalizePath(event.currentTarget.currentSrc));
                }}
                onError={() => {
                  setVideoLoadFailed(true);
                }}
                data-testid="app-tour-video"
              >
                {APP_TOUR_VIDEO_SOURCES.map((sourcePath) => (
                  <source key={sourcePath} src={sourcePath} type="video/mp4" />
                ))}
              </video>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="gap-2 min-h-[44px]"
                onClick={() => {
                  void downloadTourVideo();
                }}
                data-testid="app-tour-download"
              >
                <Download className="w-4 h-4" />
                הורד סרטון
              </Button>

              <Button
                variant="outline"
                className="gap-2 min-h-[44px]"
                onClick={() => {
                  void shareTourVideo();
                }}
                data-testid="app-tour-share"
              >
                <Share2 className="w-4 h-4" />
                שתף קישור
              </Button>
            </div>

            {videoLoadFailed && (
              <p className="text-xs text-destructive">
                לא נמצאה וידאו. יש להעלות את הקובץ לשביל: `/public/videos`, `/public/assets`, או `/public`.
              </p>
            )}

            <p className="text-xs text-muted-foreground">הקישור הישיר להורדה: {toAbsoluteUrl(getDownloadSource())}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Film className="w-4 h-4 text-primary mt-0.5" />
              <p className="text-sm text-muted-foreground">
                אם השיתוף לא נפתח אוטומטית, השתמש בכפתור <span className="font-medium text-foreground">הורד סרטון</span> ואז שתף מגלריית הקבצים.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
