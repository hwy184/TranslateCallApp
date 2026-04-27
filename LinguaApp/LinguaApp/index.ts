const root: any =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof global !== 'undefined'
      ? global
      : typeof window !== 'undefined'
        ? window
        : {};

if (typeof root.DOMException === 'undefined') {
  class PolyfillDOMException extends Error {
    constructor(message = '', name = 'DOMException') {
      super(message);
      this.name = name;
    }
  }

  root.DOMException = PolyfillDOMException as any;
  if (typeof global !== 'undefined') (global as any).DOMException = PolyfillDOMException;
  if (typeof window !== 'undefined') (window as any).DOMException = PolyfillDOMException;
  if (typeof self !== 'undefined') (self as any).DOMException = PolyfillDOMException;
}

if (typeof root.Event === 'undefined') {
  class PolyfillEvent {
    type: string;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented: boolean;
    timeStamp: number;

    constructor(type: string, init?: { bubbles?: boolean; cancelable?: boolean }) {
      this.type = type;
      this.bubbles = !!init?.bubbles;
      this.cancelable = !!init?.cancelable;
      this.defaultPrevented = false;
      this.timeStamp = Date.now();
    }

    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
  }

  root.Event = PolyfillEvent as any;
  if (typeof global !== 'undefined') (global as any).Event = PolyfillEvent;
  if (typeof window !== 'undefined') (window as any).Event = PolyfillEvent;
  if (typeof self !== 'undefined') (self as any).Event = PolyfillEvent;
}

if (typeof root.CustomEvent === 'undefined') {
  class PolyfillCustomEvent extends (root.Event as any) {
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown; bubbles?: boolean; cancelable?: boolean }) {
      super(type, init);
      this.detail = init?.detail;
    }
  }

  root.CustomEvent = PolyfillCustomEvent as any;
  if (typeof global !== 'undefined') (global as any).CustomEvent = PolyfillCustomEvent;
  if (typeof window !== 'undefined') (window as any).CustomEvent = PolyfillCustomEvent;
  if (typeof self !== 'undefined') (self as any).CustomEvent = PolyfillCustomEvent;
}

require('fast-text-encoding');

const { LogBox } = require('react-native');
LogBox.ignoreLogs([
  "Tried to add a track for a participant, that's not present.",
]);

const { registerGlobals } = require('@livekit/react-native');
registerGlobals();

import 'expo-router/entry';
