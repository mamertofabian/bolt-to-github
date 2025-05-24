/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GA4_API_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
