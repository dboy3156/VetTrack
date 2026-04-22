import { useState } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { normalizePhoneE164 } from "@/lib/utils";

type Step = "phone" | "code" | "error";

export function PhoneSignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isLoaded) return null;

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const e164 = normalizePhoneE164(phone);
      await signIn.create({
        identifier: e164,
      });
      const phoneFactor = signIn.supportedFirstFactors?.find(
        (f) => f.strategy === "phone_code"
      );
      if (!phoneFactor || !phoneFactor.phoneNumberId) {
        setErrorMsg(
          "Phone sign-in is not available for this account. Please use another sign-in method, or contact support if you are signing in with an Israeli (+972) number and see a 'not supported' error — Israel must be enabled in the Clerk Dashboard (Configure → Phone numbers → SMS sending → Allowed countries)."
        );
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: "phone_code",
        phoneNumberId: phoneFactor.phoneNumberId,
      });
      setStep("code");
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string }> };
      const msg =
        clerkErr?.errors?.[0]?.longMessage ||
        clerkErr?.errors?.[0]?.message ||
        "An error occurred. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !setActive) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "phone_code",
        code,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else {
        setErrorMsg("Verification failed. Please try again.");
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string }> };
      const msg =
        clerkErr?.errors?.[0]?.longMessage ||
        clerkErr?.errors?.[0]?.message ||
        "Invalid code. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  const isILLocal = /^05\d/.test(phone.trim());
  const e164Preview = phone.trim() ? normalizePhoneE164(phone) : null;

  if (step === "phone") {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm w-full">
        <h2 className="text-base font-semibold text-foreground mb-1">Sign in with phone</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Enter your phone number in international format (e.g.{" "}
          <span className="font-mono">+972501234567</span>) or Israeli local format (e.g.{" "}
          <span className="font-mono">0501234567</span>).
        </p>
        <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3">
          <div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+972501234567 or 0501234567"
              autoComplete="tel"
              required
              className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:border-transparent"
            />
            {isILLocal && e164Preview && (
              <p className="text-xs text-primary mt-1">
                Will be sent as <span className="font-mono">{e164Preview}</span>
              </p>
            )}
          </div>
          {errorMsg && (
            <p
              className="text-xs text-destructive bg-destructive/10 border border-destructive/25 rounded-lg px-3 py-2"
              role="alert"
            >
              {errorMsg}
              {errorMsg.toLowerCase().includes("not supported") && (
                <span className="block mt-1 text-muted-foreground">
                  Israel (+972) SMS must be enabled in the Clerk Dashboard (Configure → User &amp; Authentication → Phone numbers → SMS sending → Allowed countries).
                </span>
              )}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !phone.trim()}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-4 py-3 rounded-xl transition-colors text-sm"
          >
            {loading ? "Sending code…" : "Send verification code"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm w-full">
      <h2 className="text-base font-semibold text-foreground mb-1">Enter verification code</h2>
      <p className="text-xs text-muted-foreground mb-4">
        A code was sent to <span className="font-mono font-medium">{normalizePhoneE164(phone)}</span>
      </p>
      <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="6-digit code"
          maxLength={6}
          autoComplete="one-time-code"
          required
          className="w-full border border-input rounded-xl px-4 py-3 text-sm text-center tracking-widest bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:border-transparent"
        />
        {errorMsg && (
          <p
            className="text-xs text-destructive bg-destructive/10 border border-destructive/25 rounded-lg px-3 py-2"
            role="alert"
          >
            {errorMsg}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || code.length < 4}
          className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-4 py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
        <button
          type="button"
          onClick={() => { setStep("phone"); setCode(""); setErrorMsg(null); }}
          className="text-xs text-muted-foreground hover:text-primary transition-colors underline"
        >
          Change phone number
        </button>
      </form>
    </div>
  );
}
