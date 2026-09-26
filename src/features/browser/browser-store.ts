import { create } from 'zustand';

type BrowserRequests = {
  /** URL another screen asked the browser to open (consumed by the browser). */
  pendingUrl: string | null;
  open: (url: string) => void;
  consume: () => string | null;
};

export const useBrowserRequests = create<BrowserRequests>((set, get) => ({
  pendingUrl: null,
  open: (url) => set({ pendingUrl: url }),
  consume: () => {
    const url = get().pendingUrl;
    if (url) set({ pendingUrl: null });
    return url;
  },
}));
