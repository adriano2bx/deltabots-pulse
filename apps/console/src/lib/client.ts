import { PulseClient } from './api';

const base = import.meta.env.VITE_API_BASE_URL as string | undefined;

/** Sem URL configurada o console avisa na tela de login; nenhum domínio é presumido. */
export const apiConfigured = Boolean(base);
export const client = new PulseClient(base ?? '', window.sessionStorage);
