/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
declare const __APP_BUILT_AT__: string;
