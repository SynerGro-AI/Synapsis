# Synapsys — Electronics Learning Platform

An interactive learning environment that teaches electronics and programming
through a virtual workspace: build circuits on a simulated breadboard, write
Arduino-style sketches in a real code editor, and watch the simulation respond
in real time.

## Credits

The lesson curriculum is based on the Arduino tutorial series by
**Paul McWhorter** at [toptechboy.com](https://toptechboy.com/arduino-lessons/).
His tutorials are free — if they help you, please
[support him on Patreon](https://www.patreon.com/PaulMcWhorter).

Schematic symbols come from the official
[KiCad symbol libraries](https://gitlab.com/kicad/libraries/kicad-symbols)
(CC-BY-SA 4.0 with the KiCad libraries exception — license included at
`frontend/public/kicad-symbols/LICENSE.md`).

## Layout

| Panel               | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| **Circuit Canvas**  | Virtual Arduino Uno + breadboard (PixiJS)                 |
| **Component Guide** | Part info, schematics, and "why this works" explanations  |
| **Code IDE**        | Monaco editor with Arduino C++ sketches                   |
| **Serial Output**   | Live pin states and serial monitor feedback               |

## Project structure

```
frontend/   React + TypeScript (Vite) — UI, circuit canvas, Monaco IDE
backend/    .NET (C#) — simulation engine, lesson engine, component API
```

## Getting started

```bash
cd frontend
npm install
npm run dev
```

## Roadmap (curriculum phases)

1. **Foundation (Lessons 1–5):** digital out, analog in, serial monitor, variables, conditionals
2. **Sensing (6–12):** ultrasonic, temp sensor, light sensor, buttons, debouncing
3. **Control (13–20):** servos, DC motors, PWM, RGB LED, LCD display
4. **Python Bridge (21–28):** same circuits, Python syntax, Raspberry Pi crossover
5. **Expert (29+):** wire gauge physics, signal calibration, interrupts, I2C

## Backend

The .NET backend hosts the component library API (`/api/components`), the
lesson API (`/api/lessons`), and the simulation engine
(`Synapsys.Simulation`) — currently a virtual microcontroller with digital
pin state, growing toward ADC, PWM, timing, and signal propagation.

Building and running happens **through GitHub** — no local SDK required:

- **CI:** every push to `main` builds both frontend and backend via
  GitHub Actions (`.github/workflows/ci.yml`)
- **Codespaces:** open the repo in a GitHub Codespace (Code ▸ Codespaces ▸
  Create) and the .NET 10 SDK + Node 22 are preinstalled via
  `.devcontainer/devcontainer.json`. Then:

```bash
cd backend && dotnet run --project Synapsys.Api   # API
cd frontend && npm run dev                        # UI
```

