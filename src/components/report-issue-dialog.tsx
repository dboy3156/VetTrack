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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SupportTicketSeverity>("medium");

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
      toast.success("Issue reported. Thank you!");
      setTitle("");
      setDescription("");
      setSeverity("medium");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to submit issue. Please try again.");
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
            Report an Issue
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              placeholder="Brief summary of the issue"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-issue-title"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea
              id="issue-description"
              placeholder="Describe what happened and what you expected..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-issue-description"
              rows={4}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-severity">Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as SupportTicketSeverity)}>
              <SelectTrigger id="issue-severity" data-testid="select-issue-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low — Minor inconvenience</SelectItem>
                <SelectItem value="medium">Medium — Affects workflow</SelectItem>
                <SelectItem value="high">High — Blocking issue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {email && (
            <p className="text-xs text-muted-foreground">
              Submitting as <span className="font-medium">{email}</span>
            </p>
          )}
          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitMut.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !description.trim() || submitMut.isPending}
              data-testid="btn-submit-issue"
            >
              {submitMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
