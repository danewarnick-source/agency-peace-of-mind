/**
 * Locked public Terms draft. Legal name is Provider Interface LLC.
 * Dane is not a lawyer — keep this short. No Hive Certify. No DSPD fluff.
 */

export const PI_LEGAL_NAME = "Provider Interface LLC";

export const PI_TERMS_TITLE = "Terms";

export const PI_TOS_VERSION = "2026-09-02";

export const PI_TERMS_INTRO =
  "These are the terms for using Provider Interface. The company is Provider Interface LLC.";

export const PI_TERMS_BILLING_HEADING = "Billing";

export const PI_TERMS_BILLING_PARAS = [
  "We bill from the people on your roster — not from a guess at signup, and not from staff count.",
  "Each month we count anyone who was on your roster at any point that month. A person counts if they were added before the month ended and were not discharged before the month started. If you take someone off on the 30th and put them back on the 2nd, they still count for that month.",
  "The monthly amount is $69 per person, with a $350 minimum. We set that count and the Stripe quantity. Stripe does not decide who is a client.",
  "True North Supports is not billed.",
  "If you add people mid-year on a prepaid annual plan, we invoice the leftover months for those extra people, at the same yearly discount if you have one. If you drop people, there is no cash refund. Unused time is a credit at renewal.",
  "If you cancel a prepaid year early, there is no cash refund. You can keep using Provider Interface through the year you already paid for. The payment stays.",
] as const;

/** Exact heading Dane locked. Do not rename. */
export const PI_TERMS_CONTRACTS_HEADING = "Contracts, funders, and audits";

export const PI_TERMS_CONTRACTS_PARAS = [
  "We do not guarantee you will pass an audit. You must read and follow your own contracts with funders and others. That is your responsibility.",
] as const;
