import { useState, type FormEvent } from "react";
import { ErroConta, type Aparelho, type ErroDeLimite, type Sessao, entrar } from "../conta";
import { Aviso, Botao, Cartao } from "../ui";

const campo = "min-h-11 w-full rounded-xl border border-borda bg-black/20 px-3 text-[15px]";

/** Login com o Vetorial ID, a mesma conta da Vênus. Mostra o limite de aparelhos do servidor e deixa trocar. */
export function Conta({ aparelho, aoEntrar }: { aparelho: Aparelho; aoEntrar: (s: Sessao) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [limite, setLimite] = useState<ErroDeLimite | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(extra: { encerrar?: string; remover?: string } = {}) {
    setOcupado(true); setErro("");
    try {
      aoEntrar(await entrar(email.trim(), senha, aparelho, extra));
      setLimite(null);
    } catch (e) {
      if (e instanceof ErroConta && e.limite) setLimite(e.limite);
      else setErro(e instanceof Error ? e.message : "Não deu certo.");
    }
    setOcupado(false);
  }
  const aoEnviar = (ev: FormEvent) => { ev.preventDefault(); void enviar(); };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="text-center"><img src={`${import.meta.env.BASE_URL}vindex.png`} alt="" width={72} height={72} className="mx-auto size-[72px] rounded-2xl brilho" /><h1 className="mt-3 text-2xl font-semibold">Vindex</h1><p className="text-xs uppercase tracking-[0.2em] text-neon">Manager e Vault</p><p className="text-sm text-suave">Entre com o seu Vetorial ID, o mesmo da Vênus.</p></div>
      {limite ? (
        <Cartao titulo={limite.tipo === "sessoes" ? "Limite de aparelhos ao mesmo tempo" : "Limite de aparelhos vinculados"}>
          <p className="mb-3 text-sm text-suave">{limite.tipo === "sessoes" ? "Encerre uma sessão para entrar neste aparelho." : "Remova um aparelho para vincular este."}</p>
          <div className="space-y-2">{limite.itens.map((i) => <Botao key={i.id} className="w-full justify-between" disabled={ocupado} onClick={() => void enviar(limite.tipo === "sessoes" ? { encerrar: i.id } : { remover: i.id })}><span>{i.titulo}</span><span className="text-xs text-suave">{limite.tipo === "sessoes" ? "encerrar" : "remover"}</span></Botao>)}<Botao className="w-full" onClick={() => setLimite(null)}>Cancelar</Botao></div>
        </Cartao>
      ) : (
        <Cartao>
          <form onSubmit={aoEnviar} className="space-y-3" aria-label="Entrar">
            <label className="block text-sm"><span className="text-suave">E-mail do Vetorial ID</span><input className={campo} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="block text-sm"><span className="text-suave">Senha</span><input className={campo} type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <Botao type="submit" variante="primario" className="w-full" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</Botao>
          </form>
        </Cartao>
      )}
      <p className="text-center text-xs text-suave">Não tem conta? Crie na Vênus: o cadastro vale para todos os apps da Vetorial Tech.</p>
    </main>
  );
}
