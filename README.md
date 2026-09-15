# Synapsys — Electronics Learning Platform

An interactive learning environment that teaches electronics and programming
through a virtual workspace: build circuits on a simulated breadboard, write
Arduino-style sketches in a real code editor, and watch the simulation respond
in real time.

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
backend/    .NET (C#) — simulation engine, lesson engine, component API  [planned]
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

## Backend (planned)

The .NET backend will host the simulation engine (virtual GPIO/ADC/PWM, timing
and signal propagation), the component library API, the lesson engine, and
user progress tracking, with a WASM sandbox for executing user sketches.
Requires the .NET 10 SDK — once installed, scaffold with:

```bash
cd backend
dotnet new sln -n Synapsys
dotnet new webapi -n Synapsys.Api
dotnet new classlib -n Synapsys.Simulation
dotnet sln add Synapsys.Api Synapsys.Simulation
```
