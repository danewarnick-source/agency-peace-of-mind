// Hive-branded billing email templates.
//
// Pure render functions — no provider dependencies. Returns subject + html + text.
// Branded with Hive dark-navy header, amber accent, and clean transactional layout.
// Wired into src/lib/billing-notifications.server.ts.

const NAVY = "#0F1A2E";
const AMBER = "#F5A524";
const TEXT = "#1F2937";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const BG = "#F9FAFB";

interface ShellOptions {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}

function shell({ preheader, heading, bodyHtml, ctaLabel, ctaHref, footerNote }: ShellOptions): string {
  const cta =
    ctaLabel && ctaHref
      ? `<tr><td align="left" style="padding:8px 32px 24px;">
          <a href="${ctaHref}" style="display:inline-block;background:${AMBER};color:${NAVY};font-weight:700;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;">${ctaLabel}</a>
        </td></tr>`
      : "";
  const foot = footerNote
    ? `<tr><td style="padding:0 32px 24px;color:${MUTED};font-size:13px;line-height:1.5;">${footerNote}</td></tr>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
<span style="display:none;font-size:1px;color:${BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:24px 32px;">
        <table role="presentation" width="100%"><tr>
          <td style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">
            <span style="color:${AMBER};">●</span> HIVE
          </td>
          <td align="right" style="font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">Billing</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;background:${AMBER};"></td></tr>
      <tr><td style="padding:32px 32px 8px;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${NAVY};font-weight:700;">${heading}</h1>
      </td></tr>
      <tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:${TEXT};">${bodyHtml}</td></tr>
      ${cta}
      ${foot}
      <tr><td style="background:${BG};padding:20px 32px;border-top:1px solid ${BORDER};font-size:12px;color:${MUTED};">
        Need help? Email <a href="mailto:support@hive.app" style="color:${NAVY};text-decoration:underline;">support@hive.app</a>. <br>
        © Hive. Compliance platform for DSPD providers.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function plain(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n") + "\n\n— Hive\nsupport@hive.app";
}

function money(cents?: number | null): string {
  if (cents == null) return "$—";
  return "$" + (cents / 100).toFixed(2);
}

function settingsLink(): string {
  // Relative path; recipients open in their authenticated dashboard.
  return "https://app.hive.app/dashboard/settings/billing";
}

export type BillingEmailKind =
  | "payment_failed"
  | "payment_failed_day7"
  | "payment_failed_day21"
  | "account_locked"
  | "account_locked_staff"
  | "account_restored"
  | "card_expiry_60"
  | "card_expiry_30"
  | "card_expiry_7";

export interface BillingEmailVars {
  agencyName?: string;
  amountCents?: number | null;
  reason?: string | null;
  daysRemaining?: number;
  cardLast4?: string;
  cardExpiresOn?: string; // human-readable date
  receiptId?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderBillingEmail(kind: BillingEmailKind, vars: BillingEmailVars = {}): RenderedEmail {
  const agency = vars.agencyName || "your agency";
  const link = settingsLink();

  switch (kind) {
    case "payment_failed": {
      const subject = `Action required — payment failed for ${agency}`;
      const reasonLine = vars.reason
        ? `<p style="margin:0 0 16px;"><strong>Reason from card issuer:</strong> ${vars.reason}</p>`
        : "";
      const body = `
        <p style="margin:0 0 16px;">We weren't able to process your most recent Hive payment of <strong>${money(vars.amountCents)}</strong>.</p>
        ${reasonLine}
        <p style="margin:0 0 16px;">You have <strong>30 days</strong> from today to update your payment method before your account is locked and your staff lose access.</p>
        <p style="margin:0;">Update your card now to keep things running smoothly.</p>`;
      return {
        subject,
        html: shell({
          preheader: `Payment of ${money(vars.amountCents)} failed — 30 days to fix it.`,
          heading: "Payment failed",
          bodyHtml: body,
          ctaLabel: "Update payment method",
          ctaHref: link,
        }),
        text: plain([
          `Payment failed for ${agency}.`,
          `Amount: ${money(vars.amountCents)}.${vars.reason ? ` Reason: ${vars.reason}.` : ""}`,
          `You have 30 days to update your payment method before lockout.`,
          `Update: ${link}`,
        ]),
      };
    }

    case "payment_failed_day7": {
      const days = vars.daysRemaining ?? 23;
      const subject = `Reminder — update your payment method (${days} days remaining)`;
      const body = `
        <p style="margin:0 0 16px;">This is a second notice that your most recent Hive payment of <strong>${money(vars.amountCents)}</strong> hasn't gone through.</p>
        <p style="margin:0 0 16px;font-size:18px;"><strong style="color:${NAVY};">${days} days</strong> remaining until your account is locked.</p>
        <p style="margin:0;">Updating your card takes about a minute and restores billing immediately.</p>`;
      return {
        subject,
        html: shell({
          preheader: `${days} days until your Hive account is locked.`,
          heading: `${days} days to update your payment method`,
          bodyHtml: body,
          ctaLabel: "Update payment method",
          ctaHref: link,
        }),
        text: plain([
          `Reminder: ${days} days until your Hive account is locked.`,
          `Failed amount: ${money(vars.amountCents)}.`,
          `Update: ${link}`,
        ]),
      };
    }

    case "payment_failed_day21": {
      const days = vars.daysRemaining ?? 9;
      const subject = `Urgent — your Hive account locks in ${days} days`;
      const body = `
        <p style="margin:0 0 16px;color:#B91C1C;"><strong>This is an urgent notice.</strong></p>
        <p style="margin:0 0 16px;">Your Hive account will be <strong>locked in ${days} days</strong>. After 30 days of non-payment, every staff member at ${agency} will lose access to the platform — schedules, eMAR, daily logs, and reports will all be unavailable until billing is restored.</p>
        <p style="margin:0 0 16px;">To prevent disruption to your team and clients, please update your payment method today.</p>
        <p style="margin:0;color:${MUTED};font-size:13px;">If you're having trouble updating, reply to this email or contact <a href="mailto:support@hive.app" style="color:${NAVY};">support@hive.app</a>.</p>`;
      return {
        subject,
        html: shell({
          preheader: `Lockout in ${days} days — all staff will lose access.`,
          heading: `Account locks in ${days} days`,
          bodyHtml: body,
          ctaLabel: "Update payment method now",
          ctaHref: link,
        }),
        text: plain([
          `URGENT: ${agency}'s Hive account locks in ${days} days.`,
          `After 30 days of non-payment, all staff lose access.`,
          `Update: ${link}`,
          `Support: support@hive.app`,
        ]),
      };
    }

    case "account_locked": {
      const subject = "Your Hive account has been locked";
      const body = `
        <p style="margin:0 0 16px;">Your Hive account for <strong>${agency}</strong> has been locked due to 30+ days of unpaid balance.</p>
        <p style="margin:0 0 16px;">All staff have been locked out of the platform.</p>
        <p style="margin:0 0 16px;"><strong>To restore access:</strong> update your payment method. As soon as payment is processed, the account unlocks immediately and all staff regain access.</p>`;
      return {
        subject,
        html: shell({
          preheader: "Account locked — update payment to restore access.",
          heading: "Your Hive account has been locked",
          bodyHtml: body,
          ctaLabel: "Restore access",
          ctaHref: link,
          footerNote: `Need to talk to a human? Email <a href="mailto:support@hive.app" style="color:${NAVY};">support@hive.app</a> and we'll get you back online.`,
        }),
        text: plain([
          `Your Hive account for ${agency} has been locked due to 30+ days of unpaid balance.`,
          `All staff are now locked out.`,
          `Restore access by updating your payment method. Access returns immediately on success.`,
          `Update: ${link}`,
        ]),
      };
    }

    case "account_locked_staff": {
      const subject = "Your Hive access has been suspended";
      const body = `
        <p style="margin:0 0 16px;">Your agency's Hive account has a billing issue, so platform access is temporarily suspended for everyone at <strong>${agency}</strong>.</p>
        <p style="margin:0 0 16px;"><strong>What to do:</strong> Please contact your agency administrator. This is an admin-only action — there's nothing you can do from your end to restore access.</p>
        <p style="margin:0;color:${MUTED};font-size:13px;">As soon as your administrator resolves the billing issue, your access will be restored automatically.</p>`;
      return {
        subject,
        html: shell({
          preheader: "Contact your agency administrator to restore access.",
          heading: "Your Hive access is suspended",
          bodyHtml: body,
        }),
        text: plain([
          `Your agency's Hive account has a billing issue.`,
          `Please contact your agency administrator — only an admin can resolve this.`,
          `Access returns automatically once billing is restored.`,
        ]),
      };
    }

    case "card_expiry_60":
    case "card_expiry_30":
    case "card_expiry_7": {
      const urgent = kind === "card_expiry_7";
      const last4 = vars.cardLast4 || "••••";
      const expDate = vars.cardExpiresOn || "soon";
      const subject = urgent
        ? "Urgent — your card expires in 7 days"
        : kind === "card_expiry_30"
          ? "Your card on file expires soon — update to avoid interruption"
          : "Heads up — your card on file expires in 60 days";
      const lead = urgent
        ? `<p style="margin:0 0 16px;color:#B91C1C;"><strong>Your card expires in 7 days.</strong> If it isn't updated before then, your next billing cycle will fail and the 30-day grace period will begin.</p>`
        : kind === "card_expiry_30"
          ? `<p style="margin:0 0 16px;">A heads up: the card on file expires in about 30 days. Update it now to avoid any interruption to ${agency}'s service.</p>`
          : `<p style="margin:0 0 16px;">A friendly reminder: the card on file is set to expire in about 60 days.</p>`;
      const body = `
        ${lead}
        <p style="margin:0 0 16px;"><strong>Card on file:</strong> ending in <strong>${last4}</strong>, expires <strong>${expDate}</strong>.</p>
        <p style="margin:0;">Updating takes about a minute and there's no service interruption.</p>`;
      return {
        subject,
        html: shell({
          preheader: `Card ending ${last4} expires ${expDate}.`,
          heading: urgent ? "Card expires in 7 days" : "Update your card on file",
          bodyHtml: body,
          ctaLabel: "Update payment method",
          ctaHref: link,
        }),
        text: plain([
          subject,
          `Card on file ending in ${last4} expires ${expDate}.`,
          urgent ? `If not updated before expiry, next billing will fail and the grace period begins.` : `Update now to avoid interruption.`,
          `Update: ${link}`,
        ]),
      };
    }

    case "account_restored": {
      const subject = "Payment successful — your Hive account is fully restored";
      const receipt = vars.receiptId ? `<p style="margin:0 0 8px;color:${MUTED};font-size:13px;">Receipt: ${vars.receiptId}</p>` : "";
      const body = `
        <p style="margin:0 0 16px;">Great news — your payment of <strong>${money(vars.amountCents)}</strong> went through.</p>
        <p style="margin:0 0 16px;">${agency}'s Hive account is fully restored and all staff have access again.</p>
        <p style="margin:0 0 16px;color:${MUTED};font-size:13px;">Thanks for keeping your team running on Hive.</p>
        ${receipt}`;
      return {
        subject,
        html: shell({
          preheader: "Payment processed — staff have full access.",
          heading: "Account restored",
          bodyHtml: body,
          ctaLabel: "Go to dashboard",
          ctaHref: "https://app.hive.app/dashboard",
        }),
        text: plain([
          `Payment of ${money(vars.amountCents)} processed.`,
          `${agency}'s Hive account is fully restored — all staff have access.`,
          vars.receiptId ? `Receipt: ${vars.receiptId}` : "",
        ]),
      };
    }
  }
}
