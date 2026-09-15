import { useEffect, useRef } from "react";
import "@wokwi/elements";

interface CircuitCanvasProps {
  /** Component names from the lesson's circuit definition. */
  components: string[];
  /** Pin 13 state from the learner's running sketch. */
  ledOn: boolean;
  /** Current potentiometer value (0–1023). */
  potValue: number;
  /** Called when the on-canvas potentiometer is turned. */
  onPotChange?: (value: number) => void;
}

const has = (components: string[], word: string) =>
  components.some((c) => c.toLowerCase().includes(word));

export default function CircuitCanvas({
  components,
  ledOn,
  potValue,
  onPotChange,
}: CircuitCanvasProps) {
  const potRef = useRef<HTMLElement>(null);

  // The wokwi potentiometer emits `input` events when dragged.
  useEffect(() => {
    const el = potRef.current;
    if (!el || !onPotChange) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const value = typeof detail === "number" ? detail : Number(detail?.value);
      if (Number.isFinite(value)) onPotChange(Math.round(value));
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, [onPotChange]);

  return (
    <div className="wokwi-canvas">
      {has(components, "arduino") && (
        <div className="part" style={{ left: 14, top: 10, transform: "scale(0.62)" }}>
          <wokwi-arduino-uno led13={ledOn} ledPower={true} />
        </div>
      )}

      {has(components, "breadboard") && (
        <div className="part" style={{ left: 14, top: 190, transform: "scale(0.5)" }}>
          <wokwi-breadboard />
        </div>
      )}

      {has(components, "resistor") && (
        <div className="part" style={{ left: 100, top: 235, transform: "scale(1.1)" }}>
          <wokwi-resistor value="220" />
        </div>
      )}

      {has(components, "led") && (
        <div className="part" style={{ left: 235, top: 205, transform: "scale(1.2)" }}>
          <wokwi-led color="red" label="LED" value={ledOn} />
        </div>
      )}

      {has(components, "potentiometer") && (
        <div className="part" style={{ left: 330, top: 210 }}>
          <wokwi-potentiometer
            ref={potRef}
            min={0}
            max={1023}
            value={potValue}
          />
        </div>
      )}
    </div>
  );
}
