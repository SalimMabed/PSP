import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// jsdom n'implémente pas certaines API navigateur utilisées par l'interface.
if (typeof window !== "undefined") {
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => undefined;
  if (!URL.createObjectURL) URL.createObjectURL = () => "blob:test";
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
  // Les écritures IndexedDB (fake-indexeddb) + rendus de 280 lignes peuvent dépasser 1 s sous charge.
  configure({ asyncUtilTimeout: 6000 });
}
