/// <reference types="vite/client" />

declare module 'promptpay-qr' {
  function generatePayload(target: string, options?: { amount?: number }): string
  export = generatePayload
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
