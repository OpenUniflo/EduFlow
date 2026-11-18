import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "@/app/App";
import { GlassDefs } from "@/shared/ui/GlassDefs";
import "@/shared/styles/tokens.css";
import "@/shared/styles/shell.css";
import "@/shared/styles/legacy.css";
import "@/shared/styles/product.css";
import "@/shared/styles/page-frame.css";

const router = createBrowserRouter([{ path: "*", element: <App /> }]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GlassDefs />
    <RouterProvider router={router} />
  </React.StrictMode>
);
