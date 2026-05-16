"use client";

import { createContext, useContext, useMemo, useState } from "react";

const PredictionContext = createContext(null);

export function PredictionProvider({ children }) {
  const [latestPredictions, setLatestPredictions] = useState([]);

  const value = useMemo(
    () => ({ latestPredictions, setLatestPredictions }),
    [latestPredictions]
  );

  return (
    <PredictionContext.Provider value={value}>
      {children}
    </PredictionContext.Provider>
  );
}

export function usePrediction() {
  const context = useContext(PredictionContext);
  if (!context) {
    throw new Error("usePrediction must be used within PredictionProvider");
  }
  return context;
}
