const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const frontend = path.join(root, "public", "data", "lessons.json");
const backend = path.join(root, "..", "backend", "Synapsys.Api", "Data", "lessons.json");
const data = JSON.parse(fs.readFileSync(frontend, "utf8"));

const track = {
  id: "react",
  name: "React App Building",
  icon: "⚛",
  blurb: "Build original interactive web apps with React components, JSX, props, state, and events.",
  accent: "#61dafb",
};
const phase = {
  id: "react_foundations",
  track: "react",
  name: "React Foundations",
  range: "1-6",
  concepts: [
    "Components and rendered output",
    "JSX and semantic structure",
    "Props and reusable UI",
    "State and events",
    "Rendering collections",
    "Forms and a small app",
  ],
};
const source = "Paul McWhorter (toptechboy.com; Patreon) — coding-education inspiration; original React lessons authored by Synapsis.";
const circuit = { palette: [], required: [], notes: "" };
const lesson = (id, title, description, expectedText, starter, hints) => ({
  id,
  phase: "react_foundations",
  title,
  description,
  source,
  kind: "react",
  react: { expectedText },
  featuredComponent: "terminal",
  circuit,
  codeTemplate: { language: "javascript", starter },
  hints,
  output: { initial: "Run your React app to see the preview.", status: "Waiting for your JSX..." },
});

const lessons = [
  lesson(
    801,
    "Render Your First Component",
    "Complete a React component and render a clear welcome heading in the preview.",
    "Hello from Synapsis",
    `function App() {
  return (
    <main>
      {/* Add a heading that welcomes the learner. */}
    </main>
  );
}
`,
    ["Return one JSX element from App.", "Try an h1 with the text Hello from Synapsis."],
  ),
  lesson(
    802,
    "Shape a Page with JSX",
    "Use semantic JSX elements to give a small page a heading and a helpful sentence.",
    "Build in small steps",
    `function App() {
  return (
    <main>
      {/* Add a heading and a short paragraph. */}
    </main>
  );
}
`,
    ["Use a main element for the page content.", "Place an h2 and a p inside main."],
  ),
  lesson(
    803,
    "Reuse a Component with Props",
    "Pass a name into a reusable Greeting component and render it in the app.",
    "Trail Maker",
    `function Greeting({ name }) {
  return <p>Welcome, {name}!</p>;
}

function App() {
  return (
    <main>
      {/* Render Greeting with the name Trail Maker. */}
    </main>
  );
}
`,
    ["Give Greeting a name prop.", "Render <Greeting name=\"Trail Maker\" /> inside App."],
  ),
  lesson(
    804,
    "Update State with a Click",
    "Use useState and a button event so the preview changes from zero to one when clicked.",
    "Count: 1",
    `function App() {
  const [count, setCount] = React.useState(0);

  return (
    <main>
      <p>Count: {count}</p>
      {/* Add a button that increases count by one. */}
    </main>
  );
}
`,
    ["Add a button with an onClick handler.", "Call setCount(count + 1) when the button is clicked."],
  ),
  lesson(
    805,
    "Render a List from Data",
    "Turn an array of small activity names into a semantic list with map.",
    "Test",
    `function App() {
  const activities = ["Draw", "Build", "Test"];

  return (
    <main>
      <h2>Workshop plan</h2>
      {/* Use map to render an li for every activity. */}
    </main>
  );
}
`,
    ["Map over activities.", "Give each li a key and show its activity text."],
  ),
  lesson(
    806,
    "Build a Tiny Reading List",
    "Use controlled input, state, and a submit event to add a title to a reading list.",
    "Added: Green Trails",
    `function App() {
  const [title, setTitle] = React.useState("");
  const [savedTitle, setSavedTitle] = React.useState("");

  function addTitle(event) {
    event.preventDefault();
    setSavedTitle(title);
  }

  return (
    <main>
      <h2>Reading list</h2>
      <form onSubmit={addTitle}>
        <label>
          Book title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button type="submit">Add title</button>
      </form>
      {savedTitle && <p>Added: {savedTitle}</p>}
    </main>
  );
}
`,
    ["Keep the input connected to title with value and onChange.", "Try Green Trails, then submit the form."],
  ),
];

data.tracks = data.tracks.filter((item) => item.id !== track.id);
data.tracks.push(track);
data.phases = data.phases.filter((item) => item.id !== phase.id);
data.phases.push(phase);
data.lessons = data.lessons.filter((item) => item.id < 801 || item.id > 806);
data.lessons.push(...lessons);
data.phases.sort((a, b) =>
  data.tracks.findIndex((item) => item.id === a.track) -
    data.tracks.findIndex((item) => item.id === b.track) ||
  Number(a.range.split("-")[0]) - Number(b.range.split("-")[0]),
);
data.lessons.sort((a, b) => a.id - b.id);

for (const item of lessons) {
  if (item.kind !== "react" || !item.react.expectedText || !item.source.includes("Paul McWhorter"))
    throw new Error(`Invalid React lesson ${item.id}`);
}

const serialized = `${JSON.stringify(data, null, 2)}\n`;
fs.writeFileSync(frontend, serialized);
fs.writeFileSync(backend, serialized);
console.log("Published six original, runnable React app-building lessons.");
