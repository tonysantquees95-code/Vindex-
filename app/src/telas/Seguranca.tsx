import { useEffect, useState, type ReactNode } from "react";
import { useMotor, usePastas } from "../estado";
import { nomeDoArquivo, pastaDoArquivo } from "../formato";
import { analisarLink, type AnaliseDeLink } from "../link";
import type { EstadoProtecao, ResultadoVerificacao } from "../ponte";
import { Icone, type NomeIcone } from "../icones";
import { Aviso, AnelDeSaude, Botao, Cartao } from "../ui";
import { Pastas } from "./Pastas";
import { SuiteApps } from "./SuiteApps";
import { RelatorioSeguranca } from "./RelatorioSeguranca";

const campo = "min-h-11 w-full rounded-xl border border-borda bg-black/20 px-3 text-sm";
const COR_NIVEL = { alto: "border-erro/40 bg-erro/10 text-erro", medio: "border-aviso/40 bg-aviso/10 text-aviso", baixo: "border-borda text-suave" } as const;
const ROTULO_NIVEL = { alto: "Perigo", medio: "Atenção", baixo: "Confira" } as const;

const Selo = ({ ok, texto }: { ok: boolean | null; texto: string }) => (
  <li className="flex items-center justify-between gap-2 rounded-xl border border-borda px-3 py-2 text-sm"><span>{texto}</span><span className={ok == null ? "text-suave" : ok ? "text-ok" : "text-erro"}>{ok == null ? "sem leitura" : ok ? "ligado" : "desligado"}</span></li>
);

export function Seguranca() {
  const motor = useMotor();
  const { pastas, adicionar, remover } = usePastas();
  const [estado, setEstado] = useState<EstadoProtecao | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [verif, setVerif] = useState<ResultadoVerificacao | null>(null);
  const [apps, setApps] = useState<ResultadoVerificacao | null>(null);
  const [apks, setApks] = useState<ResultadoVerificacao | null>(null);
  const [hosts, setHosts] = useState<string[] | null>(null);
  const [link, setLink] = useState("");
  const [analise, setAnalise] = useState<AnaliseDeLink | null>(null);

  useEffect(() => { void motor.estadoProtecao().then(setEstado).catch(() => undefined); }, [motor]);

  async function rodar<T>(nome: string, f: () => Promise<T>): Promise<T | null> {
    setOcupado(nome); setErro(""); setMsg("");
    try { return await f(); } catch (e) { setErro(e instanceof Error ? e.message : typeof e === "string" ? e : "Não deu certo."); return null; } finally { setOcupado(""); }
  }

  const [aberto, setAberto] = useState<string | null>(null);

  // nota de proteção: quantos dos itens verificados do aparelho estão em ordem
  const lista: { rotulo: string; ok: boolean | null; detalhe: string; config: string | null }[] = estado?.suportado
    ? estado.itens ?? [
        { rotulo: "Antivírus (Microsoft Defender)", ok: estado.antivirus_ligado, detalhe: "", config: null },
        { rotulo: "Proteção em tempo real", ok: estado.tempo_real_ligado, detalhe: "", config: null },
        ...estado.firewall.map(([n, l]) => ({ rotulo: `Firewall · perfil ${n}`, ok: l, detalhe: "", config: null })),
        ...(estado.assinaturas_dias != null ? [{ rotulo: "Definições de vírus", ok: estado.assinaturas_dias <= 7, detalhe: estado.assinaturas_dias === 0 ? "atualizadas hoje" : `${estado.assinaturas_dias} dia(s) de atraso`, config: null }] : [])
      ]
    : [];
  const lidos = lista.filter((i) => i.ok != null);
  const ajustar = lista.filter((i) => i.ok === false);
  const nota = lidos.length ? Math.round((lidos.filter((i) => i.ok).length / lidos.length) * 100) : 100;

  const FERRAMENTAS: { id: string; icone: NomeIcone; titulo: string; texto: string; visivel: boolean; corpo: ReactNode }[] = [
    { id: "suite", icone: "atualizar" as const, titulo: "Apps da Vetorial Tech", texto: "Versões e atualização dos seus apps", visivel: !!motor.recursos.suite, corpo: <SuiteApps /> },
    { id: "apks", icone: "instaladores" as const, titulo: "APKs baixados", texto: "Confere antes de instalar", visivel: !!motor.recursos.suite, corpo: (
<Cartao titulo="APKs baixados (antes de instalar)">
          <p className="mb-3 text-sm text-suave">O Vindex olha os APKs que estão nas pastas abaixo sem instalar nada: confere se o arquivo abre, quem assinou e que poderes ele pede (ler a tela, desenhar por cima, ler SMS…). Os suspeitos vão para a quarentena, que dá para desfazer.</p>
          <Pastas pastas={pastas} adicionar={adicionar} remover={remover} />
          <Botao className="mt-3" variante="primario" disabled={!pastas.length || !!ocupado} onClick={async () => { const r = await rodar("apks", () => motor.verificarApks(pastas)); if (r) setApks(r); }}>{ocupado === "apks" ? "Verificando…" : "Verificar APKs"}</Botao>
          {apks && (
            <div className="mt-3">
              <p className="text-sm">{apks.analisados} APKs analisados · {apks.achados.length === 0 ? <span className="text-ok">nada suspeito</span> : <span className="text-aviso">{apks.achados.length} para olhar</span>}</p>
              <ul className="mt-2 max-h-72 space-y-2 overflow-auto">{apks.achados.map((a) => (
                <li key={a.caminho} className={`rounded-xl border px-3 py-2 text-sm ${COR_NIVEL[a.nivel]}`}>
                  <div className="flex justify-between gap-2"><span className="min-w-0 break-all font-medium">{nomeDoArquivo(a.caminho)}</span><span className="flex-none text-xs uppercase">{ROTULO_NIVEL[a.nivel]}</span></div>
                  <div className="text-xs opacity-90">{a.motivo}</div>
                  {a.nivel !== "baixo" && <button className="mt-1 text-xs underline" onClick={async () => { const r = await rodar("quarentena", () => motor.paraLixeira([a.caminho])); if (r) { setApks({ ...apks, achados: apks.achados.filter((x) => x.caminho !== a.caminho) }); setMsg("APK movido para a quarentena (pasta Vindex-Quarentena)."); } }}>Mandar para a quarentena</button>}
                </li>
              ))}</ul>
            </div>
          )}
        </Cartao>
    ) },
    { id: "relatorio", icone: "recentes" as const, titulo: "Relatório da semana", texto: "Resumo dos apps do aparelho", visivel: !!motor.recursos.suite, corpo: <RelatorioSeguranca /> },
    { id: "apps", icone: "apps" as const, titulo: "Apps instalados", texto: "Fora da loja e poderes perigosos", visivel: !!motor.recursos.verificarApps, corpo: (
<Cartao titulo="Apps instalados">
          <p className="mb-3 text-sm text-suave">O Vindex confere os apps que você instalou: os que vieram de fora da loja e os que pedem poderes perigosos (ler a tela, desenhar por cima de outros apps, ler SMS ou notificações).</p>
          <Botao variante="primario" disabled={!!ocupado} onClick={async () => { const r = await rodar("apps", () => motor.verificarApps()); if (r) setApps(r); }}>{ocupado === "apps" ? "Verificando…" : "Verificar apps"}</Botao>
          {apps && (
            <div className="mt-3">
              <p className="text-sm">{apps.analisados} apps analisados · {apps.achados.length === 0 ? <span className="text-ok">nada suspeito</span> : <span className="text-aviso">{apps.achados.length} para conferir</span>}</p>
              <ul className="mt-2 max-h-80 space-y-2 overflow-auto">{apps.achados.map((a) => {
                const pacote = /\(([^)]+)\)$/.exec(a.caminho)?.[1];
                return (
                  <li key={a.caminho} className={`rounded-xl border px-3 py-2 text-sm ${COR_NIVEL[a.nivel]}`}>
                    <div className="flex justify-between gap-2"><span className="min-w-0 break-all font-medium">{a.caminho.replace(/ \([^)]+\)$/, "")}</span><span className="flex-none text-xs uppercase">{ROTULO_NIVEL[a.nivel]}</span></div>
                    <div className="text-xs opacity-90">{a.motivo}</div>
                    {pacote && <button className="mt-1 text-xs underline" onClick={() => void motor.abrirConfiguracao(`app:${pacote}`)}>Abrir o app nas configurações (parar ou desinstalar)</button>}
                  </li>
                );
              })}</ul>
            </div>
          )}
        </Cartao>
    ) },
    { id: "arquivos", icone: "arquivos" as const, titulo: "Arquivos suspeitos", texto: "Golpes escondidos nas pastas", visivel: !!motor.recursos.arquivosSuspeitos, corpo: (
<Cartao titulo="Verificação de arquivos suspeitos">
          <p className="mb-3 text-sm text-suave">O Vindex olha o nome, o tipo e o começo dos arquivos das pastas abaixo e avisa o que parece golpe: extensão dupla (fatura.pdf.exe), scripts, atalhos e programas minúsculos. Não executa nada. <b>Não substitui o antivírus.</b></p>
          <Pastas pastas={pastas} adicionar={adicionar} remover={remover} />
          <Botao className="mt-3" variante="primario" disabled={!pastas.length || !!ocupado} onClick={async () => { const r = await rodar("verif", () => motor.verificarArquivos(pastas)); if (r) setVerif(r); }}>{ocupado === "verif" ? "Verificando…" : "Verificar agora"}</Botao>
          {verif && (
            <div className="mt-3">
              <p className="text-sm">{verif.analisados} arquivos analisados · {verif.achados.length === 0 ? <span className="text-ok">nada suspeito</span> : <span className="text-aviso">{verif.achados.length} para conferir</span>}</p>
              <ul className="mt-2 max-h-72 space-y-2 overflow-auto">{verif.achados.map((a) => (
                <li key={a.caminho} className={`rounded-xl border px-3 py-2 text-sm ${COR_NIVEL[a.nivel]}`}>
                  <div className="flex justify-between gap-2"><span className="min-w-0 break-all font-medium">{nomeDoArquivo(a.caminho)}</span><span className="flex-none text-xs uppercase">{ROTULO_NIVEL[a.nivel]}</span></div>
                  <div className="text-xs opacity-90">{a.motivo}</div>
                  <div className="break-all text-[11px] opacity-60">{pastaDoArquivo(a.caminho)}</div>
                  {motor.recursos.abrirPasta && <button className="mt-1 text-xs underline" onClick={() => void motor.abrirPasta(pastaDoArquivo(a.caminho))}>Mostrar a pasta</button>}
                </li>
              ))}</ul>
            </div>
          )}
        </Cartao>
    ) },
    { id: "link", icone: "rede" as const, titulo: "Link seguro?", texto: "Analise um link antes de abrir", visivel: true, corpo: (
      <Cartao titulo="Protetor web: esse link é seguro?">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setAnalise(analisarLink(link)); }}>
          <input className={campo} placeholder="Cole aqui o link que você recebeu" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link para analisar" />
          <Botao type="submit" variante="primario">Analisar</Botao>
        </form>
        {analise && (
          <div className="mt-3"><Aviso tom={analise.veredito === "seguro" ? "ok" : analise.veredito === "perigo" ? "erro" : "aviso"}>
            <div className="font-medium">{analise.veredito === "seguro" ? "Sem sinais de golpe" : analise.veredito === "perigo" ? "Muito provável golpe: não abra" : "Desconfie"}{analise.host && <span className="font-normal opacity-80"> · {analise.host}</span>}</div>
            <ul className="mt-1 list-disc pl-5 text-xs">{analise.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
          </Aviso></div>
        )}
        <p className="mt-2 text-xs text-suave">A análise é feita aqui no seu aparelho; o link não é enviado para ninguém.</p>
      </Cartao>
    ) },
    { id: "hosts", icone: "regras" as const, titulo: "Arquivo hosts", texto: "Redirecionamentos escondidos", visivel: !!motor.recursos.defender, corpo: (
<Cartao titulo="Arquivo “hosts” do Windows">
          <p className="mb-2 text-sm text-suave">Golpes às vezes mudam esse arquivo para levar você a um site falso quando digita o endereço certo.</p>
          <Botao disabled={!!ocupado} onClick={async () => { const r = await rodar("hosts", () => motor.verificarHosts()); if (r) setHosts(r); }}>Verificar</Botao>
          {hosts && (hosts.length === 0 ? <div className="mt-3"><Aviso tom="ok">Nenhum redirecionamento estranho.</Aviso></div> : <div className="mt-3"><Aviso>Há {hosts.length} redirecionamento(s). Se você não criou, desconfie:<ul className="mt-1 list-disc pl-5 text-xs">{hosts.map((h) => <li key={h} className="break-all">{h}</li>)}</ul></Aviso></div>)}
        </Cartao>
    ) },
    { id: "dicas", icone: "cofre" as const, titulo: "Dicas de proteção", texto: "O que protege de verdade", visivel: true, corpo: (
      <Cartao titulo="Dicas que protegem de verdade">
        <ul className="list-disc space-y-1 pl-5 text-sm text-suave">
          <li>Use a verificação em duas etapas nas suas contas (e-mail, banco, redes sociais).</li>
          <li>Troque o DNS por um que bloqueia sites maliciosos: Cloudflare <b>1.1.1.2</b> e <b>1.0.0.2</b>, ou Quad9 <b>9.9.9.9</b>.</li>
          <li>Instale programas só do site oficial e atualize o sistema quando o aviso aparecer.</li>
          <li>Desconfie de pressa: “sua conta será bloqueada hoje” é a frase favorita dos golpistas.</li>
          <li>Guarde senhas em um cofre, e não repita a mesma senha em sites diferentes.</li>
        </ul>
      </Cartao>
    ) }
  ].filter((f) => f.visivel);
  const atual = FERRAMENTAS.find((f) => f.id === aberto);

  return (
    <div className="space-y-4">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {msg && <Aviso tom="ok">{msg}</Aviso>}
      {atual ? (
        <>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm text-neon" onClick={() => setAberto(null)}>← Segurança</button>
          <h2 className="text-lg font-semibold">{atual.titulo}</h2>
          {atual.corpo}
        </>
      ) : (
        <>
          {estado?.suportado ? (
            <Cartao className="text-center">
              <p className="text-sm text-suave">{estado.itens ? "Proteção do aparelho" : "Proteção do Windows"}</p>
              <div className="mt-3"><AnelDeSaude valor={nota} rotulo="proteção" /></div>
              <p className="mt-2 text-sm text-suave">{ajustar.length === 0 ? "Tudo em ordem por aqui." : `${ajustar.length} ponto${ajustar.length === 1 ? "" : "s"} para ajustar.`}</p>
              {ajustar.length > 0 && (
                <ul className="mt-3 space-y-2 text-left">{ajustar.map((i) => (
                  <li key={i.rotulo} className="rounded-2xl border border-erro/30 bg-erro/10 px-3 py-2 text-sm">
                    <div className="font-medium text-erro">{i.rotulo}</div>
                    {i.detalhe && <div className="text-xs text-suave">{i.detalhe}</div>}
                    {i.config && <button className="mt-1 text-xs text-neon underline" onClick={() => void motor.abrirConfiguracao(i.config!)}>Abrir configuração</button>}
                  </li>
                ))}</ul>
              )}
              {lista.length > ajustar.length && (
                <details className="mt-3 text-left">
                  <summary className="cursor-pointer text-sm text-suave">Ver tudo que foi conferido ({lista.length})</summary>
                  <ul className="mt-2 space-y-2">{lista.filter((i) => i.ok !== false).map((i) => (
                    <li key={i.rotulo} className="rounded-xl border border-borda px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2"><span>{i.rotulo}</span><span className={`flex-none text-xs ${i.ok == null ? "text-suave" : "text-ok"}`}>{i.ok == null ? "confira" : "ok"}</span></div>
                      {i.detalhe && <div className="text-xs text-suave">{i.detalhe}</div>}
                      {i.config && i.ok == null && <button className="mt-1 text-xs text-neon underline" onClick={() => void motor.abrirConfiguracao(i.config!)}>Abrir configuração</button>}
                    </li>
                  ))}</ul>
                </details>
              )}
              {estado.nota && <p className="mt-3 text-xs text-suave">{estado.nota}</p>}
              {motor.recursos.defender && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Botao variante="primario" disabled={!!ocupado} onClick={async () => { const r = await rodar("rapida", () => motor.defenderVarrer()); if (r) setMsg(r.resumo); }}>{ocupado === "rapida" ? "Varrendo… (pode demorar)" : "Varredura rápida"}</Botao>
                  <Botao disabled={!!ocupado} onClick={async () => { const p = await motor.escolherPasta(); if (p) { const r = await rodar("pasta", () => motor.defenderVarrer(p)); if (r) setMsg(r.resumo); } }}>{ocupado === "pasta" ? "Varrendo…" : "Varrer uma pasta…"}</Botao>
                </div>
              )}
            </Cartao>
          ) : (
            estado && estado.nota && <Aviso>{estado.nota}</Aviso>
          )}
          <div className="grid grid-cols-2 gap-3">
            {FERRAMENTAS.map((f) => (
              <button key={f.id} onClick={() => setAberto(f.id)} className="flex flex-col items-start gap-2 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-4 text-left transition hover:bg-white/5 active:scale-[0.98]">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-neon/15 text-neon"><Icone nome={f.icone} tam={22} /></span>
                <span className="text-sm font-semibold">{f.titulo}</span>
                <span className="text-xs text-suave">{f.texto}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
