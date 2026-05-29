// ============================================================
// store.js — Redux store root
//
// Combines all slices into one store.
// Add new slices here as you build more features.
// ============================================================

import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import documentReducer from "./slices/documentSlice";

const store = configureStore({
  reducer: {
    // Each key here becomes a "slice" of the global state.
    // Access in components with: useSelector(state => state.auth)
    auth: authReducer,
    documents: documentReducer,
  },
});

export default store;
