import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function SignaturePad({
  value,
  onChange,
  disabled,
}: { value?: string | null; onChange?: (dataUrl: string | null) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0d112b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, [value]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * e.currentTarget.width) / r.width, y: ((e.clientY - r.top) * e.currentTarget.height) / r.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    setDrawing(true);
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || disabled) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    setDrawing(false);
    onChange?.(e.currentTarget.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    onChange?.(null);
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-input bg-white touch-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full h-[180px] cursor-crosshair rounded-md"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled}>Clear</Button>
      </div>
    </div>
  );
}
