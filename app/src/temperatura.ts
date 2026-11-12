// Régua de temperatura: cada peça do aparelho tem a sua. 44 °C é normal para a bateria carregando e para o processador
// em uso, mas seria febre para outra peça. No Android, quando o sistema informa o estado térmico (que a fabricante calibra
// para o modelo), ele manda: é o próprio Android que sabe quando o aparelho começou a esquentar demais.

export type TipoDeSensor = "bateria" | "carcaca" | "processador";
export interface Regua { tipo: TipoDeSensor; morno: number; quente: number; critico: number }
export interface Termico { estado: number; folga?: number }
export type Nivel = 0 | 1 | 2 | 3;
export const ROTULO_NIVEL = ["Normal", "Morno", "Quente", "Muito quente"] as const;
const NOME_DO_TIPO: Record<TipoDeSensor, string> = { bateria: "bateria", carcaca: "carcaça", processador: "processador" };

const REGUAS: Record<TipoDeSensor, Omit<Regua, "tipo">> = {
  bateria: { morno: 38, quente: 42, critico: 47 },
  carcaca: { morno: 39, quente: 43, critico: 48 },
  processador: { morno: 65, quente: 80, critico: 92 },
};

/** Descobre de que peça é o sensor pelo nome que o aparelho dá a ele. */
export function tipoDoSensor(nome: string): TipoDeSensor {
  const n = nome.toLowerCase();
  if (/bat|bms|charger|usb/.test(n)) return "bateria";
  if (/skin|case|shell|quiet|xo[-_ ]?therm|back|front|display|lcd|ambient|board|pmic|sys[-_ ]?therm|ntc/.test(n)) return "carcaca";
  return "processador";
}
export const reguaDe = (nome: string): Regua => { const tipo = tipoDoSensor(nome); return { tipo, ...REGUAS[tipo] }; };

export function nivelDaTemperatura(celsius: number, r: Regua): Nivel {
  return celsius >= r.critico ? 3 : celsius >= r.quente ? 2 : celsius >= r.morno ? 1 : 0;
}
/** Estado térmico do Android (0 nenhum, 1 leve, 2 moderado, 3 severo, 4+ crítico) em nossos 4 níveis. */
export const nivelDoAndroid = (estado: number): Nivel => (estado >= 3 ? 3 : estado === 2 ? 2 : estado === 1 ? 1 : 0);

export interface Avaliacao {
  nivel: Nivel; rotulo: string;
  /** a peça que mais pesa (maior pressão na própria régua) */
  sensor: { nome: string; celsius: number; tipo: TipoDeSensor } | null;
  /** 0 a 100: onde está na régua dessa peça (para o arco do medidor) */
  fracao: number;
  detalhe: string;
  /** o Android informou o estado térmico: a régua é a do próprio aparelho */
  doAndroid: boolean;
}

const limitar = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export function avaliar(sensores: { nome: string; celsius: number }[], termico?: Termico | null): Avaliacao {
  let foco: Avaliacao["sensor"] = null, focoPressao = -Infinity, nivelBateria: Nivel = 0, nivelPecas: Nivel = 0;
  for (const s of sensores) {
    if (!Number.isFinite(s.celsius)) continue;
    const r = reguaDe(s.nome);
    const pressao = (s.celsius - r.morno) / (r.critico - r.morno);
    if (pressao > focoPressao) { focoPressao = pressao; foco = { nome: s.nome, celsius: s.celsius, tipo: r.tipo }; }
    const n = nivelDaTemperatura(s.celsius, r);
    if (r.tipo === "bateria") nivelBateria = Math.max(nivelBateria, n) as Nivel;
    else nivelPecas = Math.max(nivelPecas, n) as Nivel;
  }
  const doAndroid = termico != null && Number.isFinite(termico.estado);
  // com o estado do Android, ele decide pelo aparelho; a bateria continua com a régua dela (o Android nem sempre a cobre)
  const nivel = (doAndroid ? Math.max(nivelDoAndroid(termico!.estado), nivelBateria) : Math.max(nivelPecas, nivelBateria)) as Nivel;
  let fracao = 0;
  if (foco) { const r = reguaDe(foco.nome); fracao = limitar(((foco.celsius - 20) / (r.critico - 20)) * 100); }
  if (doAndroid && termico!.folga != null && Number.isFinite(termico!.folga)) fracao = limitar(termico!.folga! * 100); // 100% = onde o Android começa a segurar o desempenho
  const detalhe = foco ? `${NOME_DO_TIPO[foco.tipo]} · ${ROTULO_NIVEL[nivel].toLowerCase()}` : ROTULO_NIVEL[nivel].toLowerCase();
  return { nivel, rotulo: ROTULO_NIVEL[nivel], sensor: foco, fracao, detalhe, doAndroid };
}

/** Cor do medidor: normal e morno são verdes, quente é amarelo, muito quente é vermelho. */
export const tomDoNivel = (n: Nivel): "ok" | "aviso" | "erro" => (n >= 3 ? "erro" : n === 2 ? "aviso" : "ok");

/** Frase para a nota de saúde (só aparece de "quente" para cima). */
export function dicaDeTemperatura(a: Avaliacao): string | null {
  if (a.nivel < 2) return null;
  const peca = a.doAndroid && a.sensor?.tipo !== "bateria" ? "o aparelho" : a.sensor ? `a ${NOME_DO_TIPO[a.sensor.tipo]}` : "o aparelho";
  return a.nivel === 3 ? `Muito quente: ${peca === "o aparelho" ? "o aparelho" : peca} precisa descansar.` : `${peca === "o aparelho" ? "O aparelho está" : peca === "a bateria" ? "A bateria está" : peca === "a carcaça" ? "A carcaça está" : "O processador está"} quente.`;
}
