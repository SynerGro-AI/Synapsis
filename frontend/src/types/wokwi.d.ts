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
      "wokwi-pushbutton": WokwiProps<{ color?: string; pressed?: boolean; label?: string }>;
      "wokwi-photoresistor-sensor": WokwiProps<{ value?: number }>;
      "wokwi-ntc-temperature-sensor": WokwiProps<{ value?: number }>;
      "wokwi-hc-sr04": WokwiProps<{ distance?: number }>;
      "wokwi-servo": WokwiProps<{ angle?: number; horn?: string; hornColor?: string }>;
      "wokwi-buzzer": WokwiProps<{ hasSignal?: boolean }>;
      "wokwi-dht22": WokwiProps;
      "wokwi-rgb-led": WokwiProps<{ ledRed?: number; ledGreen?: number; ledBlue?: number }>;
      "wokwi-lcd1602": WokwiProps<{
        characters?: Uint8Array;
        backlight?: boolean;
        color?: string;
        background?: string;
        pins?: string;
        cursorX?: number;
        cursorY?: number;
      }>;
    }
  }
}
