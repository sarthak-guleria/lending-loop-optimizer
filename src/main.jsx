import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Shell from "./Shell.jsx";
import Home from "./pages/Home.jsx";
import App from "./App.jsx";
import DeltaNeutral from "./pages/DeltaNeutral.jsx";
import LPYield from "./pages/LPYield.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: "loop", element: <App /> },
      { path: "delta-neutral", element: <DeltaNeutral /> },
      { path: "lp-yield", element: <LPYield /> },
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
