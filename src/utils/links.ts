/**
 * Absolute URL of the hosted payment page for a checkout token.
 * Honors the Vite base path, so it also works when the app is served from a sub-path
 * (for example https://<user>.github.io/PSP/).
 */
export function checkoutLink(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}pay/${token}`;
}

/** React Router basename derived from the Vite base path ("/" → "", "/PSP/" → "/PSP"). */
export function routerBasename(): string {
  return import.meta.env.BASE_URL.replace(/\/+$/, "");
}
