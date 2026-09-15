import { useEffect, useRef } from "react";
import { Application, Graphics, Text } from "pixi.js";

interface SimState {
  running: boolean;
  pins: Record<number, boolean>;
}

interface CircuitCanvasProps {
  /** Component names from the lesson's circuit definition. */
  components: string[];
  /** Live simulation state (mutable ref contents, read every frame). */
  sim: { current: SimState };
}

const has = (components: string[], word: string) =>
  components.some((c) => c.toLowerCase().includes(word));

function label(text: string, x: number, y: number): Text {
  return new Text({
    text,
    x,
    y,
    anchor: { x: 0.5, y: 0 },
    style: { fill: 0xbbbbbb, fontSize: 12, fontFamily: "sans-serif" },
  });
}

export default function CircuitCanvas({ components, sim }: CircuitCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let destroyed = false;

    app
      .init({ resizeTo: container, background: "#252525", antialias: true })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        container.appendChild(app.canvas);

        const wire = new Graphics();
        app.stage.addChild(wire);

        if (has(components, "arduino")) {
          const board = new Graphics()
            .roundRect(40, 40, 170, 110, 8)
            .fill(0x1d7a4f)
            .roundRect(48, 52, 28, 20, 3)
            .fill(0x8a8a8a);
          app.stage.addChild(board);
          app.stage.addChild(label("Arduino Uno", 125, 155));
        }

        if (has(components, "breadboard")) {
          const bb = new Graphics().roundRect(60, 210, 480, 130, 8).fill(0xd8d2c0);
          // Tie-point rows, hinted with subtle dots.
          for (let col = 0; col < 22; col++)
            for (let row = 0; row < 4; row++)
              bb.circle(85 + col * 21, 240 + row * 22, 1.6).fill(0x9a9484);
          app.stage.addChild(bb);
          app.stage.addChild(label("Breadboard", 300, 345));
        }

        if (has(components, "resistor")) {
          const resistor = new Graphics()
            .rect(150, 230, 70, 18)
            .fill(0xc8a44d)
            .rect(160, 230, 8, 18)
            .fill(0x8b0000)
            .rect(180, 230, 8, 18)
            .fill(0x8b0000)
            .rect(200, 230, 8, 18)
            .fill(0x654321);
          app.stage.addChild(resistor);
          app.stage.addChild(label("220Ω", 185, 252));
        }

        if (has(components, "potentiometer")) {
          const pot = new Graphics()
            .circle(450, 265, 24)
            .fill(0x3a6ea5)
            .circle(450, 265, 18)
            .fill(0x2a2a2a);
          const knob = new Graphics()
            .moveTo(450, 265)
            .lineTo(450 + 14, 265 - 10)
            .stroke({ width: 3, color: 0xdddddd });
          app.stage.addChild(pot, knob);
          app.stage.addChild(label("Potentiometer", 450, 295));
        }

        if (has(components, "led")) {
          const led = new Graphics().circle(320, 240, 14).fill(0xff0000);
          led.alpha = 0.15;
          app.stage.addChild(led);
          app.stage.addChild(label("LED", 320, 258));

          // The LED shows pin 13 from the learner's running sketch.
          app.ticker.add(() => {
            const state = sim.current;
            led.alpha = state.running && state.pins[13] ? 1 : 0.15;
          });
        }

        // Simple hookup wires once both boards are present.
        if (has(components, "arduino") && has(components, "breadboard")) {
          wire
            .moveTo(200, 140)
            .lineTo(200, 180)
            .lineTo(120, 180)
            .lineTo(120, 218)
            .stroke({ width: 2, color: 0xcc4444 })
            .moveTo(210, 140)
            .lineTo(210, 195)
            .lineTo(520, 195)
            .lineTo(520, 218)
            .stroke({ width: 2, color: 0x444444 });
        }
      });

    return () => {
      destroyed = true;
      if (app.renderer) app.destroy(true);
    };
    // The parent remounts this component per lesson (key), so deps stay empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
