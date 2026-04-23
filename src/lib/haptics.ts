/**
 * Haptic feedback vocabulary for VetTrack.
 * Each pattern is a Vibration API sequence: [duration, pause, duration, ...]
 * All calls are no-ops on unsupported devices.
 */
import { triggerVibration } from "@/lib/safe-browser";

function vibrate(pattern: VibratePattern) {
  triggerVibration(pattern, {
    // Haptics should only respond to direct user intent.
    requireUserActivation: true,
    silent: true,
  });
}

export const haptics = {
  /** Barely-there tap — confirms a UI press */
  tap: () => vibrate([8]),

  /** Double-pulse "confirmed" — successful QR/NFC scan */
  scanSuccess: () => vibrate([40, 30, 80]),

  /** Single light pulse — item added to restock */
  itemAdded: () => vibrate([50]),

  /** Three quick taps — wrong action / warning */
  warning: () => vibrate([60, 40, 60, 40, 60]),

  /** Single firm buzz — hard error */
  error: () => vibrate([200]),

  /** Ascending reward pattern — sync complete */
  syncComplete: () => vibrate([30, 20, 30, 20, 80]),

  /** Assertive single buzz — navigation locked attempt */
  locked: () => vibrate([150]),

  /** Decreasing pulses — alert resolved */
  resolved: () => vibrate([80, 30, 50, 30, 20]),
};
