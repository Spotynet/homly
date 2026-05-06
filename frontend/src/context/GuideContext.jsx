import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * GuideContext
 * ─────────────────────────────────────────────────────────────────
 * Global state for the interactive guide modal.
 * Rendered once in AppLayout so the modal persists across navigation —
 * the user can follow the guide while actually using the screens it
 * describes without the modal disappearing.
 *
 * Usage:
 *   const { launchGuide, closeGuide } = useGuide();
 *   launchGuide(chapter);   // open a chapter
 *   closeGuide();           // close
 */

const GuideContext = createContext(null);

export function GuideProvider({ children }) {
  const [activeChapter, setActiveChapter] = useState(null);

  const launchGuide = useCallback((chapter) => {
    setActiveChapter(chapter);
  }, []);

  const closeGuide = useCallback(() => {
    setActiveChapter(null);
  }, []);

  return (
    <GuideContext.Provider value={{ activeChapter, launchGuide, closeGuide }}>
      {children}
    </GuideContext.Provider>
  );
}

export function useGuide() {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error('useGuide must be used inside <GuideProvider>');
  return ctx;
}
