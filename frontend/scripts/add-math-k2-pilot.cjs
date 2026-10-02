// Publish the standards-neutral curriculum progression and runnable Math K-2 pilot.
const fs = require("fs");
const path = require("path");

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");
const filePath = path.join(FE, "lessons.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

const tracks = [
  {
    id: "math",
    name: "Mathematics",
    icon: "∑",
    blurb: "A standards-neutral progression from K-2 number sense to university mathematics, explored by writing code and checking real results.",
    accent: "#e8a33d",
  },
  {
    id: "language_arts",
    name: "Language Arts",
    icon: "📚",
    blurb: "A standards-neutral progression from early reading and writing to university-level interpretation, argument, and research.",
    accent: "#d88bc7",
  },
  {
    id: "science",
    name: "Science",
    icon: "🔬",
    blurb: "A standards-neutral progression from observing the natural world to explaining it with evidence, models, and advanced study.",
    accent: "#61c6a3",
  },
  {
    id: "calculus",
    name: "Calculus",
    icon: "∫",
    blurb: "A standards-neutral progression from precalculus foundations through differential, integral, and multivariable calculus.",
    accent: "#80a9ff",
  },
];

const phase = (id, track, name, range, concepts, prerequisites = []) => ({
  id,
  track,
  name,
  range,
  concepts,
  status: "coming-soon",
  ...(prerequisites.length ? { prerequisites } : {}),
});

const phases = [
  {
    id: "math_k2",
    track: "math",
    name: "K–2: Number Sense & Operations",
    range: "701-706",
    concepts: [
      "Counting and cardinality",
      "Addition within 20",
      "Subtraction within 20",
      "Tens and ones",
      "Equal groups",
      "Length and comparison",
    ],
  },
  phase("math_3_5", "math", "Grades 3–5: Fractions & Operations", "707-712",
    ["Place value and multi-digit arithmetic", "Multiplication and division", "Fractions and decimals", "Measurement", "Geometry", "Data and graphs"], ["math_k2"]),
  phase("math_6_8", "math", "Grades 6–8: Ratios, Algebra & Geometry", "713-718",
    ["Ratios and proportional reasoning", "Rational numbers", "Expressions and equations", "Linear relationships", "Geometry and transformations", "Statistics and probability"], ["math_3_5"]),
  phase("math_9_12", "math", "Grades 9–12: Algebra, Functions & Proof", "719-726",
    ["Algebra and equations", "Functions and modeling", "Geometry and proof", "Trigonometry", "Probability and statistics", "Discrete mathematics"], ["math_6_8"]),
  phase("math_university", "math", "University: Advanced Mathematics", "727-734",
    ["Linear algebra", "Discrete structures", "Real analysis foundations", "Probability and statistics", "Optimization", "Mathematical modeling"], ["math_9_12"]),

  phase("language_k2", "language_arts", "K–2: Early Literacy", "801-806",
    ["Phonological awareness", "Decoding and word recognition", "Reading fluency", "Vocabulary", "Sentence construction", "Narrative writing"]),
  phase("language_3_5", "language_arts", "Grades 3–5: Reading & Composition", "807-812",
    ["Comprehension and evidence", "Text structure", "Vocabulary and morphology", "Paragraphs and essays", "Grammar and revision", "Speaking and listening"], ["language_k2"]),
  phase("language_6_8", "language_arts", "Grades 6–8: Analysis & Argument", "813-818",
    ["Literary analysis", "Informational texts", "Claims and evidence", "Research and citation", "Style and revision", "Discussion and presentation"], ["language_3_5"]),
  phase("language_9_12", "language_arts", "Grades 9–12: Rhetoric & Research", "819-826",
    ["Close reading", "Rhetorical analysis", "Evidence-based argument", "Research methods", "Creative and technical writing", "Media literacy"], ["language_6_8"]),
  phase("language_university", "language_arts", "University: Advanced Reading & Writing", "827-834",
    ["Critical theory and interpretation", "Disciplinary research", "Academic argument", "Source evaluation", "Advanced rhetoric", "Scholarly communication"], ["language_9_12"]),

  phase("science_k2", "science", "K–2: Observe & Ask", "901-906",
    ["Living things", "Weather and sky", "Materials and properties", "Motion and forces", "Simple observations", "Ask and test questions"]),
  phase("science_3_5", "science", "Grades 3–5: Patterns & Systems", "907-912",
    ["Life cycles and ecosystems", "Matter and mixtures", "Energy and waves", "Earth systems", "Engineering design", "Measurements and data"], ["science_k2"]),
  phase("science_6_8", "science", "Grades 6–8: Models & Evidence", "913-918",
    ["Cells and heredity", "Chemical and physical change", "Forces and energy", "Earth and space systems", "Experimental design", "Data-based models"], ["science_3_5"]),
  phase("science_9_12", "science", "Grades 9–12: Core Sciences", "919-926",
    ["Biology and genetics", "Chemistry and reactions", "Physics and mechanics", "Earth and environmental science", "Scientific investigation", "Quantitative modeling"], ["science_6_8"]),
  phase("science_university", "science", "University: Scientific Foundations", "927-934",
    ["Experimental methods", "Advanced biology", "Advanced chemistry", "Classical and modern physics", "Earth and climate systems", "Scientific computing"], ["science_9_12"]),

  phase("calculus_precalc", "calculus", "Precalculus Foundations", "1001-1006",
    ["Functions and inverses", "Polynomial and rational functions", "Exponential and logarithmic functions", "Trigonometry", "Sequences and limits intuition", "Analytic geometry"], ["math_9_12"]),
  phase("calculus_differential", "calculus", "Differential Calculus", "1007-1012",
    ["Limits and continuity", "Derivative definition", "Differentiation rules", "Chain rule", "Related rates and optimization", "Derivative applications"], ["calculus_precalc"]),
  phase("calculus_integral", "calculus", "Integral Calculus", "1013-1018",
    ["Antiderivatives", "Definite integrals", "Fundamental Theorem of Calculus", "Integration techniques", "Area and accumulation", "Differential equations foundations"], ["calculus_differential"]),
  phase("calculus_multivariable", "calculus", "Multivariable Calculus", "1019-1024",
    ["Vectors and 3D geometry", "Partial derivatives", "Multiple integrals", "Vector fields", "Line and surface integrals", "Green, Stokes, and divergence theorems"], ["calculus_integral"]),
  phase("calculus_applications", "calculus", "Calculus in Models & Applications", "1025-1030",
    ["Numerical approximation", "Differential equation models", "Optimization in context", "Physics applications", "Probability applications", "Computational exploration"], ["calculus_integral"]),
];

const credit = "Paul McWhorter (toptechboy.com; Patreon) — coding-education context; mathematics activities authored by Synapsis.";
const lessons = [
  {
    id: 701,
    title: "Count the Collection",
    description: "A number tells how many objects are in a collection. Change the object count, add the print statement, and run the program to check the result.",
    starter: "objects = 8\n# Add a print statement to show how many objects there are.\n",
    hints: ["print(objects)"],
  },
  {
    id: 702,
    title: "Add to Find the Total",
    description: "Addition combines two amounts. Change the amounts, add a print statement that adds them, then run the code to see the total.",
    starter: "first_group = 8\nmore_objects = 5\n# Add a print statement to find the total.\n",
    hints: ["print(first_group + more_objects)"],
  },
  {
    id: 703,
    title: "Subtract to Compare",
    description: "Subtraction can show how many more one group has than another. Change the amounts and print the difference.",
    starter: "red_counters = 14\nblue_counters = 6\n# Print how many more red counters there are.\n",
    hints: ["print(red_counters - blue_counters)"],
  },
  {
    id: 704,
    title: "Build a Number with Tens and Ones",
    description: "A two-digit number is made of tens and ones. Use whole-number division and remainder to split the number 34, then try another number.",
    starter: "number = 34\n# Find the number of tens and ones, then print both.\n",
    hints: ["tens = number // 10", "ones = number % 10", "print(tens, ones)"],
  },
  {
    id: 705,
    title: "Make Equal Groups",
    description: "Equal groups can be counted by multiplication. Change the number of groups or objects in each group, then print the total.",
    starter: "groups = 3\nobjects_in_each_group = 4\n# Print the total number of objects.\n",
    hints: ["print(groups * objects_in_each_group)"],
  },
  {
    id: 706,
    title: "Compare Two Lengths",
    description: "Measurements use units so lengths can be compared fairly. Both ribbons are measured in centimetres; print how much longer the first ribbon is.",
    starter: "first_ribbon_cm = 12\nsecond_ribbon_cm = 7\n# Print the difference in centimetres.\n",
    hints: ["print(first_ribbon_cm - second_ribbon_cm)"],
  },
].map(({ id, title, description, starter, hints }) => ({
  id,
  phase: "math_k2",
  title,
  description,
  source: credit,
  kind: "math",
  featuredComponent: "math",
  circuit: { palette: [], required: [], notes: "" },
  codeTemplate: { language: "python", starter },
  hints,
  output: { initial: "Run your math program to see the result.", status: "Waiting for your Python..." },
}));

for (const track of tracks) {
  const existing = data.tracks.find((item) => item.id === track.id);
  if (existing) Object.assign(existing, track);
  else data.tracks.push(track);
}
data.phases = data.phases.filter((item) => !phases.some((candidate) => candidate.id === item.id));
data.phases.push(...phases);
data.lessons = data.lessons.filter((item) => item.id < 701 || item.id > 706);
data.lessons.push(...lessons);
data.phases.sort((a, b) => {
  const trackOrder = data.tracks.findIndex((track) => track.id === a.track) -
    data.tracks.findIndex((track) => track.id === b.track);
  return trackOrder || Number(a.range.split("-")[0]) - Number(b.range.split("-")[0]);
});
data.lessons.sort((a, b) => a.id - b.id);

for (const item of lessons) {
  if (!item.source.includes("Paul McWhorter") || !item.codeTemplate.starter.includes("\n"))
    throw new Error(`Invalid math lesson ${item.id}`);
}
const serialized = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(filePath, serialized);
fs.writeFileSync(path.join(BE, "lessons.json"), serialized);
console.log("Published K-University curriculum blueprint and Math K-2 lessons 701-706.");
