const { registerRootComponent } = require("expo");
require("fast-text-encoding");

function installDomExceptionPolyfill() {
  const root =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof global !== "undefined"
        ? global
        : typeof window !== "undefined"
          ? window
          : {};

  if (typeof root.DOMException === "undefined") {
    class PolyfillDOMException extends Error {
      constructor(message = "", name = "DOMException") {
        super(message);
        this.name = name;
      }
    }
    root.DOMException = PolyfillDOMException;
    if (typeof global !== "undefined") global.DOMException = PolyfillDOMException;
    if (typeof window !== "undefined") window.DOMException = PolyfillDOMException;
    if (typeof self !== "undefined") self.DOMException = PolyfillDOMException;
  }
}

installDomExceptionPolyfill();

const { registerGlobals } = require("@livekit/react-native");
registerGlobals();

const App = require("./src/App").default;
registerRootComponent(App);
