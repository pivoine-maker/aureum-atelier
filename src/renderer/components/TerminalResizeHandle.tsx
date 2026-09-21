import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

type TerminalResizeHandleProps = {
  max: number;
  min: number;
  onResize: (height: number) => void;
  onReset: () => void;
  value: number;
};

export function TerminalResizeHandle({ max, min, onResize, onReset, value }: TerminalResizeHandleProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startY = event.clientY;
    const startHeight = value;
    handle.setPointerCapture?.(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      onResize(startHeight + startY - moveEvent.clientY);
    };
    const stop = (stopEvent: PointerEvent) => {
      handle.releasePointerCapture?.(stopEvent.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      cleanupRef.current = null;
      document.body.classList.remove("terminal-resizing");
    };

    cleanupRef.current?.();
    cleanupRef.current = () => stop(event.nativeEvent);
    document.body.classList.add("terminal-resizing");
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
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = (event.shiftKey ? 48 : 16) * (event.key === "ArrowUp" ? 1 : -1);
    onResize(value + delta);
  };

  return (
    <div
      aria-label="Resize terminal height"
      aria-orientation="horizontal"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels`}
      className="terminal-resize-handle"
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerDown={beginResize}
      role="separator"
      tabIndex={0}
      title="Drag to resize terminal · Double-click to reset"
    >
      <span />
    </div>
  );
}
