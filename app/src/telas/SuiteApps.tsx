import { useCallback, useEffect, useState } from "react";
import { useMotor } from "../estado";
import type { AppSuite } from "../ponte";
import { situacao, ultimaVersao, type VersaoPublicada } from "../suite";
import { Aviso, Botao, Cartao } from "../ui";

const ROTULO = { instalar: "Instalar", atualizar: "Atualizar", "em-dia": "Em dia", "sem-versao": "Sem versão publicada" } as const;

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
      const pares = await Promise.all(lista.map(async (a) => [a.pacote, await ultimaVersao(a.repo).catch(() => null)] as const));
      setPublicadas(Object.fromEntries(pares));
    } catch (e) { setErro(e instanceof Error ? e.message : "Não consegui consultar os apps agora."); }
  }, [motor]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function instalar(a: AppSuite) {
    const v = publicadas[a.pacote];
    if (!v) return;
    setOcupado(a.pacote); setErro(""); setMsg("");
    try {
      await motor.instalarDaSuite(a.pacote, v.url, v.sha256);
      setMsg(`${a.nome}: o Android está instalando. ${a.instaladoPeloVindex ? "" : "Se aparecer a confirmação, toque em Instalar."}`);
      window.setTimeout(() => void carregar(), 6000);
    } catch (e) { setErro(typeof e === "string" ? e : e instanceof Error ? e.message : "Não deu certo."); } finally { setOcupado(""); }
  }

  return (
    <Cartao titulo="Apps da Vetorial Tech">
      <p className="mb-3 text-sm text-suave">O Vindex baixa só das páginas oficiais da Vetorial Tech no GitHub e só instala se o pacote, a assinatura e o código de conferência (SHA-256) baterem. Depois da primeira instalação por aqui, as atualizações não pedem confirmação (Android 12 ou mais novo). Qualquer outro APK segue a verificação normal.</p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {msg && <Aviso tom="ok">{msg}</Aviso>}
      <ul className="mt-2 space-y-2">
        {apps.map((a) => {
          const v = publicadas[a.pacote] ?? null;
          const s = situacao(a.instalado, a.versao, v);
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
