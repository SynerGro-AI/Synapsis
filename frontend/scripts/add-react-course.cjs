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
const phases = [
  {
    id: "react_foundations",
    track: "react",
    name: "React Foundations",
    range: "1-6",
    concepts: ["Components", "JSX", "Props", "State and events", "Lists", "Forms"],
  },
  {
    id: "react_production_ui",
    track: "react",
    name: "Production UI Patterns",
    range: "7-12",
    concepts: ["Component composition", "Design systems", "Responsive layouts", "Search", "Validated forms", "Accessible data tables"],
  },
  {
    id: "react_enterprise_apps",
    track: "react",
    name: "Enterprise Application Patterns",
    range: "13-18",
    concepts: ["Derived dashboards", "Filtering and sorting", "Approval workflows", "Role-aware interfaces", "Loading and error states", "Empty states"],
  },
  {
    id: "react_quality_capstone",
    track: "react",
    name: "Quality and Corporate Capstone",
    range: "19-24",
    concepts: ["Reusable components", "Accessible announcements", "Efficient rendering", "Pagination", "Audit activity", "Service operations console"],
  },
];
const source = "Paul McWhorter (toptechboy.com; Patreon) — coding-education inspiration; original React lessons authored by Synapsis.";
const circuit = { palette: [], required: [], notes: "" };
const lesson = (id, title, description, expectedText, starter, hints, codeSteps) => ({
  id,
  phase:
    id <= 806
      ? "react_foundations"
      : id <= 812
        ? "react_production_ui"
        : id <= 818
          ? "react_enterprise_apps"
          : "react_quality_capstone",
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

const advancedLessons = [
  lesson(
    807,
    "Compose a Reusable Metric Card",
    "Production interfaces are assembled from small components with clear props. Build one metric card once, then give each instance its own label and value.",
    "Open cases",
    `function MetricCard({ label, value }) {
  return (
    <article>
      {/* Show the label and value. */}
    </article>
  );
}

function App() {
  return (
    <main>
      <h1>Operations</h1>
      {/* Render a reusable metric card. */}
    </main>
  );
}
`,
    ["Display label and value inside MetricCard.", "Render MetricCard with label=\"Open cases\" and value={12}."],
    [
      { instruction: "Inside MetricCard, render both props as readable text.", explanation: "A component gets its inputs from props, so one implementation can present many different metrics.", code: "<h2>{label}</h2>\n<p>{value}</p>" },
      { instruction: "Render the card from App with an operations metric.", explanation: "The JSX component tag passes named values into the reusable card.", code: '<MetricCard label="Open cases" value={12} />' },
    ],
  ),
  lesson(
    808,
    "Apply a Consistent Design System",
    "A small set of named design tokens keeps spacing, color, and typography consistent. Start with JavaScript style values that every component can reuse.",
    "Service desk",
    `function App() {
  const tokens = {
    space: 16,
    ink: "#172033",
    accent: "#176b87",
  };

  return (
    <main>
      {/* Use the tokens in a styled service-desk panel. */}
    </main>
  );
}
`,
    ["Use tokens.accent and tokens.space rather than repeating raw values.", "Give the panel a heading named Service desk."],
    [
      { instruction: "Add a panel that uses the shared spacing, ink, and accent tokens.", explanation: "Inline styles in React use a JavaScript object and camelCase property names.", code: '<section style={{ padding: tokens.space, color: tokens.ink, borderTop: `4px solid ${tokens.accent}` }}>\n  <h1>Service desk</h1>\n</section>' },
    ],
  ),
  lesson(
    809,
    "Build a Responsive Card Layout",
    "Interfaces must adapt to narrow and wide screens. Flex wrapping lets a row of cards move onto additional lines when the viewport is small.",
    "Queue health",
    `function App() {
  const cardStyle = {
    flex: "1 1 180px",
    padding: 16,
    border: "1px solid #8793a2",
  };

  return (
    <main>
      {/* Create a wrapping group of operations cards. */}
    </main>
  );
}
`,
    ["Set flexWrap to wrap on the group.", "Add cards with flexible minimum widths."],
    [
      { instruction: "Create a flex container that wraps its child cards.", explanation: "flexWrap allows the cards to continue on another row instead of overflowing a phone screen.", code: '<section style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>\n  <article style={cardStyle}><h2>Queue health</h2><p>Stable</p></article>\n  <article style={cardStyle}><h2>Response time</h2><p>4 hours</p></article>\n</section>' },
    ],
  ),
  lesson(
    810,
    "Search an Employee Directory",
    "A controlled search field keeps the query in React state. Derive visible results from the source records rather than maintaining a second, potentially stale copy.",
    "Aster Systems",
    `function App() {
  const people = ["Aster Systems", "Beacon Works", "Cedar Group"];
  const [query, setQuery] = React.useState("");

  return (
    <main>
      <h1>Partner directory</h1>
      {/* Add a search field and matching results. */}
    </main>
  );
}
`,
    ["Connect the input value and onChange to query.", "Filter people with a case-insensitive match."],
    [
      { instruction: "Add a labeled search field controlled by query.", explanation: "The input value is always the current React state; onChange updates that state as the learner types.", code: '<label>Search partners <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>' },
      { instruction: "Render only names that include the query, ignoring letter case.", explanation: "Filtering is derived from the original list on each render, so there is no duplicate result state to synchronize.", code: '{people.filter((person) => person.toLowerCase().includes(query.toLowerCase())).map((person) => <p key={person}>{person}</p>)}' },
    ],
  ),
  lesson(
    811,
    "Validate a Request Form",
    "Business forms should use native input constraints and provide clear confirmation only after a valid submission. Client-side validation improves usability; a server must still validate submitted data.",
    "Request received",
    `function App() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  function submitRequest(event) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <main>
      <h1>Access request</h1>
      <form onSubmit={submitRequest}>
        <label>
          Work email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        {/* Add a submit button. */}
      </form>
      {sent && <p role="status">Request received</p>}
    </main>
  );
}
`,
    ["Add an explicit submit button inside the form.", "Enter a valid email in the preview and submit."],
    [
      { instruction: "Add a submit button so the form handler can run.", explanation: "The required email field and email type use browser validation before submission.", code: '<button type="submit">Send request</button>' },
    ],
  ),
  lesson(
    812,
    "Present Records in an Accessible Table",
    "Use a real table when people need to compare records by row and column. Column headers and scoped header cells make relationships understandable to screen readers.",
    "Aster Systems",
    `function App() {
  const accounts = [
    { id: 1, name: "Aster Systems", plan: "Enterprise" },
    { id: 2, name: "Beacon Works", plan: "Business" },
  ];

  return (
    <main>
      <h1>Account register</h1>
      {/* Build a semantic table from accounts. */}
    </main>
  );
}
`,
    ["Use thead and tbody with column headings.", "Map each account into a row with a stable key."],
    [
      { instruction: "Create a table with scoped column headers, then render each account row.", explanation: "Semantic table structure helps users navigate relationships between account names and plans.", code: "<table>\n  <thead><tr><th scope=\"col\">Account</th><th scope=\"col\">Plan</th></tr></thead>\n  <tbody>{accounts.map((account) => <tr key={account.id}><th scope=\"row\">{account.name}</th><td>{account.plan}</td></tr>)}</tbody>\n</table>" },
    ],
  ),
  lesson(
    813,
    "Calculate Dashboard Metrics from Data",
    "Operational dashboards should derive totals from records, not hard-code numbers that drift away from the underlying data. Array filters produce counts that update when the data changes.",
    "Open: 2",
    `function App() {
  const cases = [
    { id: 1, status: "Open" },
    { id: 2, status: "Open" },
    { id: 3, status: "Resolved" },
  ];

  return (
    <main>
      <h1>Case overview</h1>
      {/* Calculate and display the open-case count. */}
    </main>
  );
}
`,
    ["Count records whose status is Open.", "Render the count in a labeled metric."],
    [
      { instruction: "Derive the open total from cases and display it as a metric.", explanation: "Filtering source data makes the displayed number auditable and keeps the UI tied to the records.", code: 'const openCount = cases.filter((item) => item.status === "Open").length;\n<p>Open: {openCount}</p>' },
    ],
  ),
  lesson(
    814,
    "Filter a Service Queue",
    "Give operators a simple status filter and derive matching records from the current selection. Keep the filter labeled so its purpose is clear to all users.",
    "Case 104",
    `function App() {
  const cases = [
    { id: 104, status: "Open" },
    { id: 105, status: "Resolved" },
  ];
  const [status, setStatus] = React.useState("All");

  return (
    <main>
      <h1>Service queue</h1>
      {/* Add a status selector and filtered cases. */}
    </main>
  );
}
`,
    ["Make the selector controlled by status.", "Show all cases or only cases with the selected status."],
    [
      { instruction: "Add an accessible status selector and list the matching case IDs.", explanation: "The All option leaves the queue unchanged; other options narrow the displayed records.", code: '<label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Open</option><option>Resolved</option></select></label>\n{cases.filter((item) => status === "All" || item.status === status).map((item) => <p key={item.id}>Case {item.id} — {item.status}</p>)}' },
    ],
  ),
  lesson(
    815,
    "Sort Records by Priority",
    "Sorting should produce a new ordered array without mutating the original data. A sort control lets an operator change the view while preserving the canonical records.",
    "Critical",
    `function App() {
  const cases = [
    { id: 201, priority: "Normal" },
    { id: 202, priority: "Critical" },
  ];
  const [criticalFirst, setCriticalFirst] = React.useState(true);
  const ordered = [...cases].sort((a, b) =>
    criticalFirst ? a.priority.localeCompare(b.priority) : b.priority.localeCompare(a.priority)
  );

  return (
    <main>
      <h1>Priority queue</h1>
      {/* Add a sort toggle and render ordered cases. */}
    </main>
  );
}
`,
    ["Add a button that changes criticalFirst.", "Render ordered rows and do not sort cases directly."],
    [
      { instruction: "Add a named button and render the ordered case priorities.", explanation: "The copied array protects the original case data from in-place sorting.", code: '<button type="button" onClick={() => setCriticalFirst(!criticalFirst)}>Change priority order</button>\n{ordered.map((item) => <p key={item.id}>Case {item.id}: {item.priority}</p>)}' },
    ],
  ),
  lesson(
    816,
    "Model an Approval Workflow",
    "Represent a workflow with explicit states and allow only the intended transition. Real authorization must be enforced by a trusted server; a client-side status is only a user-interface demonstration.",
    "Status: Pending",
    `function App() {
  const [status, setStatus] = React.useState("Draft");

  return (
    <main>
      <h1>Purchase approval</h1>
      <p>Status: {status}</p>
      {/* Add a submit-for-review action while the request is a draft. */}
    </main>
  );
}
`,
    ["Show a submit button only while status is Draft.", "Change the status to Pending when it is pressed."],
    [
      { instruction: "Render an action that transitions a draft into review.", explanation: "A conditional action reflects the current workflow state; a server still owns the authoritative approval.", code: '{status === "Draft" && <button type="button" onClick={() => setStatus("Pending")}>Submit for review</button>}' },
    ],
  ),
  lesson(
    817,
    "Build a Role-Aware Interface",
    "Different roles may need different navigation or controls. This lesson changes what the UI displays; hiding a button is not authorization and must never replace server-side access checks.",
    "Admin tools",
    `function App() {
  const [role, setRole] = React.useState("Viewer");

  return (
    <main>
      <h1>Workspace</h1>
      <label>
        Demo role
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option>Viewer</option>
          <option>Administrator</option>
        </select>
      </label>
      {/* Show a demo-only admin link for the Administrator role. */}
    </main>
  );
}
`,
    ["Conditionally show the admin link for Administrator.", "Choose Administrator in the preview to reveal it."],
    [
      { instruction: "Render the admin-only UI when the selected demo role is Administrator.", explanation: "This is presentation logic only; the API must independently verify identity and permissions.", code: '{role === "Administrator" && <p>Admin tools</p>}' },
    ],
  ),
  lesson(
    818,
    "Handle Loading and Retry States",
    "Enterprise screens should communicate loading and failure instead of showing an unexplained blank area. Model each state explicitly and give users a clear retry action.",
    "Report ready",
    `function App() {
  const [status, setStatus] = React.useState("Loading report…");

  return (
    <main>
      <h1>Quarterly report</h1>
      <p role="status" aria-live="polite">{status}</p>
      {/* Add a retry button that loads the sample report. */}
    </main>
  );
}
`,
    ["Add a button to update status to Report ready.", "The sample is local; no network request is made."],
    [
      { instruction: "Add a retry action that switches the message to a ready state.", explanation: "A production client should distinguish loading, success, and failure while handling actual server responses.", code: '<button type="button" onClick={() => setStatus("Report ready")}>Retry sample</button>' },
    ],
  ),
  lesson(
    819,
    "Design a Helpful Empty State",
    "A search with no matches should explain what happened and offer a next step. Empty states reduce confusion and help people recover from filters that are too narrow.",
    "No matching records",
    `function App() {
  const [query, setQuery] = React.useState("unknown");
  const records = ["Aster Systems", "Beacon Works"];
  const matches = records.filter((record) =>
    record.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main>
      <h1>Account search</h1>
      <label>Search <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {/* Show results or a useful empty state. */}
    </main>
  );
}
`,
    ["Render matches when present.", "Otherwise explain that no records match."],
    [
      { instruction: "Render matching accounts or a clear empty-state message.", explanation: "Conditional rendering makes both the populated and empty outcomes explicit.", code: '{matches.length ? matches.map((record) => <p key={record}>{record}</p>) : <p>No matching records</p>}' },
    ],
  ),
  lesson(
    820,
    "Extract a Shared Page Header",
    "A consistent header is a useful component boundary: it receives a title and description as props, making the same page chrome reusable across corporate screens.",
    "Operations overview",
    `function PageHeader({ title, description }) {
  return (
    <header>
      {/* Render the title and description. */}
    </header>
  );
}

function App() {
  return (
    <main>
      {/* Reuse PageHeader with operations content. */}
    </main>
  );
}
`,
    ["Render both header props.", "Pass title=\"Operations overview\" from App."],
    [
      { instruction: "Use semantic heading and paragraph elements for the component props.", explanation: "A focused component API makes page structure reusable and easier to review.", code: "<h1>{title}</h1>\n<p>{description}</p>" },
      { instruction: "Render PageHeader with an operations title and a short description.", explanation: "Each page can reuse the header while supplying its own content.", code: '<PageHeader title="Operations overview" description="Daily service activity" />' },
    ],
  ),
  lesson(
    821,
    "Announce Updates to Assistive Technology",
    "When an action changes important content, an aria-live status region can announce the update to screen-reader users. Keep the announcement concise and tied to the actual state.",
    "3 records loaded",
    `function App() {
  const [message, setMessage] = React.useState("No report loaded");

  return (
    <main>
      <h1>Report center</h1>
      <p role="status" aria-live="polite">{message}</p>
      {/* Add a load action that announces the result. */}
    </main>
  );
}
`,
    ["Use a button to update the message.", "The status region is already labeled for live announcements."],
    [
      { instruction: "Add a button that loads the sample and updates the live status.", explanation: "React state updates the visible message and polite live-region announcement together.", code: '<button type="button" onClick={() => setMessage("3 records loaded")}>Load sample report</button>' },
    ],
  ),
  lesson(
    822,
    "Paginate a Long Record List",
    "Pagination keeps a large table manageable by showing a window of records at a time. The current page is state; derive the visible slice from the original list.",
    "Page 2",
    `function App() {
  const records = ["Case 101", "Case 102", "Case 103", "Case 104"];
  const [page, setPage] = React.useState(0);
  const pageSize = 2;
  const visible = records.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <main>
      <h1>Case register</h1>
      <p>Page {page + 1}</p>
      {/* Render the current page and a next-page button. */}
    </main>
  );
}
`,
    ["Map visible records into keyed paragraphs.", "Advance the page when Next is selected."],
    [
      { instruction: "Render visible records and a button to open the next page.", explanation: "The disabled condition prevents moving past the last page.", code: '{visible.map((record) => <p key={record}>{record}</p>)}\n<button type="button" disabled={(page + 1) * pageSize >= records.length} onClick={() => setPage(page + 1)}>Next page</button>' },
    ],
  ),
  lesson(
    823,
    "Record an Activity Audit Trail",
    "An activity feed makes recent actions visible to operators. Append a new immutable entry to state so earlier events remain in the displayed history.",
    "Maya approved case #104",
    `function App() {
  const [events, setEvents] = React.useState(["Sam opened case #103"]);

  return (
    <main>
      <h1>Recent activity</h1>
      {/* Add an approval event and render the activity feed. */}
    </main>
  );
}
`,
    ["Append a new item using the previous state.", "Render events with stable keys."],
    [
      { instruction: "Add an action that appends the approval event, then render the feed.", explanation: "The functional state update uses the latest event list and preserves existing entries.", code: '<button type="button" onClick={() => setEvents((previous) => [...previous, "Maya approved case #104"])}>Approve case #104</button>\n<ul>{events.map((event) => <li key={event}>{event}</li>)}</ul>' },
    ],
  ),
  lesson(
    824,
    "Capstone: Service Operations Console",
    "Bring the course together in a small, data-driven operations console: a clear page heading, derived queue metrics, an accessible status filter, and a record table. The preview uses local sample data; APIs, authentication, authorization, and persistence belong on a trusted backend.",
    "Resolved: 3",
    `function App() {
  const requests = [
    { id: 104, owner: "Maya Chen", status: "Open" },
    { id: 105, owner: "Ari Singh", status: "Resolved" },
    { id: 106, owner: "Noah Park", status: "Resolved" },
    { id: 107, owner: "Lina Ortiz", status: "Resolved" },
  ];
  const [filter, setFilter] = React.useState("All");
  const openCount = requests.filter((request) => request.status === "Open").length;
  const resolvedCount = requests.filter((request) => request.status === "Resolved").length;
  const visibleRequests = requests.filter((request) =>
    filter === "All" || request.status === filter
  );

  return (
    <main>
      {/* Add the operations heading. */}
      {/* Add the derived queue metrics. */}
      <label>Status filter
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option>All</option><option>Open</option><option>Resolved</option>
        </select>
      </label>
      <table>
        <thead><tr><th scope="col">Request</th><th scope="col">Owner</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {/* Render the filtered requests as accessible rows. */}
        </tbody>
      </table>
    </main>
  );
}
`,
    ["Use a heading that identifies the service operations console.", "Display openCount and resolvedCount as summary metrics.", "Map visibleRequests into table rows using request.id as the key."],
    [
      { instruction: "Add a clear page heading and short operational description.", explanation: "A single h1 names the application screen and helps users orient themselves.", code: "<header><h1>Service Operations</h1><p>Requests needing attention</p></header>" },
      { instruction: "Show the two counts already derived from the request records.", explanation: "The summaries are calculated from the same data shown in the table.", code: '<section aria-label="Queue summary"><p>Open: {openCount}</p><p>Resolved: {resolvedCount}</p></section>' },
      { instruction: "Render the filtered requests as keyed semantic table rows.", explanation: "The filter is real component state, and the table preserves clear row-to-column relationships.", code: '{visibleRequests.map((request) => <tr key={request.id}><th scope="row">#{request.id}</th><td>{request.owner}</td><td>{request.status}</td></tr>)}' },
    ],
  ),
];

data.tracks = data.tracks.filter((item) => item.id !== track.id);
data.tracks.push(track);
data.phases = data.phases.filter((item) => !phases.some((phaseItem) => phaseItem.id === item.id));
data.phases.push(...phases);
data.lessons = data.lessons.filter((item) => item.id < 801 || item.id > 824);
data.lessons.push(...lessons, ...advancedLessons);
data.phases.sort((a, b) =>
  data.tracks.findIndex((item) => item.id === a.track) -
    data.tracks.findIndex((item) => item.id === b.track) ||
  Number(a.range.split("-")[0]) - Number(b.range.split("-")[0]),
);
data.lessons.sort((a, b) => a.id - b.id);

for (const item of [...lessons, ...advancedLessons]) {
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
console.log("Published 24 original, runnable React app-building lessons.");
