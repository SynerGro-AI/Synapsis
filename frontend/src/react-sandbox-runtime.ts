import React from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    SynapsisReact?: typeof React;
    SynapsisCreateRoot?: typeof createRoot;
  }
}

window.SynapsisReact = React;
window.SynapsisCreateRoot = createRoot;
