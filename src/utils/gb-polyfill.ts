// Declare global for TypeScript
declare const global: any;

const getGlobalThis = (): any => {
    if (typeof globalThis !== 'undefined') return globalThis;
    if (typeof self !== 'undefined') return self;
    if (typeof window !== 'undefined') return window;
    if (typeof global !== 'undefined') return global;
    throw new Error('Unable to locate global object');
  };
  
  const globalObject = getGlobalThis();
  
  // Ensure basic globals are available
  if (!globalObject.process) {
    globalObject.process = { env: {} };
  }
  
  if (!globalObject.Buffer) {
    globalObject.Buffer = { isBuffer: () => false };
  }
  
  // Polyfill global
  if (typeof globalObject.global === 'undefined') {
    globalObject.global = globalObject;
  }
  
  export default globalObject;
