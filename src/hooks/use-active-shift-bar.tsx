import { useActiveShift } from "@/hooks/use-active-shift";
import { useGeneralShift } from "@/hooks/use-general-shift";

/**
 * Whether the persistent "Clocked in" bar is currently rendered above the
 * bottom tab bar. Pages/shells use this to reserve bottom space so content
 * (Save buttons, signature fields, chat composers) never sits under the bar.
 */
export function useActiveShiftBarVisible(): boolean {
  const { data: active } = useActiveShift();
  const { shift: general } = useGeneralShift();
  return !!active || !!general;
}
