/**
 * The one landing hero device — attached Staff View · My Caseload mock.
 * 16:9 plate (phone on honeycomb) for desktop; portrait crop for small screens.
 * Photo avatars are in the mock. No extra phones.
 */

const HERO_WIDE = "/landing/staff-phone-faces.webp";
const HERO_PORTRAIT = "/landing/staff-phone-faces-portrait.webp";

const ALT =
  "Hive Staff View, My Caseload. Staff Riley. Maya Ellison, Host Home Supports — hosts do not clock in. Cole Brennan, HHS daily note.";

export function HeroPhoneWide({ className = "" }: { className?: string }) {
  return (
    <img
      src={HERO_WIDE}
      alt={ALT}
      className={`h-auto w-full select-none ${className}`}
      width={1536}
      height={1024}
    />
  );
}

export function HeroPhonePortrait({ className = "" }: { className?: string }) {
  return (
    <img
      src={HERO_PORTRAIT}
      alt={ALT}
      className={`mx-auto h-auto w-full max-w-[280px] select-none ${className}`}
      width={720}
      height={1080}
    />
  );
}
