/// <reference types="vite/client" />

/**
 * Vite only exposes env vars that start with VITE_ to the browser bundle.
 * Declare them here so TypeScript knows import.meta.env.VITE_API_BASE_URL exists.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
