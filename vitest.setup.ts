import "@testing-library/jest-dom";

// React Router Vite plugin expects this flag to be set; mimic the preamble.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__vite_plugin_react_preamble_installed__ = true;

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

if (typeof window !== "undefined") {
  const localStorage = createMemoryStorage();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });
}

// MUI expects matchMedia in the test environment
if (!global.matchMedia) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
