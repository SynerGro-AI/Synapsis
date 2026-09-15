import { useEffect, useRef } from "react";
import { Application, Graphics } from "pixi.js";

export default function CircuitCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let destroyed = false;

    // Pixi v8 initializes asynchronously.
    app
      .init({ resizeTo: container, background: "#252525", antialias: true })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        container.appendChild(app.canvas);

        // Breadboard
        const breadboard = new Graphics()
          .roundRect(60, 180, 480, 140, 8)
          .fill(0xd8d2c0);
        app.stage.addChild(breadboard);

        // Resistor (220Ω)
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

        // LED — blinks with the simulated sketch
        const led = new Graphics().circle(320, 240, 14).fill(0xff0000);
        app.stage.addChild(led);

        let elapsed = 0;
        app.ticker.add((ticker) => {
          elapsed += ticker.deltaMS;
          led.alpha = elapsed % 1000 < 500 ? 1 : 0.15;
        });
      });

    return () => {
      destroyed = true;
      if (app.renderer) app.destroy(true);
    };
  }, []);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
