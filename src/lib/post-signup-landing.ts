/** Session flag: set after registration so `/` shows the marketing landing once; cleared when opening the app. */
export const LANDING_AFTER_SIGNUP_KEY = "vt_landing_after_signup";

export function shouldShowPostSignupLanding(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(LANDING_AFTER_SIGNUP_KEY) === "1";
}

export function clearPostSignupLandingFlag(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(LANDING_AFTER_SIGNUP_KEY);
}

export function setPostSignupLandingFlag(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(LANDING_AFTER_SIGNUP_KEY, "1");
}
