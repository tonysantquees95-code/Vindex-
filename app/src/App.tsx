import { useEffect, useRef, useState } from "react";
import { aparelhoLocal, buscarPedidos, guardarSessao, responderPedido, sair, sessaoGuardada, verificar, ErroConta, type Sessao } from "./conta";
import { useMotor } from "./estado";
import { executarPedido } from "./ponteVenus";
import { Arquivos } from "./telas/Arquivos";
import { Conta } from "./telas/Conta";
import { Painel } from "./telas/Painel";
import { RegrasTela } from "./telas/Regras";
import { Aviso, Botao } from "./ui";

const ABAS = [
  { id: "painel", rotulo: "Painel", tela: Painel },
  { id: "arquivos", rotulo: "Arquivos", tela: Arquivos },
  { id: "regras", rotulo: "Regras", tela: RegrasTela }
] as const;

export function App() {
  const motor = useMotor();
  const demo = motor.plataforma === "demonstracao";
  const aparelho = aparelhoLocal(motor.plataforma);
  const [sessao, setSessao] = useState<Sessao | null>(sessaoGuardada);
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("painel");
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
  const liberado = !!sessao?.licenca.acesso;
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
  const Atual = ABAS.find((a) => a.id === aba)!.tela;
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-neon/15 text-neon brilho">V</span><div><div className="text-lg font-semibold leading-tight tracking-wide">Vindex</div><div className="text-[11px] text-suave">Manager e Vault</div></div></div>
        <nav aria-label="Seções" className="hidden gap-1 sm:flex">{ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`min-h-10 rounded-xl px-4 text-sm ${aba === a.id ? "bg-neon/15 text-neon" : "text-suave hover:text-texto"}`}>{a.rotulo}</button>)}</nav>
        {sessao && <Botao className="!min-h-9 !px-3 text-xs" onClick={() => { void sair(sessao.token); definir(null); }}>Sair</Botao>}
      </header>
      {demo && <div className="mb-3"><Aviso>Modo demonstração: os números são de exemplo. Instale o Vindex no Windows ou no Android para ler o seu aparelho de verdade.</Aviso></div>}
      {sessao && !liberado && <div className="mb-3"><Aviso tom="erro">A licença do seu Vetorial ID não está ativa. Renove o plano na Vênus para usar o Vindex.</Aviso></div>}
      {sessao && liberado && sessao.licenca.renovar && <div className="mb-3"><Aviso>Sua licença está perto de vencer. Renove pela Vênus.</Aviso></div>}
      {ultimoPedido && <div className="mb-3"><Aviso tom="ok">{ultimoPedido}</Aviso></div>}
      <main className="flex-1">{demo || liberado ? <Atual /> : null}</main>
      <nav aria-label="Seções" className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t border-borda bg-fundo/95 backdrop-blur sm:hidden">{ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`min-h-14 text-sm ${aba === a.id ? "text-neon" : "text-suave"}`}>{a.rotulo}</button>)}</nav>
    </div>
  );
}
