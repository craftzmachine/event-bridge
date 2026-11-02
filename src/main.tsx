import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App";
import { applyAppearance, readAppearance } from "./state/appearance";

// apply the saved theme and font before the first paint
applyAppearance(readAppearance());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
