// Organização automática: de tempos em tempos o Vindex arruma as pastas escolhidas, e sempre dá para desfazer.
export const INTERVALO_HORAS = 6;
export const devePassar = (ultimo: number, agora: number, horas = INTERVALO_HORAS): boolean => !ultimo || agora < ultimo || agora - ultimo >= horas * 3_600_000;
export const PASTAS_INICIAIS = ["downloads", "documentos"] as const;
