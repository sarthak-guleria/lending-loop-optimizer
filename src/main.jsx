import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../lending-loop-optimizer.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
