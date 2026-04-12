# Fix IL Phone Number Sign-In Support

## What & Why
Israeli phone numbers (+972) are not accepted during sign-in. The app's sign-in flow and any custom phone number input or validation must explicitly support the Israeli country code and number format so Israeli users can authenticate and receive OTP/WhatsApp messages correctly.

## Done looks like
- A user can enter an Israeli phone number (starting with +972 or 05x) in the sign-in screen without it being rejected
- The phone number is normalized to E.164 format (+972XXXXXXXXX) before being passed to Clerk or used in WhatsApp links
- If Clerk's phone-based sign-in is used, Israel (+972) is in the supported country list (Clerk Dashboard setting is documented if it cannot be toggled in code)
- The `buildWhatsAppUrl` utility correctly produces a valid wa.me link for +972 numbers
- No "phone number not supported" error appears for Israeli numbers

## Out of scope
- Adding support for any other country beyond what is already supported
- Changing the core Clerk authentication flow or provider

## Tasks
1. **Audit existing phone validation** — Check all places where phone numbers are validated, formatted, or passed to Clerk/WhatsApp (sign-in page, any custom phone input added by Task #50, `buildWhatsAppUrl` in utils). Identify exactly where the IL rejection occurs.

2. **Fix phone normalization** — Ensure Israeli numbers entered as `05X-XXXXXXX` or `+972-5X-XXXXXXX` are normalized to E.164 (`+972XXXXXXXXX`) before being submitted to Clerk or used in wa.me URLs. Update or add a `normalizePhoneNumber` helper that handles the IL prefix.

3. **Update sign-in UI phone input** — If the WhatsApp-hybrid sign-in screen (Task #50) has a phone input field with a country selector or allowlist, add Israel (+972) to the supported countries and set it as the default country.

4. **Verify Clerk Dashboard requirement** — If the block is Clerk-side (SMS country restrictions), add a clear in-app error message guiding users to contact support, and document the Clerk Dashboard step needed (enable Israel under "SMS sending" in the Clerk Dashboard → Phone numbers settings).

## Relevant files
- `src/pages/signin.tsx`
- `src/lib/utils.ts`
- `server/routes/whatsapp.ts`
- `.local/tasks/whatsapp-hybrid-ux-redesign.md`
