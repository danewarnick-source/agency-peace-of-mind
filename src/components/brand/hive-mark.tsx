import { cn } from "@/lib/utils";
import { PiMark, PiWordmark } from "@/components/pi-landing/pi-mark";

/** Product mark is the straight-bar π. File name kept; visible chrome is PI. */
export function HiveMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return <PiMark className={className} title={title} />;
}

export function HiveWordmark({
  className,
  markClassName,
  wordClassName,
  to,
  tone = "chrome",
  short = false,
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
  to?: "/";
  tone?: "chrome" | "canvas";
  short?: boolean;
}) {
  return (
    <PiWordmark
      className={cn("gap-2.5", className)}
      markClassName={cn("h-8 w-8 shrink-0", markClassName)}
      wordClassName={wordClassName}
      to={to}
      tone={tone}
      short={short}
    />
  );
}
