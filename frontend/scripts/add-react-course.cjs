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
const lesson = (id, title, description, expectedText, starter, hints, codeSteps) => ({
  id,
  phase: "react_foundations",
  title,
  description,
  source,
  kind: "react",
  react: { expectedText, codeSteps },
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
    "A React component is a JavaScript function that describes part of a page. It returns JSX, which looks like HTML, and React turns that JSX into the visible interface.",
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
    [
      {
        instruction: "Inside the main element, add a heading that welcomes the learner.",
        explanation: "JSX uses familiar tag-shaped elements. The h1 marks the page's main heading.",
        code: "<h1>Hello from Synapsis</h1>",
      },
    ],
  ),
  lesson(
    802,
    "Shape a Page with JSX",
    "JSX lets you describe the structure of a page with elements. Semantic tags such as main, h2, and p make the page easier to understand for both people and assistive technology.",
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
    [
      {
        instruction: "Add a section heading inside main.",
        explanation: "An h2 introduces a section beneath the page's main heading.",
        code: "<h2>Build in small steps</h2>",
      },
      {
        instruction: "Under the heading, add one sentence in a paragraph.",
        explanation: "A p element groups a short piece of readable text.",
        code: "<p>Each element adds useful structure.</p>",
      },
    ],
  ),
  lesson(
    803,
    "Reuse a Component with Props",
    "A component can be reused with different information instead of hard-coding every copy. Props are named values passed to a component, like inputs passed to a function.",
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
    [
      {
        instruction: "Inside App's main element, render Greeting with a name prop.",
        explanation: "The name prop supplies this use of Greeting with the text it should display.",
        code: '<Greeting name="Trail Maker" />',
      },
    ],
  ),
  lesson(
    804,
    "Update State with a Click",
    "React state remembers a value between renders. useState gives you the current value and a setter; calling the setter updates the screen. An onClick event connects that update to a button press.",
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
    [
      {
        instruction: "Add a button that calls the setter to increase the count.",
        explanation: "The click handler uses the current count to calculate and display the next value.",
        code: '<button onClick={() => setCount(count + 1)}>Add one</button>',
      },
    ],
  ),
  lesson(
    805,
    "Render a List from Data",
    "When data is stored in an array, JavaScript's map method can turn each value into a JSX element. A key helps React keep track of each item when the list changes.",
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
    [
      {
        instruction: "Inside a ul element, map each activity to a list item.",
        explanation: "Each pass through map creates one li. The key gives React a stable identity for each item.",
        code: `{activities.map((activity) => (
  <li key={activity}>{activity}</li>
))}`,
      },
    ],
  ),
  lesson(
    806,
    "Build a Tiny Reading List",
    "A controlled input gets its value from React state and updates that state when the learner types. A form submit handler can then save the value and render it as a new result.",
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
        {/* Add a labeled text input connected to title. */}
        {/* Add a submit button. */}
      </form>
      {/* Show the saved title after submission. */}
    </main>
  );
}
`,
    ["Keep the input connected to title with value and onChange.", "Try Green Trails, then submit the form."],
    [
      {
        instruction: "Replace the first comment with a labeled input connected to the title state.",
        explanation: "The value prop displays state, and onChange updates it whenever the learner types.",
        code: `<label>
  Book title
  <input value={title} onChange={(event) => setTitle(event.target.value)} />
</label>`,
      },
      {
        instruction: "Replace the next comment with a button that submits the form.",
        explanation: "A submit button runs the existing addTitle handler, which saves the current input.",
        code: '<button type="submit">Add title</button>',
      },
      {
        instruction: "Replace the last comment with a message that appears after a title is saved.",
        explanation: "This conditional JSX only renders the paragraph when savedTitle has a value.",
        code: "{savedTitle && <p>Added: {savedTitle}</p>}",
      },
    ],
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
  if (
    item.kind !== "react" ||
    !item.react.expectedText ||
    !item.react.codeSteps.length ||
    !item.source.includes("Paul McWhorter")
  )
    throw new Error(`Invalid React lesson ${item.id}`);
}

const serialized = `${JSON.stringify(data, null, 2)}\n`;
fs.writeFileSync(frontend, serialized);
fs.writeFileSync(backend, serialized);
console.log("Published six original, runnable React app-building lessons.");
