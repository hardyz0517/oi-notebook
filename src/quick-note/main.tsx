import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import "katex/dist/katex.min.css";
import QuickNoteApp from "./QuickNoteApp";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QuickNoteApp />
  </React.StrictMode>,
);
