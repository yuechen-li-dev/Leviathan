import React from "react";
import { createRoot } from "react-dom/client";
import Player from "./Player.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Player />
  </React.StrictMode>,
);
