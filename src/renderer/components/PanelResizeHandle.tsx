import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

type PanelResizeHandleProps = {
  ariaLabel: string;
  className?: string;
  direction: 1 | -1;
  max: number;
  min: number;
  onResize: (width: number) => void;
  onReset: () => void;
  value: number;
};

export function PanelResizeHandle({
  ariaLabel,
  className = "",
  direction,
  max,
  min,
  onResize,
  onReset,
  value,
}: PanelResizeHandleProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = value;
    handle.setPointerCapture?.(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      onResize(startWidth + ((moveEvent.clientX - startX) * direction));
    };
    const stop = (stopEvent: PointerEvent) => {
      handle.releasePointerCapture?.(stopEvent.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      cleanupRef.current = null;
      document.body.classList.remove("panel-resizing");
    };

    cleanupRef.current?.();
    cleanupRef.current = () => stop(event.nativeEvent);
    document.body.classList.add("panel-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Home") {
      event.preventDefault();
      onResize(min);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onResize(max);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const separatorDelta = event.key === "ArrowRight" ? 1 : -1;
    onResize(value + (separatorDelta * direction * (event.shiftKey ? 48 : 16)));
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels`}
      className={`panel-resize-handle ${className}`.trim()}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerDown={beginResize}
      role="separator"
      tabIndex={0}
      title="Drag to resize · Double-click to reset"
    >
      <span aria-hidden="true" />
    </div>
  );
}
