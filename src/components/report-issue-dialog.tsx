import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Bug } from "lucide-react";
import { toast } from "sonner";
import type { SupportTicketSeverity } from "@/types";

interface ReportIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportIssueDialog({ open, onOpenChange }: ReportIssueDialogProps) {
  const { email } = useAuth();
  const [title, setכותרת] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setחומרה] = useState<SupportTicketSeverity>("medium");

  const submitMut = useMutation({
    mutationFn: () =>
      api.support.create({
        title,
        description,
        severity,
        pageUrl: window.location.href,
        deviceInfo: navigator.userAgent,
        appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined,
      }),
    onSuccess: () => {
      toast.success("התקלה דווחה. תודה!");
      setכותרת("");
      setDescription("");
      setחומרה("medium");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("שליחת הדיווח נכשלה. נא לנסות שוב.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    submitMut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="w-4 h-4 text-primary" />
            דיווח על תקלה
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-title">כותרת</Label>
            <Input
              id="issue-title"
              placeholder="תיאור קצר של התקלה"
              value={title}
              onChange={(e) => setכותרת(e.target.value)}
              data-testid="input-issue-title"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-description">פירוט התקלה</Label>
            <Textarea
              id="issue-description"
              placeholder="תאר מה קרה ומה ציפית שיקרה..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-issue-description"
              rows={4}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-severity">חומרה</Label>
            <Select value={severity} onValueChange={(v) => setחומרה(v as SupportTicketSeverity)}>
              <SelectTrigger id="issue-severity" data-testid="select-issue-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">נמוכה — חוסר נוחות קל</SelectItem>
                <SelectItem value="medium">בינונית — משפיע על העבודה</SelectItem>
                <SelectItem value="high">גבוהה — תקלה חוסמת עבודה</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {email && (
            <p className="text-xs text-muted-foreground">
              שלח דיווחting as <span className="font-medium">{email}</span>
            </p>
          )}
          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitMut.isPending}
            >
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !description.trim() || submitMut.isPending}
              data-testid="btn-submit-issue"
            >
              {submitMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              שלח דיווח
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
