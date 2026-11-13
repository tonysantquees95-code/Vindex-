import { useState } from "react";
import { gerarCobranca, SITE_DA_CONTA, type Sessao } from "../conta";
import { Aviso, Botao, Cartao } from "../ui";

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="text-center"><img src={`${import.meta.env.BASE_URL}vindex.png`} alt="" width={72} height={72} className="mx-auto size-[72px] rounded-2xl brilho" /></div>
      {children}
    </main>
  );
}

/** Teste de 7 dias acabado (ou plano sem acesso): o app fica fechado até haver plano ativo. */
export function TelaTesteAcabou({ sessao, aoVerificar, aoSair }: { sessao: Sessao; aoVerificar: () => Promise<void>; aoSair: () => void }) {
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function pagar() {
    setMsg(""); setOcupado(true);
    try {
      const url = await gerarCobranca(sessao.token);
      if (url) window.open(url, "_blank", "noopener");
      else window.open(SITE_DA_CONTA, "_blank", "noopener");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não consegui gerar o pagamento."); }
    setOcupado(false);
  }
  return (
    <Moldura>
      <Cartao>
        <div role="alertdialog" aria-labelledby="bloq" className="space-y-4 text-center">
          <h1 id="bloq" className="text-2xl font-semibold">O seu teste acabou</h1>
          <p className="text-sm text-suave">Para continuar com os serviços, adicione uma forma de pagamento e escolha um plano. Os seus dados continuam guardados.</p>
          <Botao variante="primario" className="w-full" disabled={ocupado} onClick={() => void pagar()}>Escolher plano e pagar</Botao>
          <Botao className="w-full" onClick={() => void aoVerificar()}>Já paguei: verificar de novo</Botao>
          <button className="text-xs text-suave underline" onClick={aoSair}>Sair desta conta</button>
          {msg && <Aviso tom="erro">{msg}</Aviso>}
        </div>
      </Cartao>
    </Moldura>
  );
}

/** Sem recibo válido (muito tempo offline, relógio mexido ou primeira abertura após atualizar): confirma com o servidor. */
export function TelaConfirmando({ motivo, aoVerificar, aoSair }: { motivo: string; aoVerificar: () => Promise<void>; aoSair: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <Moldura>
      <Cartao>
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold">Confirmando a sua conta…</h1>
          <p className="text-sm text-suave">{motivo === "relogio" ? "A data e a hora deste aparelho não batem com a do servidor. Ajuste o relógio e conecte-se à internet." : motivo === "vencido" ? "Faz tempo que este aparelho não confirma a licença. Conecte-se à internet para continuar." : "Conecte-se à internet para confirmar o seu Vetorial ID."}</p>
          <Botao variante="primario" className="w-full" disabled={ocupado} onClick={() => { setOcupado(true); void aoVerificar().finally(() => setOcupado(false)); }}>Tentar agora</Botao>
          <button className="text-xs text-suave underline" onClick={aoSair}>Sair desta conta</button>
        </div>
      </Cartao>
    </Moldura>
  );
}
