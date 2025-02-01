"use client";

import React, { createContext, useContext, useState } from "react";

interface MindMapContextType {
  highlightQuery: string;
  setHighlightQuery: (query: string) => void;
}

const MindMapContext = createContext<MindMapContextType | undefined>(undefined);

export const MindMapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [highlightQuery, setHighlightQuery] = useState("");
  return (
    <MindMapContext.Provider value={{ highlightQuery, setHighlightQuery }}>
      {children}
    </MindMapContext.Provider>
  );
};

export const useMindMapContext = () => {
  const context = useContext(MindMapContext);
  if (!context) {
    throw new Error("useMindMapContext must be used within a MindMapProvider");
  }
  return context;
};
