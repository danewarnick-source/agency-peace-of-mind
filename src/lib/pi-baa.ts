/**
 * Locked Business Associate Agreement. Legal name is Provider Interface LLC.
 * I-agree only — no signature pad, typed name, or DocuSign.
 */

import { PI_LEGAL_NAME } from "./pi-terms.ts";

export const PI_BAA_TITLE = "Business Associate Agreement";

export const PI_BAA_VERSION = "2026-09-02";

export const PI_BAA_AGREE_COPY =
  "I am authorized to bind this agency. I have read the Business Associate Agreement and I agree to it on behalf of this agency.";

export const PI_BAA_INTRO =
  "This Business Associate Agreement is between your agency (the Covered Entity) and Provider Interface LLC (the Business Associate). It covers protected health information you put in Provider Interface.";

export const PI_BAA_SECTIONS = [
  {
    heading: "What this covers",
    paras: [
      "You use Provider Interface to run your agency. That can include protected health information (PHI) about the people you serve.",
      "Provider Interface LLC will use and disclose that PHI only to provide the service, as required by law, or as you direct in writing.",
    ],
  },
  {
    heading: "What we will do",
    paras: [
      "We will not use or share PHI except as this agreement allows.",
      "We will use reasonable and appropriate safeguards for electronic PHI, as required by the HIPAA Security Rule.",
      "We will report to you any use or disclosure of PHI not permitted by this agreement that we become aware of, including breaches of unsecured PHI, without unreasonable delay.",
      "We will make sure any subcontractor that handles PHI for us agrees to the same restrictions and conditions that apply to us.",
      "We will make PHI available as needed so you can meet an individual's right to access, amend, or receive an accounting of disclosures, when that information is in our possession.",
      "We will make our relevant practices, books, and records available to the Secretary of Health and Human Services to determine your or our compliance with HIPAA.",
    ],
  },
  {
    heading: "What you will do",
    paras: [
      "You are responsible for your own HIPAA compliance as a Covered Entity, including notices, authorizations, and minimum necessary uses.",
      "You will not ask us to use or disclose PHI in a way that would violate HIPAA if done by you.",
    ],
  },
  {
    heading: "When this ends",
    paras: [
      "This agreement lasts as long as we hold PHI for you.",
      "When the service ends, we will return or destroy PHI if feasible. If return or destruction is not feasible, we will keep protecting it and limit further uses to those that make retention necessary.",
      "If we materially breach this agreement and do not cure it in a reasonable time after notice, you may terminate the service.",
    ],
  },
  {
    heading: "Other terms",
    paras: [
      `${PI_LEGAL_NAME} does not become your clinical provider by hosting this software.`,
      "This agreement is the BAA for Provider Interface. Checking I agree on signup or on this page is how your agency accepts it. There is no drawn signature.",
    ],
  },
] as const;
