/** Light / Dark / Match phone. Saved per user on the server and cached locally for first paint. */
export type Appearance = 'light' | 'dark' | 'system';

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  if (a === 'light' || a === 'dark') root.dataset.theme = a;
  else delete root.dataset.theme;
  try {
    localStorage.setItem('appearance', a);
  } catch {
    /* ignore */
  }
}

/** Client pages (booking page, quote, receipt) always follow the device */
export function followDevice() {
  delete document.documentElement.dataset.theme;
}
