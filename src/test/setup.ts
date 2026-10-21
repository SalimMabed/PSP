import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// jsdom does not implement some browser APIs used by the interface.
if (typeof window !== "undefined") {
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => undefined;
  if (!URL.createObjectURL) URL.createObjectURL = () => "blob:test";
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
  // IndexedDB writes (fake-indexeddb) + rendering 280 rows can exceed 1 s under load.
  configure({ asyncUtilTimeout: 6000 });
}
