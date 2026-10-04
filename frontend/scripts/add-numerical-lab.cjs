// Add the interactive Numerical Methods Lab (a general, offline math tool —
// user-entered functions and variables, real Riemann/derivative/Newton/series).
// Idempotent: safe to run repeatedly; writes both catalogs identically.
const fs = require("node:fs");
const path = require("node:path");

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");
const filePath = path.join(FE, "lessons.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

const phase = {
  id: "math_numerical",
  track: "math",
  name: "Numerical Methods Lab",
  range: "35",
  concepts: [
    "Function graphing",
    "Riemann integration",
    "Numerical derivatives",
    "Newton's method",
    "Series convergence",
  ],
};

const source =
  "Paul McWhorter (toptechboy.com; Patreon) — coding-education context; numerical methods lab authored by Synapsis.";

const lesson = {
  id: 721,
  phase: "math_numerical",
  title: "Numerical Methods Lab",
  description:
    "A graphing calculator and numerical-methods workbench that runs entirely offline. Type any function of x, define your own variables, then graph it, estimate its integral with Riemann rectangles, find a numerical derivative, solve for a root with Newton's method, or sum a series — every result is computed live in your browser.",
  source,
  kind: "lab",
  lab: {
    expression: "x^2 - 2",
    variables: [],
  },
  featuredComponent: "math",
  circuit: { palette: [], required: [], notes: "" },
  codeTemplate: { language: "text", starter: "" },
  hints: [
    "Try f(x) = sin(x) and graph it from -6 to 6.",
    "Integrate x^2 from 0 to 4 — raise n and watch it approach 21.333.",
    "Find a root of x^2 - 2 with Newton's method to see the square root of 2.",
    "Sum (-1)^k/(2*k+1) for k = 0 to 500, then multiply by 4 to approach pi.",
  ],
  output: { initial: "The lab computes as you type.", status: "Offline numerical engine ready." },
};

data.phases = data.phases.filter((item) => item.id !== phase.id);
data.phases.push(phase);
data.lessons = data.lessons.filter((item) => item.id !== lesson.id);
data.lessons.push(lesson);

data.phases.sort((a, b) => {
  const trackOrder =
    data.tracks.findIndex((track) => track.id === a.track) -
    data.tracks.findIndex((track) => track.id === b.track);
  return trackOrder || Number(a.range.split("-")[0]) - Number(b.range.split("-")[0]);
});
data.lessons.sort((a, b) => a.id - b.id);

if (!lesson.source.includes("Paul McWhorter")) throw new Error("Lab lesson missing attribution");

const serialized = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(filePath, serialized);
fs.writeFileSync(path.join(BE, "lessons.json"), serialized);
console.log("Published the Numerical Methods Lab (lesson 721, phase math_numerical).");
