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
    range: "1-6",
    status: "coming-soon",
    concepts: [
      "Counting and cardinality",
      "Addition within 20",
      "Subtraction within 20",
      "Tens and ones",
      "Equal groups",
      "Length and comparison",
    ],
  },
  phase("math_3_5", "math", "Grades 3–5: Fractions & Operations", "7-12",
    ["Place value and multi-digit arithmetic", "Multiplication and division", "Fractions and decimals", "Measurement", "Geometry", "Data and graphs"], ["math_k2"]),
  phase("math_6_8", "math", "Grades 6–8: Ratios, Algebra & Geometry", "13-18",
    ["Ratios and proportional reasoning", "Rational numbers", "Expressions and equations", "Linear relationships", "Geometry and transformations", "Statistics and probability"], ["math_3_5"]),
  phase("math_9_12", "math", "Grades 9–12: Algebra, Functions & Proof", "19-26",
    ["Algebra and equations", "Functions and modeling", "Geometry and proof", "Trigonometry", "Probability and statistics", "Discrete mathematics"], ["math_6_8"]),
  phase("math_university", "math", "University: Advanced Mathematics", "27-34",
    ["Linear algebra", "Discrete structures", "Real analysis foundations", "Probability and statistics", "Optimization", "Mathematical modeling"], ["math_9_12"]),

  phase("language_k2", "language_arts", "K–2: Early Literacy", "1-6",
    ["Phonological awareness", "Decoding and word recognition", "Reading fluency", "Vocabulary", "Sentence construction", "Narrative writing"]),
  phase("language_3_5", "language_arts", "Grades 3–5: Reading & Composition", "7-12",
    ["Comprehension and evidence", "Text structure", "Vocabulary and morphology", "Paragraphs and essays", "Grammar and revision", "Speaking and listening"], ["language_k2"]),
  phase("language_6_8", "language_arts", "Grades 6–8: Analysis & Argument", "13-18",
    ["Literary analysis", "Informational texts", "Claims and evidence", "Research and citation", "Style and revision", "Discussion and presentation"], ["language_3_5"]),
  phase("language_9_12", "language_arts", "Grades 9–12: Rhetoric & Research", "19-26",
    ["Close reading", "Rhetorical analysis", "Evidence-based argument", "Research methods", "Creative and technical writing", "Media literacy"], ["language_6_8"]),
  phase("language_university", "language_arts", "University: Advanced Reading & Writing", "27-34",
    ["Critical theory and interpretation", "Disciplinary research", "Academic argument", "Source evaluation", "Advanced rhetoric", "Scholarly communication"], ["language_9_12"]),

  phase("science_k2", "science", "K–2: Observe & Ask", "1-6",
    ["Living things", "Weather and sky", "Materials and properties", "Motion and forces", "Simple observations", "Ask and test questions"]),
  phase("science_3_5", "science", "Grades 3–5: Patterns & Systems", "7-12",
    ["Life cycles and ecosystems", "Matter and mixtures", "Energy and waves", "Earth systems", "Engineering design", "Measurements and data"], ["science_k2"]),
  phase("science_6_8", "science", "Grades 6–8: Models & Evidence", "13-18",
    ["Cells and heredity", "Chemical and physical change", "Forces and energy", "Earth and space systems", "Experimental design", "Data-based models"], ["science_3_5"]),
  phase("science_9_12", "science", "Grades 9–12: Core Sciences", "19-26",
    ["Biology and genetics", "Chemistry and reactions", "Physics and mechanics", "Earth and environmental science", "Scientific investigation", "Quantitative modeling"], ["science_6_8"]),
  phase("science_university", "science", "University: Scientific Foundations", "27-34",
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
    description: "Count a collection carefully and choose the numeral that tells how many objects there are.",
    theory: "A number tells how many objects are in a group. Count each object once, then say how many there are altogether.",
    problem: "There are 8 objects. How many objects are there? 8 = ____",
    answer: [8],
    choices: [
      { label: "6 objects", values: [6] },
      { label: "7 objects", values: [7] },
      { label: "8 objects", values: [8] },
      { label: "9 objects", values: [9] },
    ],
    visual: { kind: "count", values: [8], unit: "objects" },
    starter: "objects = 8\n# Add a print statement to show how many objects there are.\n",
    hints: ["print(objects)"],
  },
  {
    id: 702,
    title: "Add to Find the Total",
    description: "Join two groups and find how many objects there are altogether.",
    theory: "Addition joins groups together. Count the first group, then count on through the second group to find the total.",
    problem: "A group of 8 objects joins a group of 5. How many altogether? 8 + 5 = ____",
    answer: [13],
    choices: [
      { label: "11 objects", values: [11] },
      { label: "12 objects", values: [12] },
      { label: "13 objects", values: [13] },
      { label: "14 objects", values: [14] },
    ],
    visual: { kind: "combine", values: [8, 5], unit: "objects" },
    starter: "first_group = 8\nmore_objects = 5\n# Add a print statement to find the total.\n",
    hints: ["print(first_group + more_objects)"],
  },
  {
    id: 703,
    title: "Subtract to Compare",
    description: "Compare two groups and find how many more objects are in the larger group.",
    theory: "To find how many more, match objects from each group. Count the ones left unmatched in the larger group.",
    problem: "There are 14 red counters and 6 blue counters. How many more red counters? 14 - 6 = ____",
    answer: [8],
    choices: [
      { label: "6 counters", values: [6] },
      { label: "7 counters", values: [7] },
      { label: "8 counters", values: [8] },
      { label: "9 counters", values: [9] },
    ],
    visual: { kind: "compare", values: [14, 6], unit: "counters" },
    starter: "red_counters = 14\nblue_counters = 6\n# Print how many more red counters there are.\n",
    hints: ["print(red_counters - blue_counters)"],
  },
  {
    id: 704,
    title: "Build a Number with Tens and Ones",
    description: "Explore how bundles of ten and single objects make a two-digit number.",
    theory: "Ten ones can be bundled as one ten. In 34, there are 3 bundles of ten and 4 single ones.",
    problem: "Split 34 into tens and ones: 34 = ____ tens + ____ ones",
    answer: [3, 4],
    choices: [
      { label: "2 tens and 4 ones", values: [2, 4] },
      { label: "3 tens and 4 ones", values: [3, 4] },
      { label: "3 tens and 3 ones", values: [3, 3] },
      { label: "4 tens and 3 ones", values: [4, 3] },
    ],
    visual: { kind: "place-value", values: [34] },
    starter: "number = 34\n# Find the number of tens and ones, then print both.\n",
    hints: ["tens = number // 10", "ones = number % 10", "print(tens, ones)"],
  },
  {
    id: 705,
    title: "Make Equal Groups",
    description: "Make equal groups and find how many objects there are in all.",
    theory: "Equal groups have the same number of objects. Count each group, or count on by the same amount for every group.",
    problem: "There are 3 groups with 4 objects in each. How many objects total? 3 × 4 = ____",
    answer: [12],
    choices: [
      { label: "10 objects", values: [10] },
      { label: "11 objects", values: [11] },
      { label: "12 objects", values: [12] },
      { label: "13 objects", values: [13] },
    ],
    visual: { kind: "groups", values: [3, 4], unit: "objects" },
    starter: "groups = 3\nobjects_in_each_group = 4\n# Print the total number of objects.\n",
    hints: ["print(groups * objects_in_each_group)"],
  },
  {
    id: 706,
    title: "Compare Two Lengths",
    description: "Compare two ribbons measured in centimetres and find how much longer one ribbon is.",
    theory: "Line up the ends of two lengths. The part that extends past the shorter length shows how much longer it is.",
    problem: "A 12 cm ribbon and a 7 cm ribbon differ by how many centimetres? 12 - 7 = ____ cm",
    answer: [5],
    choices: [
      { label: "3 cm", values: [3] },
      { label: "4 cm", values: [4] },
      { label: "5 cm", values: [5] },
      { label: "6 cm", values: [6] },
    ],
    visual: { kind: "length", values: [12, 7], unit: "cm" },
    starter: "first_ribbon_cm = 12\nsecond_ribbon_cm = 7\n# Print the difference in centimetres.\n",
    hints: ["print(first_ribbon_cm - second_ribbon_cm)"],
  },
  {
    id: 707,
    phase: "math_3_5",
    title: "Hundreds, Tens, and Ones",
    description: "A three-digit number can be split into place values. Use whole-number division and remainders to find the hundreds, tens, and ones in 347.",
    theory: "A three-digit number has hundreds, tens, and ones. Integer division finds full place-value groups, and remainder (%) finds the digit left in a place.",
    problem: "Write 347 in hundreds, tens, and ones: 347 = ____ hundreds + ____ tens + ____ ones",
    visual: { kind: "place-value", values: [347] },
    starter: "number = 347\n# Find and print the hundreds, tens, and ones digits.\n",
    hints: [
      "hundreds = number // 100",
      "tens = (number // 10) % 10",
      "ones = number % 10",
      "print(hundreds, tens, ones)",
    ],
  },
  {
    id: 708,
    phase: "math_3_5",
    title: "Divide into Equal Shares",
    description: "Division shares a total equally among groups. Use whole-number division to find how many crayons go in each box.",
    theory: "Division splits a total into equal groups. The division operator (/) finds the share; whole-number division (//) counts whole items, while remainder (%) finds extras left over.",
    problem: "Share 6 crayons equally between 2 boxes. How many crayons in each box? 6 ÷ 2 = ____ crayons per box",
    visual: { kind: "share", values: [6, 2], unit: "crayons" },
    starter: "crayons = 6\nboxes = 2\n# Print how many crayons go in each box.\n",
    hints: ["print(crayons // boxes)"],
  },
  {
    id: 709,
    phase: "math_3_5",
    title: "Make an Equivalent Fraction",
    description: "Multiplying a fraction's numerator and denominator by the same number makes an equivalent fraction. Try doubling three-fourths.",
    theory: "A fraction names equal parts of a whole. Multiply both its numerator and denominator by the same nonzero number to create an equivalent fraction.",
    problem: "Double the numerator and denominator of 3/4: 3/4 = ____/____",
    visual: { kind: "fraction", values: [3, 4, 2] },
    starter: "numerator = 3\ndenominator = 4\nscale = 2\n# Scale both parts and print the new numerator and denominator.\n",
    hints: [
      "new_numerator = numerator * scale",
      "new_denominator = denominator * scale",
      "print(new_numerator, new_denominator)",
    ],
  },
  {
    id: 710,
    phase: "math_3_5",
    title: "Convert Metres to Centimetres",
    description: "One metre is 100 centimetres. Convert a length by multiplying the number of metres by 100.",
    theory: "The metric system is based on groups of ten. One metre equals 100 centimetres, so multiply metres by 100 to convert to centimetres.",
    problem: "Convert 2 metres to centimetres: 2 m × 100 = ____ cm",
    visual: { kind: "convert", values: [2, 100], unit: "cm" },
    starter: "length_m = 2\n# Convert the length to centimetres and print it.\n",
    hints: ["length_cm = length_m * 100", "print(length_cm)"],
  },
  {
    id: 711,
    phase: "math_3_5",
    title: "Find a Rectangle's Area and Perimeter",
    description: "Area counts square units inside a rectangle. Perimeter measures the distance around its edge.",
    theory: "Area measures the square units covering a rectangle: length × width. Perimeter measures the boundary: 2 × (length + width).",
    problem: "A rectangle is 8 units by 5 units. Find area and perimeter: area = ____ square units; perimeter = ____ units",
    visual: { kind: "rectangle", values: [8, 5] },
    starter: "length = 8\nwidth = 5\n# Calculate and print area and perimeter.\n",
    hints: [
      "area = length * width",
      "perimeter = 2 * (length + width)",
      "print(area, perimeter)",
    ],
  },
  {
    id: 712,
    phase: "math_3_5",
    title: "Find the Mean in a Data Set",
    description: "The mean is the total of the values divided by how many values there are. Find the average visitors across four days.",
    theory: "The mean (average) balances a data set. Add all the values, then divide by how many values are in the set.",
    problem: "Visitor counts are 5, 8, 6, and 7. What is the mean? (5 + 8 + 6 + 7) ÷ 4 = ____",
    visual: { kind: "mean", values: [5, 8, 6, 7], unit: "visitors" },
    starter: "monday = 5\ntuesday = 8\nwednesday = 6\nthursday = 7\n# Find and print the mean number of visitors.\n",
    hints: [
      "total = monday + tuesday + wednesday + thursday",
      "mean = total / 4",
      "print(mean)",
    ],
  },
  {
    id: 713,
    title: "Vectors: The Dot Product",
    description: "A vector stores several numbers at once. The dot product multiplies matching components and adds the results — a foundation of linear algebra.",
    theory: "To find the dot product of two vectors, multiply their matching components and add every product. The result is one number that measures how strongly the vectors point the same way.",
    problem: "Find the dot product of [2, 3, 4] and [5, 6, 7]: (2·5) + (3·6) + (4·7) = ____",
    starter: "a = [2, 3, 4]\nb = [5, 6, 7]\ntotal = 0\n# Add each pair's product, then print the dot product.\n",
    hints: ["for i in range(len(a)):", "    total = total + a[i] * b[i]", "print(total)"],
  },
  {
    id: 714,
    title: "A Converging Series",
    description: "Adding 1 + 1/2 + 1/4 + ... creeps closer and closer to 2 but never passes it. Watch the running total converge on the graph.",
    theory: "A geometric series adds terms that shrink by the same ratio each step. When each term is half the one before, the running total approaches a limit — here, 2.",
    problem: "Print the running total after each of the first 5 terms: ____, ____, ____, ____, ____",
    starter: "term = 1\ntotal = 0\n# Add each term to the total and print the running total five times.\n",
    hints: ["for i in range(5):", "    total = total + term", "    print(total)", "    term = term / 2"],
  },
  {
    id: 715,
    title: "Model a Parabola",
    description: "A function turns each input into an output. Sampling f(x) = x² across inputs traces the curve a graphing calculator would draw.",
    theory: "Evaluating a function at many inputs produces points that outline its graph. For f(x) = x², outputs grow faster as x increases, forming a parabola.",
    problem: "Evaluate f(x) = x² for x = 0, 1, 2, 3, 4, 5: ____, ____, ____, ____, ____, ____",
    starter: "# Print f(x) = x*x for each whole number x from 0 to 5.\n",
    hints: ["for x in range(6):", "    print(x * x)"],
  },
  {
    id: 716,
    title: "The Slope of a Curve",
    description: "Calculus finds the slope of a curve at a single point by taking a tiny step. Estimate the slope of f(x) = x² at x = 3.",
    theory: "The derivative is the slope of a function at a point. Approximate it with a tiny step h: (f(x+h) − f(x)) / h. As h shrinks, the estimate nears the exact slope.",
    problem: "Estimate the slope of f(x) = x² at x = 3 using h = 0.001, rounded to 3 decimals: ____",
    starter: "x = 3\nh = 0.001\n# Estimate the slope with (f(x+h)-f(x))/h and print it rounded to 3 decimals.\n",
    hints: ["slope = ((x + h) * (x + h) - x * x) / h", "print(round(slope, 3))"],
  },
  {
    id: 717,
    title: "Area Under a Curve",
    description: "Integration adds up thin rectangles to measure the area beneath a curve. Accumulate the area under f(x) = x² step by step.",
    theory: "A Riemann sum approximates the area under a curve with rectangles. Each rectangle's area is its height f(x) times its width. Summing them estimates the integral.",
    problem: "With width-1 rectangles of height x² at x = 0, 1, 2, 3, print the running area total: ____, ____, ____, ____",
    starter: "area = 0\n# For x = 0, 1, 2, 3 add x*x*1 to the area and print the running total.\n",
    hints: ["for x in range(4):", "    area = area + x * x * 1", "    print(area)"],
  },
  {
    id: 718,
    title: "Mean and Variance",
    description: "Statistics summarize data. The mean is the balance point; the variance measures how spread out the values are.",
    theory: "The mean is the sum of the values divided by their count. The variance is the mean of the squared differences from the mean — larger when the data spreads wider.",
    problem: "For the data 4, 8, 6, 2, print the mean and then the variance: mean = ____, variance = ____",
    starter: "data = [4, 8, 6, 2]\nn = len(data)\ntotal = 0\n# Print the mean, then the variance (mean of squared deviations).\n",
    hints: ["mean = sum(data) / n", "for value in data:", "    total = total + (value - mean) ** 2", "print(mean, total / n)"],
  },
  {
    id: 719,
    title: "Counting Combinations",
    description: "Discrete math counts possibilities. The number of ways to choose k items from n is built from factorials.",
    theory: "A factorial n! multiplies every whole number from 1 to n. The number of ways to choose k items from n is n! / (k! · (n−k)!).",
    problem: "How many ways can you choose 2 items from 5? 5! / (2! · 3!) = ____",
    starter: "def factorial(n):\n    result = 1\n    for i in range(2, n + 1):\n        result = result * i\n    return result\nn = 5\nk = 2\n# Print n! / (k! * (n-k)!).\n",
    hints: ["print(factorial(n) // (factorial(k) * factorial(n - k)))"],
  },
  {
    id: 720,
    title: "Find the Minimum",
    description: "Optimization finds the input that makes a function smallest. Sample f(x) = (x−3)² + 2 and see where it bottoms out.",
    theory: "Many problems reduce to minimizing a function. Sampling f(x) across inputs reveals its lowest point — the vertex of this parabola is its minimum value.",
    problem: "Print f(x) = (x−3)² + 2 for x = 1, 2, 3, 4, 5: ____, ____, ____, ____, ____",
    starter: "# Print f(x) = (x-3)**2 + 2 for each whole number x from 1 to 5.\n",
    hints: ["for x in range(1, 6):", "    print((x - 3) ** 2 + 2)"],
  },
].map(({ id, title, description, theory, problem, answer, choices, visual, starter, hints }) => ({
  id,
  phase: id <= 706 ? "math_k2" : id <= 712 ? "math_3_5" : "math_university",
  title,
  description,
  source: credit,
  kind: "math",
  math: {
    theory,
    problem,
    visual,
    ...(answer ? { answer, choices } : {}),
  },
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
// K–5 math is locked out of the live site pending a redesign. The K–2 and
// Grades 3–5 lesson definitions above are kept in source for that future work,
// but they are NOT published: only the University lessons (id 713+) go live, and
// the K–2 / 3–5 phases stay "coming-soon" so they appear on the roadmap instead
// of as live lessons.
const math35Phase = data.phases.find((item) => item.id === "math_3_5");
if (!math35Phase) throw new Error("Missing Math Grades 3-5 phase");
math35Phase.status = "coming-soon";
const mathUniversityPhase = data.phases.find((item) => item.id === "math_university");
if (!mathUniversityPhase) throw new Error("Missing Math University phase");
delete mathUniversityPhase.status;
data.lessons = data.lessons.filter((item) => item.id < 701 || item.id > 720);
data.lessons.push(...lessons.filter((item) => item.id >= 713));
data.phases.sort((a, b) => {
  const trackOrder = data.tracks.findIndex((track) => track.id === a.track) -
    data.tracks.findIndex((track) => track.id === b.track);
  return trackOrder || Number(a.range.split("-")[0]) - Number(b.range.split("-")[0]);
});
data.lessons.sort((a, b) => a.id - b.id);

for (const item of lessons) {
  if (!item.source.includes("Paul McWhorter") || !item.codeTemplate.starter.includes("\n"))
    throw new Error(`Invalid math lesson ${item.id}`);
  if (item.phase === "math_k2" && (!item.math.answer || !item.math.choices?.length))
    throw new Error(`Guided math lesson ${item.id} needs an answer and choices`);
}
const serialized = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(filePath, serialized);
fs.writeFileSync(path.join(BE, "lessons.json"), serialized);
console.log("Published University math (713-720); locked K-5 (701-712) out as coming-soon.");
