import { useCallback, useEffect, useState } from "react";
import { useMotor } from "../estado";
import type { Permissao } from "../ponte";
import { Aviso, Botao, Cartao } from "../ui";

/**
 * Lista as permissões do Android, diz para que cada uma serve e leva à tela certa do sistema.
 * (O Android não deixa o app se liberar sozinho: a pessoa toca no interruptor e volta.)
 */
export function usePermissoes() {
  const motor = useMotor();
  const [lista, setLista] = useState<Permissao[] | null>(null);
  const [erro, setErro] = useState("");
  const atualizar = useCallback(async () => {
    try { setLista(await motor.permissoes()); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLista([]); }
  }, [motor]);
  useEffect(() => {
    void atualizar();
    // voltou da tela de configurações do Android: confere de novo
    const ao = () => { if (document.visibilityState === "visible") void atualizar(); };
    document.addEventListener("visibilitychange", ao);
    window.addEventListener("focus", ao);
    return () => { document.removeEventListener("visibilitychange", ao); window.removeEventListener("focus", ao); };
  }, [atualizar]);
  return { lista, erro, atualizar, pedir: async (id: string) => { await motor.pedirPermissao(id).catch((e) => setErro(String(e?.message ?? e))); } };
}

export function ListaDePermissoes({ lista, pedir }: { lista: Permissao[]; pedir: (id: string) => void }) {
  return (
    <ul className="space-y-3">
      {lista.map((p) => (
        <li key={p.id} className="rounded-xl border border-borda p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{p.rotulo}{p.obrigatoria && <span className="ml-2 rounded-full bg-neon/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neon">necessária</span>}</span>
            <span className={`flex-none text-xs ${p.concedida ? "text-ok" : "text-aviso"}`}>{p.concedida ? "liberada" : "pendente"}</span>
          </div>
          <p className="mt-1 text-xs text-suave">{p.motivo}</p>
          {!p.concedida && <Botao className="mt-2 !min-h-10" variante="primario" onClick={() => pedir(p.id)}>Liberar nas configurações</Botao>}
        </li>
      ))}
    </ul>
  );
}

/** Tela de boas-vindas: aparece depois do login enquanto falta a permissão necessária (e uma vez para as opcionais). */
export function TelaDePermissoes({ aoContinuar }: { aoContinuar: () => void }) {
  const { lista, erro, pedir } = usePermissoes();
  const faltaObrigatoria = !!lista?.some((p) => p.obrigatoria && !p.concedida);
  const faltaOpcional = !!lista?.some((p) => !p.obrigatoria && !p.concedida);
  // tudo liberado: segue sozinho
  useEffect(() => { if (lista && lista.length && !faltaObrigatoria && !faltaOpcional) aoContinuar(); }, [lista, faltaObrigatoria, faltaOpcional, aoContinuar]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="text-center">
        <img src={`${import.meta.env.BASE_URL}vindex.png`} alt="" width={64} height={64} className="mx-auto size-16 rounded-2xl brilho" />
        <h1 className="mt-3 text-xl font-semibold">Vamos liberar o Vindex</h1>
        <p className="mt-1 text-sm text-suave">Para ler e organizar o seu celular de verdade, o Android pede a sua autorização. Cada permissão abre a tela do sistema: ligue o interruptor e volte aqui.</p>
      </div>
      <Cartao>{lista ? <ListaDePermissoes lista={lista} pedir={(id) => void pedir(id)} /> : <p className="text-sm text-suave">Conferindo…</p>}</Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao variante={faltaObrigatoria ? "suave" : "primario"} disabled={faltaObrigatoria} onClick={aoContinuar}>{faltaObrigatoria ? "Libere o acesso aos arquivos para continuar" : "Continuar"}</Botao>
      {!faltaObrigatoria && faltaOpcional && <p className="text-center text-xs text-suave">As outras são opcionais: você pode liberar depois em Ajustes › Permissões.</p>}
    </div>
  );
}
