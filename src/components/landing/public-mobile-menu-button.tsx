import { Menu, X } from "lucide-react";
import { PUBLIC_MOBILE_MENU_BUTTON_CLASS } from "@/lib/public-landing-nav";

export function PublicMobileMenuButton({
  open,
  onToggle,
  controlsId,
}: {
  open: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      data-testid="public-mobile-menu"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onToggle}
      className={PUBLIC_MOBILE_MENU_BUTTON_CLASS}
    >
      {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
    </button>
  );
}
