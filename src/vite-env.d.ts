/// <reference types="vite/client" />
/// <reference types="chrome" />

interface ImportMetaEnv {
  readonly VITE_GA4_API_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
