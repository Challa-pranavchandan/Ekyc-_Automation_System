// ============================================================
// main.jsx — Application entry point
//
// Wraps the whole app in:
//   <Provider store={store}>  → makes Redux store available everywhere
// ============================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import store from "./store/store";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Provider makes the Redux store accessible to every component in the tree */}
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
