import { useState } from "react";
import { useMotor } from "../estado";
import { SITE_DA_CONTA, SERVIDOR, verificar, type Sessao } from "../conta";
import { Aviso, Botao, Cartao } from "../ui";

/** Conta do Vetorial ID: quem é, qual plano e atalhos para gerenciar tudo no site. */
export function MinhaConta({ sessao, aoAtualizar, aoSair }: { sessao: Sessao; aoAtualizar: (s: Sessao) => void; aoSair: () => void }) {
  const motor = useMotor();
  const [msg, setMsg] = useState("");
  const l = sessao.licenca;
  const inicial = (sessao.nome || sessao.email || "V").trim().charAt(0).toUpperCase();
  const estado = l.plano === "dono" ? "Conta do dono: acesso total, sem limites."
    : l.emTeste ? `Teste grátis: faltam ${l.diasDeTesteRestantes ?? 0} dia(s).`
    : l.acesso ? `Assinatura ativa${l.diasPagosRestantes ? ` · faltam ${l.diasPagosRestantes} dia(s) pagos` : ""}.`
    : "Sem plano ativo.";

  async function atualizar() {
    setMsg("");
    try { aoAtualizar({ ...sessao, licenca: await verificar(sessao.token) }); setMsg("Dados atualizados."); } catch (e) { setMsg(e instanceof Error ? e.message : "Não consegui atualizar."); }
  }

  return (
    <div className="space-y-4">
      <Cartao>
        <div className="flex items-center gap-4">
          <div className="grid size-16 flex-none place-items-center rounded-full bg-neon/15 text-2xl font-semibold text-neon brilho">{inicial}</div>
          <div className="min-w-0"><div className="truncate text-lg font-semibold">{sessao.nome || "Minha conta"}</div><div className="truncate text-sm text-suave">{sessao.email}</div><div className="mt-1 text-xs text-neon">Vetorial ID</div></div>
        </div>
      </Cartao>

      <Cartao titulo="Seu plano">
        <p className="text-sm">{estado}</p>
        <ul className="mt-2 space-y-1 text-sm text-suave">
          <li>Vênus: {l.acesso ? "liberada" : "bloqueada"}</li>
          <li>Vindex: {l.apps?.vindex === false ? "não incluído no seu plano" : l.acesso ? "liberado" : "bloqueado"}</li>
          <li>Vortex: {l.apps?.vortex === false ? "não incluído no seu plano" : l.acesso ? "liberado" : "bloqueado"}</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Botao variante="primario" onClick={() => void motor.abrirLink(SITE_DA_CONTA)}>Gerenciar conta e assinatura</Botao>
          <Botao onClick={() => void atualizar()}>Atualizar dados</Botao>
          <Botao onClick={() => void motor.abrirLink(`${SERVIDOR}/id`)}>Abrir o Vetorial ID</Botao>
        </div>
        <p className="mt-2 text-xs text-suave">No site você troca o nome, vê os aparelhos conectados e assina ou muda de plano.</p>
      </Cartao>

      {msg && <Aviso tom="ok">{msg}</Aviso>}
      <Botao variante="perigo" onClick={aoSair}>Sair deste aparelho</Botao>
    </div>
  );
}
