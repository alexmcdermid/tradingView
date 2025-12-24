import "@testing-library/jest-dom";

// React Router Vite plugin expects this flag to be set; mimic the preamble.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__vite_plugin_react_preamble_installed__ = true;

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
