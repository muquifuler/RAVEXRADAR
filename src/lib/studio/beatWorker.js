// src/lib/studio/beatWorker.js
// ----------------------------------------------------------------------------
// Worker del análisis (Vite lo empaqueta solo con new URL(..., import.meta.url)).
// ----------------------------------------------------------------------------
import { analyzeBeats } from './beatCore';

self.onmessage = (e) => {
  const { id, x, sr } = e.data || {};
  try {
    self.postMessage({ id, result: analyzeBeats(x, sr) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
