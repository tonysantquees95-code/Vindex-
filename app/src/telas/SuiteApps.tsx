import { useCallback, useEffect, useState } from "react";
import { useMotor } from "../estado";
import type { AppSuite, Motor } from "../ponte";
import { situacao, type VersaoPublicada } from "../suite";
import { versaoDaSuite } from "../suiteServidor";
import { Aviso, Botao, Cartao } from "../ui";

const ROTULO = { instalar: "Instalar", atualizar: "Atualizar", "em-dia": "Em dia", "sem-versao": "Sem versão publicada" } as const;

/** Atualiza sozinho os apps da suíte que o próprio Vindex instalou (o Android não pede confirmação nesses). Devolve os nomes atualizados. */
export async function atualizarSuiteAuto(motor: Motor): Promise<string[]> {
  const feitos: string[] = [];
  const lista = await motor.appsDaSuite();
  for (const a of lista) {
    if (!a.instalado || !a.instaladoPeloVindex) continue;
    const v = await versaoDaSuite(a.pacote, a.repo.split("/")[1] ?? "");
    if (!v || situacao(true, a.versao, v, a.atualizadoEm) !== "atualizar") continue;
    try { await motor.instalarDaSuite(a.pacote, v.url, v.sha256); feitos.push(a.nome); } catch { /* tenta no próximo ciclo */ }
  }
  return feitos;
}

export function SuiteApps() {
  const motor = useMotor();
  const [apps, setApps] = useState<AppSuite[]>([]);
  const [publicadas, setPublicadas] = useState<Record<string, VersaoPublicada | null>>({});
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    try {
      const lista = await motor.appsDaSuite();
      setApps(lista);
      const pares = await Promise.all(lista.map(async (a) => [a.pacote, await versaoDaSuite(a.pacote, a.repo.split("/")[1] ?? "").catch(() => null)] as const));
      setPublicadas(Object.fromEntries(pares));
    } catch (e) { setErro(e instanceof Error ? e.message : "Não consegui consultar os apps agora."); }
  }, [motor]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function instalarUm(a: AppSuite): Promise<boolean> {
    // o link da Vênus vale poucos minutos: pede de novo na hora de baixar
    const v = (await versaoDaSuite(a.pacote, a.repo.split("/")[1] ?? "").catch(() => null)) ?? publicadas[a.pacote];
    if (!v) return false;
    await motor.instalarDaSuite(a.pacote, v.url, v.sha256);
    return true;
  }

  async function instalar(a: AppSuite) {
    setOcupado(a.pacote); setErro(""); setMsg("");
    try {
      await instalarUm(a);
      setMsg(`${a.nome}: o Android está instalando. ${a.instaladoPeloVindex ? "" : "Se aparecer a confirmação, toque em Instalar."}`);
      window.setTimeout(() => void carregar(), 6000);
    } catch (e) { setErro(typeof e === "string" ? e : e instanceof Error ? e.message : "Não deu certo."); } finally { setOcupado(""); }
  }

  const pendentes = apps.filter((a) => a.instalado && situacao(true, a.versao, publicadas[a.pacote] ?? null, a.atualizadoEm) === "atualizar");
  async function atualizarTodos() {
    setOcupado("todos"); setErro(""); setMsg("");
    try {
      for (const a of pendentes) await instalarUm(a);
      setMsg("Atualizações enviadas ao Android.");
      window.setTimeout(() => void carregar(), 8000);
    } catch (e) { setErro(typeof e === "string" ? e : e instanceof Error ? e.message : "Não deu certo."); } finally { setOcupado(""); }
  }

  return (
    <Cartao titulo="Apps da Vetorial Tech">
      <p className="mb-3 text-sm text-suave">O Vindex baixa só das páginas oficiais da Vetorial Tech e só instala se o pacote, a assinatura e o código de conferência (SHA-256) baterem. Depois da primeira instalação por aqui, as atualizações não pedem confirmação (Android 12 ou mais novo) e acontecem sozinhas quando “Atualizar sozinho” está ligado. Qualquer outro APK segue a verificação normal.</p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {msg && <Aviso tom="ok">{msg}</Aviso>}
      {pendentes.length > 1 && <Botao className="mb-2" variante="primario" disabled={!!ocupado} onClick={() => void atualizarTodos()}>{ocupado === "todos" ? "Atualizando…" : `Atualizar todos (${pendentes.length})`}</Botao>}
      <ul className="mt-2 space-y-2">
        {apps.map((a) => {
          const v = publicadas[a.pacote] ?? null;
          const s = situacao(a.instalado, a.versao, v, a.atualizadoEm);
          return (
            <li key={a.pacote} className="flex items-center justify-between gap-2 rounded-xl border border-borda px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{a.nome}</div>
                <div className="text-xs text-suave">{a.instalado ? `instalado ${a.versao}` : "não instalado"}{v ? ` · última ${v.tag}` : ""}</div>
              </div>
              {s === "instalar" || s === "atualizar"
                ? <Botao variante="primario" disabled={!!ocupado} onClick={() => void instalar(a)}>{ocupado === a.pacote ? "Instalando…" : ROTULO[s]}</Botao>
                : <span className={`flex-none text-xs ${s === "em-dia" ? "text-ok" : "text-suave"}`}>{ROTULO[s]}</span>}
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}
