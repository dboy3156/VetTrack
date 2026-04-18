import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BatteryWarning, Plug } from "lucide-react";

interface ReturnPlugDialogProps {
  open: boolean;
  equipmentName?: string;
  pending?: boolean;
  isSubmitting?: boolean;
  defaultDeadlineMinutes?: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: { isPluggedIn: boolean; plugInDeadlineMinutes?: number }) => void;
}

const DEFAULT_DEADLINE_MINUTES = 30;

export function ReturnPlugDialog({
  open,
  equipmentName,
  pending = false,
  isSubmitting = false,
  defaultDeadlineMinutes = DEFAULT_DEADLINE_MINUTES,
  onOpenChange,
  onConfirm,
}: ReturnPlugDialogProps) {
  const isBusy = pending || isSubmitting;
  const [isPluggedIn, setIsPluggedIn] = useState(false);
  const [deadlineMinutes, setDeadlineMinutes] = useState(defaultDeadlineMinutes);

  function handleConfirm() {
    const normalizedDeadline = Math.max(
      1,
      Math.min(1440, Number.isFinite(deadlineMinutes) ? deadlineMinutes : defaultDeadlineMinutes),
    );
    onConfirm({
      isPluggedIn,
      ...(isPluggedIn ? {} : { plugInDeadlineMinutes: normalizedDeadline }),
    });
  }

  function resetState(nextOpen: boolean) {
    if (!nextOpen) {
      setIsPluggedIn(false);
      setDeadlineMinutes(defaultDeadlineMinutes);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={resetState}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>החזרת ציוד</DialogTitle>
          <DialogDescription>
            {equipmentName ? `האם "${equipmentName}" חובר לחשמל לאחר ההחזרה?` : "האם הציוד חובר לחשמל לאחר ההחזרה?"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={isPluggedIn ? "default" : "outline"}
              className="h-11 gap-2"
              onClick={() => setIsPluggedIn(true)}
              disabled={isBusy}
              data-testid="btn-plugged-yes"
            >
              <Plug className="h-4 w-4" />
              חובר לחשמל
            </Button>
            <Button
              type="button"
              variant={!isPluggedIn ? "default" : "outline"}
              className="h-11 gap-2"
              onClick={() => setIsPluggedIn(false)}
              disabled={isBusy}
              data-testid="btn-plugged-no"
            >
              <BatteryWarning className="h-4 w-4" />
              לא חובר
            </Button>
          </div>

          {!isPluggedIn && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" data-testid="return-plug-warning">
              התראה תישלח לאחר {deadlineMinutes} דקות אם לא יחובר
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="plugInDeadlineMinutes">דדליין התראה (בדקות)</Label>
            <Input
              id="plugInDeadlineMinutes"
              type="number"
              min={1}
              max={1440}
              value={deadlineMinutes}
              onChange={(event) =>
                setDeadlineMinutes(parseInt(event.target.value || `${defaultDeadlineMinutes}`, 10))
              }
              disabled={isBusy}
              data-testid="input-plug-deadline"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => resetState(false)} disabled={isBusy}>
            ביטול
          </Button>
          <Button onClick={handleConfirm} disabled={isBusy} data-testid="btn-confirm-return-plug">
            אישור החזרה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
