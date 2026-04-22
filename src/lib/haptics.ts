/**
 * Haptic feedback vocabulary for VetTrack.
 * Each pattern is a Vibration API sequence: [duration, pause, duration, ...]
 * All calls are no-ops on unsupported devices.
 */
export const haptics = {
  /** Barely-there tap — confirms a UI press */
  tap: () => navigator.vibrate?.([8]),

  /** Double-pulse "confirmed" — successful QR/NFC scan */
  scanSuccess: () => navigator.vibrate?.([40, 30, 80]),

  /** Single light pulse — item added to restock */
  itemAdded: () => navigator.vibrate?.([50]),

  /** Three quick taps — wrong action / warning */
  warning: () => navigator.vibrate?.([60, 40, 60, 40, 60]),

  /** Single firm buzz — hard error */
  error: () => navigator.vibrate?.([200]),

  /** Ascending reward pattern — sync complete */
  syncComplete: () => navigator.vibrate?.([30, 20, 30, 20, 80]),

  /** Assertive single buzz — navigation locked attempt */
  locked: () => navigator.vibrate?.([150]),

  /** Decreasing pulses — alert resolved */
  resolved: () => navigator.vibrate?.([80, 30, 50, 30, 20]),
};
