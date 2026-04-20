export function installDomExceptionPolyfill() {
  const g: any = globalThis as any;
  if (typeof g.DOMException !== "undefined") return;

  class PolyfillDOMException extends Error {
    constructor(message = "", name = "DOMException") {
      super(message);
      this.name = name;
    }
  }

  g.DOMException = PolyfillDOMException;
  if (typeof (global as any) !== "undefined") {
    (global as any).DOMException = PolyfillDOMException;
  }
}
