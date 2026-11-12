import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { aparelhoLocal, buscarPedidos, guardarSessao, responderPedido, sair, sessaoGuardada, verificar, ErroConta, SERVIDOR, type Sessao } from "./conta";
import { pastasSalvas, useMotor } from "./estado";
import { BUILD, haNovaVersao, precisaConferir, procurarVersao, type InfoVersao } from "./atualizacao";
import { devePassar } from "./autoOrganizar";
import { useAjustes } from "./usarAjustes";
import { Icone, type NomeIcone } from "./icones";
import { AjustesTela } from "./telas/Ajustes";
import { TelaDePermissoes, usePermissoes } from "./telas/Permissoes";
import type { Movimento } from "./ponte";
import { executarPedido } from "./ponteVenus";
import { Arquivos } from "./telas/Arquivos";
import { Conta } from "./telas/Conta";
import { Descompactar } from "./telas/Descompactar";
import { MinhaConta } from "./telas/MinhaConta";
import { Otimizar } from "./telas/Otimizar";
import { Painel } from "./telas/Painel";
import { RegrasTela } from "./telas/Regras";
import { Seguranca } from "./telas/Seguranca";
import type { InicioPeloMenu } from "./ponte";
import { Aviso } from "./ui";
import { LogoVivo } from "./logo";

const ABAS: readonly { id: string; rotulo: string; icone: NomeIcone }[] = [
  { id: "painel", rotulo: "Painel", icone: "painel" },
  { id: "otimizar", rotulo: "Otimizar", icone: "otimizar" },
  { id: "arquivos", rotulo: "Arquivos", icone: "arquivos" },
  { id: "regras", rotulo: "Regras", icone: "regras" },
  { id: "descompactar", rotulo: "Descompactar", icone: "descompactar" },
  { id: "seguranca", rotulo: "Segurança", icone: "seguranca" },
  { id: "ajustes", rotulo: "Ajustes", icone: "ajustes" },
  { id: "conta", rotulo: "Conta", icone: "conta" }
] as const;
type IdAba = "painel" | "otimizar" | "arquivos" | "regras" | "descompactar" | "seguranca" | "ajustes" | "conta";

export function App() {
  const motor = useMotor();
  const demo = motor.plataforma === "demonstracao";
  const aparelho = aparelhoLocal(motor.plataforma);
  const [sessao, setSessao] = useState<Sessao | null>(sessaoGuardada);
  const [aba, setAba] = useState<IdAba>("painel");
  const [inicio, setInicio] = useState<InicioPeloMenu | null>(null);
  // aberto pelo menu do botão direito ("Extrair com o Vindex…"): vai direto para Descompactar
  useEffect(() => { void motor.inicioPeloMenu().then((i) => { if (i) { setInicio(i); setAba("descompactar"); } }).catch(() => undefined); }, [motor]);
  const [ultimoPedido, setUltimoPedido] = useState("");
  const [menu, setMenu] = useState(false);
  const [ajustes] = useAjustes();
  const permissoes = usePermissoes();
  const [permVistas, setPermVistas] = useState(() => { try { return localStorage.getItem("vindex.permissoes.vistas") === "1"; } catch { return false; } });
  const [nova, setNova] = useState<InfoVersao | null>(null);
  const [avisoAtualizacao, setAvisoAtualizacao] = useState("");
  const [arrumado, setArrumado] = useState<Movimento[]>([]);
  const tentouAtualizar = useRef(0);
  const inicioToque = useRef<number | null>(null);
  const pode = (id: string) => !!permissoes.lista?.find((p) => p.id === id)?.concedida;
  const arquivosLiberados = !motor.recursos.permissoes || pode("arquivos");
  const instalarLiberado = pode("instalar");

  /** Atualiza o próprio Vindex: no Android baixa o APK e abre a instalação; no Windows abre o download do instalador. */
  const atualizar = useCallback(async (v: InfoVersao) => {
    setAvisoAtualizacao(motor.recursos.atualizaSozinho ? "Baixando a versão nova…" : "");
    try {
      if (motor.recursos.atualizaSozinho) { await motor.instalarAtualizacao(v.url, v.sha256); setAvisoAtualizacao(motor.plataforma === "android" ? "Pronto: toque em Instalar na tela do Android que abriu." : "Baixando a versão nova: o Vindex vai fechar, atualizar e abrir de novo sozinho."); }
      else await motor.abrirLink(`${SERVIDOR}/atualizacao?app=vindex-windows&baixar=1`);
    } catch (e) { setAvisoAtualizacao(e instanceof Error ? e.message : typeof e === "string" ? e : "Não consegui atualizar agora."); }
  }, [motor]);

  // Procura versão nova ao abrir e a cada 6 horas; com "Atualizar sozinho" ligado já baixa e abre a instalação.
  useEffect(() => {
    if (demo || !BUILD || motor.plataforma === "demonstracao") return;
    let vivo = true;
    const ciclo = async () => {
      let ultimo = 0;
      try { ultimo = Number(localStorage.getItem("vindex.atualizacao.ultima") ?? 0); } catch { /* ok */ }
      if (!precisaConferir(ultimo, Date.now()) && !nova) return;
      try {
        const v = await procurarVersao(SERVIDOR, motor.plataforma === "android" ? "vindex-android" : "vindex-windows");
        try { localStorage.setItem("vindex.atualizacao.ultima", String(Date.now())); } catch { /* ok */ }
        if (!vivo || !v || !haNovaVersao(BUILD, v.numero)) return;
        setNova(v);
        if (ajustes.autoAtualizar && motor.recursos.atualizaSozinho && (motor.plataforma !== "android" || instalarLiberado) && tentouAtualizar.current !== v.numero) {
          tentouAtualizar.current = v.numero;
          void atualizar(v);
        }
      } catch { /* sem internet: tenta no próximo ciclo */ }
    };
    void ciclo();
    const t = setInterval(() => void ciclo(), 30 * 60_000);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor, demo, ajustes.autoAtualizar, instalarLiberado]);

  // Organização automática: só depois de liberar os arquivos, e sempre com “Desfazer”.
  useEffect(() => {
    if (demo || !ajustes.autoOrganizar || !arquivosLiberados || (!sessao)) return;
    let ultimo = 0;
    try { ultimo = Number(localStorage.getItem("vindex.auto.ultima") ?? 0); } catch { /* ok */ }
    if (!devePassar(ultimo, Date.now())) return;
    const pastas = pastasSalvas();
    if (!pastas.length) return;
    let vivo = true;
    void motor.organizarCategorias(pastas, false).then((r) => {
      try { localStorage.setItem("vindex.auto.ultima", String(Date.now())); } catch { /* ok */ }
      if (vivo && r.movidos.length) setArrumado(r.movidos);
    }).catch(() => undefined);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor, demo, ajustes.autoOrganizar, arquivosLiberados, !!sessao]);

  const ocupado = useRef(false);

  const definir = (s: Sessao | null) => { guardarSessao(s); setSessao(s); };

  // Ao abrir: confere de novo o login e a licença no servidor.
  useEffect(() => {
    if (!sessao) return;
    verificar(sessao.token).then((licenca) => definir({ ...sessao, licenca })).catch((e) => { if (e instanceof ErroConta && e.status === 401) definir(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ponte da Vênus: enquanto o Vindex está aberto e com licença, busca e executa os pedidos de voz.
  const liberado = !!sessao?.licenca.acesso && sessao.licenca.apps?.vindex !== false;
  useEffect(() => {
    if (!sessao || !liberado || demo) return;
    let vivo = true;
    const ciclo = async () => {
      if (ocupado.current) return;
      ocupado.current = true;
      try {
        for (const p of await buscarPedidos(sessao.token, motor.plataforma)) {
          let r: { ok: boolean; resumo: string; dados?: unknown };
          try { r = await executarPedido(motor, p.comando); } catch (e) { r = { ok: false, resumo: e instanceof Error ? e.message : String(e) }; }
          await responderPedido(sessao.token, p.id, r);
          if (vivo) setUltimoPedido(`Vênus pediu “${p.comando === "otimizar" ? "otimizar" : "diagnóstico"}”: ${r.resumo}`);
        }
      } catch (e) {
        if (e instanceof ErroConta && e.status === 401 && vivo) definir(null);
      } finally { ocupado.current = false; }
    };
    void ciclo();
    const t = setInterval(() => void ciclo(), 5000);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, liberado, motor]);

  if (!demo && !sessao) return <Conta aparelho={aparelho} aoEntrar={definir} />;
  const lista = permissoes.lista;
  const faltaObrigatoria = !!lista?.some((p) => p.obrigatoria && !p.concedida);
  const faltaOpcional = !!lista?.some((p) => !p.obrigatoria && !p.concedida);
  if (motor.recursos.permissoes && lista && (faltaObrigatoria || (!permVistas && faltaOpcional))) {
    return <TelaDePermissoes aoContinuar={() => { setPermVistas(true); try { localStorage.setItem("vindex.permissoes.vistas", "1"); } catch { /* ok */ } void permissoes.atualizar(); }} />;
  }
  const ir = (id: string) => setAba(id as IdAba);
  const telas: Record<IdAba, ReactNode> = {
    painel: <Painel ir={ir} />,
    otimizar: <Otimizar />,
    arquivos: <Arquivos />,
    regras: <RegrasTela />,
    descompactar: <Descompactar inicio={inicio} aoUsarInicio={() => setInicio(null)} />,
    seguranca: <Seguranca />,
    ajustes: <AjustesTela aoAtualizar={atualizar} nova={nova} />,
    conta: sessao ? <MinhaConta sessao={sessao} aoAtualizar={definir} aoSair={() => { void sair(sessao.token); definir(null); }} /> : <Aviso>Modo demonstração: entre no app para ver sua conta.</Aviso>
  };
  const abas = ABAS.filter((a) => a.id !== "descompactar" || motor.recursos.extrair);
  const ir2 = (id: string) => { setAba(id as IdAba); setMenu(false); };
  const aoTocar = (e: TouchEvent) => { const t = e.touches[0]; inicioToque.current = t && t.clientX < 24 ? t.clientX : null; };
  const aoSoltar = (e: TouchEvent) => { const t = e.changedTouches[0]; const i = inicioToque.current; inicioToque.current = null; if (t && i != null && t.clientX - i > 60) setMenu(true); };
  return (
    <div onTouchStart={aoTocar} onTouchEnd={aoSoltar} className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-8 pt-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setMenu(true)} aria-label="Abrir menu" className="grid size-11 flex-none place-items-center rounded-xl text-suave hover:text-texto sm:hidden"><Icone nome="menu" /></button>
          <LogoVivo tam={44} /><div><div className="text-lg font-semibold leading-tight tracking-wide">Vindex</div><div className="text-[11px] text-suave">Manager e Vault</div></div>
        </div>
        <nav aria-label="Seções" className="hidden gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur sm:flex">{abas.map((a) => <button key={a.id} onClick={() => setAba(a.id as IdAba)} aria-current={aba === a.id ? "page" : undefined} className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm transition ${aba === a.id ? "bg-neon/15 text-neon shadow-[0_0_18px_-6px_var(--color-neon)]" : "text-suave hover:text-texto"}`}><Icone nome={a.icone} tam={18} />{a.rotulo}</button>)}</nav>
        {sessao ? <button onClick={() => setAba("conta")} aria-label="Minha conta" className="grid size-10 flex-none place-items-center rounded-full bg-neon/15 text-sm font-semibold text-neon">{(sessao.nome || sessao.email || "V").trim().charAt(0).toUpperCase()}</button> : <span />}
      </header>
      {demo && <div className="mb-3"><Aviso>Modo demonstração: os números são de exemplo. Instale o Vindex no Windows ou no Android para ler o seu aparelho de verdade.</Aviso></div>}
      {sessao && !liberado && <div className="mb-3"><Aviso tom="erro">{sessao.licenca.acesso ? "O seu plano não inclui o Vindex. Na aba Conta você escolhe o pacote Vênus + Vindex (R$ 70) ou o Completo (R$ 100)." : "A licença do seu Vetorial ID não está ativa. Abra a aba Conta para renovar ou assinar."}</Aviso></div>}
      {sessao && liberado && sessao.licenca.renovar && <div className="mb-3"><Aviso>Sua licença está perto de vencer. Renove pela Vênus.</Aviso></div>}
      {ultimoPedido && <div className="mb-3"><Aviso tom="ok">{ultimoPedido}</Aviso></div>}
      {nova && <div className="mb-3"><Aviso>Tem versão nova do Vindex (1.{nova.numero}). <button className="ml-1 underline" onClick={() => void atualizar(nova)}>Atualizar agora</button></Aviso></div>}
      {avisoAtualizacao && <div className="mb-3"><Aviso tom="ok">{avisoAtualizacao}</Aviso></div>}
      {arrumado.length > 0 && (
        <div className="mb-3"><Aviso tom="ok">O Vindex organizou {arrumado.length} arquivo(s) sozinho.
          <button className="ml-2 underline" onClick={() => { void motor.desfazer(arrumado).then(() => setArrumado([])); }}>Desfazer</button>
          <button className="ml-3 opacity-70 underline" onClick={() => setArrumado([])}>Ok</button></Aviso></div>
      )}
      <main className="flex-1">{demo || liberado || aba === "conta" || aba === "ajustes" ? telas[aba] : null}</main>

      {/* menu lateral (celular): abre por cima, sem ocupar a tela toda */}
      <div className={`fixed inset-0 z-40 sm:hidden ${menu ? "" : "pointer-events-none"}`} aria-hidden={!menu}>
        <div onClick={() => setMenu(false)} className={`absolute inset-0 bg-black/60 transition-opacity ${menu ? "opacity-100" : "opacity-0"}`} />
        <nav aria-label="Menu" className={`absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col border-r border-borda bg-fundo p-3 pt-[max(12px,env(safe-area-inset-top))] shadow-2xl transition-transform duration-200 ${menu ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="mb-3 flex items-center gap-2 px-1"><LogoVivo tam={36} /><div className="flex-1 text-base font-semibold">Vindex</div>
            <button onClick={() => setMenu(false)} aria-label="Fechar menu" className="grid size-10 place-items-center rounded-xl text-suave"><Icone nome="fechar" tam={20} /></button></div>
          <div className="flex-1 space-y-1 overflow-y-auto">{abas.map((a) => (
            <button key={a.id} onClick={() => ir2(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] ${aba === a.id ? "bg-neon/15 text-neon" : "text-texto hover:bg-white/5"}`}><Icone nome={a.icone} />{a.rotulo}</button>
          ))}</div>
          <div className="px-2 pb-2 pt-3 text-[11px] text-suave">{BUILD ? `Versão 1.${BUILD}` : "Versão de desenvolvimento"}</div>
        </nav>
      </div>
    </div>
  );
}
