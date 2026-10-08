// Browser stub — sharp is a Node.js native module.
// This file is resolved instead of sharp when bundling for the browser.
// The actual sharp code in pdf-converter.ts is only reached in Node environments
// (OffscreenCanvas is always available in the browser path).

const sharp = () => {
  throw new Error("sharp is not available in the browser.");
};
export default sharp;
