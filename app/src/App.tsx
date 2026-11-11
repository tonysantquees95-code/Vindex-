import { useEffect, useRef, useState, type ReactNode } from "react";
import { aparelhoLocal, buscarPedidos, guardarSessao, responderPedido, sair, sessaoGuardada, verificar, ErroConta, type Sessao } from "./conta";
import { useMotor } from "./estado";
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

const ABAS = [
  { id: "painel", rotulo: "Painel", icone: "📊" },
  { id: "otimizar", rotulo: "Otimizar", icone: "⚡" },
  { id: "arquivos", rotulo: "Arquivos", icone: "🗂️" },
  { id: "regras", rotulo: "Regras", icone: "📐" },
  { id: "descompactar", rotulo: "Descompactar", icone: "📦" },
  { id: "seguranca", rotulo: "Segurança", icone: "🛡️" },
  { id: "conta", rotulo: "Conta", icone: "👤" }
] as const;
type IdAba = (typeof ABAS)[number]["id"];

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
  const ir = (id: string) => setAba(id as IdAba);
  const telas: Record<IdAba, ReactNode> = {
    painel: <Painel ir={ir} />,
    otimizar: <Otimizar />,
    arquivos: <Arquivos />,
    regras: <RegrasTela />,
    descompactar: <Descompactar inicio={inicio} aoUsarInicio={() => setInicio(null)} />,
    seguranca: <Seguranca />,
    conta: sessao ? <MinhaConta sessao={sessao} aoAtualizar={definir} aoSair={() => { void sair(sessao.token); definir(null); }} /> : <Aviso>Modo demonstração: entre no app para ver sua conta.</Aviso>
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}vindex.png`} alt="" width={40} height={40} className="size-10 rounded-xl brilho" /><div><div className="text-lg font-semibold leading-tight tracking-wide">Vindex</div><div className="text-[11px] text-suave">Manager e Vault</div></div></div>
        <nav aria-label="Seções" className="hidden gap-1 sm:flex">{ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`min-h-10 rounded-xl px-3 text-sm ${aba === a.id ? "bg-neon/15 text-neon" : "text-suave hover:text-texto"}`}>{a.rotulo}</button>)}</nav>
        {sessao ? <button onClick={() => setAba("conta")} aria-label="Minha conta" className="grid size-10 flex-none place-items-center rounded-full bg-neon/15 text-sm font-semibold text-neon">{(sessao.nome || sessao.email || "V").trim().charAt(0).toUpperCase()}</button> : <span />}
      </header>
      {demo && <div className="mb-3"><Aviso>Modo demonstração: os números são de exemplo. Instale o Vindex no Windows ou no Android para ler o seu aparelho de verdade.</Aviso></div>}
      {sessao && !liberado && <div className="mb-3"><Aviso tom="erro">{sessao.licenca.acesso ? "O seu plano não inclui o Vindex. Na aba Conta você escolhe o pacote Vênus + Vindex (R$ 70) ou o Completo (R$ 100)." : "A licença do seu Vetorial ID não está ativa. Abra a aba Conta para renovar ou assinar."}</Aviso></div>}
      {sessao && liberado && sessao.licenca.renovar && <div className="mb-3"><Aviso>Sua licença está perto de vencer. Renove pela Vênus.</Aviso></div>}
      {ultimoPedido && <div className="mb-3"><Aviso tom="ok">{ultimoPedido}</Aviso></div>}
      <main className="flex-1">{demo || liberado || aba === "conta" ? telas[aba] : null}</main>
      <nav aria-label="Seções" className="fixed inset-x-0 bottom-0 flex overflow-x-auto border-t border-borda bg-fundo/95 backdrop-blur sm:hidden">{ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`flex min-h-14 min-w-[76px] flex-1 flex-col items-center justify-center text-[11px] ${aba === a.id ? "text-neon" : "text-suave"}`}><span aria-hidden="true" className="text-base">{a.icone}</span>{a.rotulo}</button>)}</nav>
    </div>
  );
}
