import type { DetailedHTMLProps, HTMLAttributes } from "react";

type WokwiProps<T = object> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  T;

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "wokwi-arduino-uno": WokwiProps<{ led13?: boolean; ledPower?: boolean }>;
      "wokwi-breadboard": WokwiProps;
      "wokwi-led": WokwiProps<{
        value?: boolean;
        color?: string;
        label?: string;
        brightness?: number;
        flip?: boolean;
      }>;
      "wokwi-resistor": WokwiProps<{ value?: string }>;
      "wokwi-potentiometer": WokwiProps<{
        value?: number;
        min?: number;
        max?: number;
        step?: number;
      }>;
    }
  }
}
