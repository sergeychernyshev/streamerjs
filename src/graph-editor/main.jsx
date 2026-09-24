import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./styles.css";

import App from "./App";
import { OBSProvider } from "./obs";

createRoot(document.getElementById("graph-editor")).render(
  <StrictMode>
    <OBSProvider>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </OBSProvider>
  </StrictMode>,
);
