/// <reference types="vite/client" />

interface Window {
  startRecording?: () => void;
  stopRecording?: () => void;
}

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_WHATSAPP_PHONE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
