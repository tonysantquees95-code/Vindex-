import { useCallback, useEffect, useRef, useState } from "react";
import { cofreNuvem, ErroConta, type Sessao } from "../conta";
import { abrirComBio, ativarBio, desativarBio, estadoBio, protegerTela, type EstadoBio } from "../cofre/biometria";
import {
  abrirComRecuperacao, abrirComSenha, abrirComChave, criarCofre, desempacotar, empacotar, ErroDoCofre, forcaDaSenha, gerarSenha,
  juntar, novaRecuperacao, novoItem, salvarItens, trocarSenha, visiveis, type Item, type Pacote, type TipoDeItem
} from "../cofre/cripto";
import { Icone } from "../icones";
import { registrarVoltar } from "../voltar";
import { Aviso, Botao, Cartao } from "../ui";

const campo = "min-h-11 w-full rounded-xl border border-borda bg-black/20 px-3 text-sm outline-none focus:border-neon";
const ROTULO: Record<TipoDeItem, string> = { senha: "Senha de site ou app", cartao: "Cartão ou banco", nota: "Nota segura", chave: "Chave ou token" };
const FORCA = ["Muito curta", "Fraca", "Razoável", "Boa", "Forte"] as const;
const COR_FORCA = ["bg-erro", "bg-erro", "bg-aviso", "bg-ok", "bg-ok"] as const;
const INATIVO_MS = 3 * 60_000, SEGUNDO_PLANO_MS = 30_000, LIMPAR_COPIA_MS = 30_000;

type Etapa = "carregando" | "criar" | "codigo" | "trancado" | "recuperar" | "aberto";
interface Guardado { pacote: string; versao: number; pendente: boolean }

const chaveLocal = (email: string) => `vindex.cofre.${email.toLowerCase()}`;
const lerLocal = (email: string): Guardado | null => { try { return JSON.parse(localStorage.getItem(chaveLocal(email)) ?? "null") as Guardado | null; } catch { return null; } };
const gravarLocal = (email: string, g: Guardado | null) => { try { if (g) localStorage.setItem(chaveLocal(email), JSON.stringify(g)); else localStorage.removeItem(chaveLocal(email)); } catch { /* sem armazenamento */ } };
const mensagem = (e: unknown) => (e instanceof ErroConta || e instanceof ErroDoCofre || e instanceof Error ? e.message : "Não deu certo.");

function Forca({ senha }: { senha: string }) {
  const f = forcaDaSenha(senha);
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${senha && i < Math.max(1, f) ? COR_FORCA[f] : "bg-white/10"}`} />)}</div>
      <div className="mt-1 text-xs text-suave">{senha ? FORCA[f] : "Use 12 ou mais caracteres, de preferência uma frase."}</div>
    </div>
  );
}

export function Cofre({ sessao }: { sessao: Sessao | null }) {
  const email = sessao?.email ?? "";
  const token = sessao?.token ?? "";
  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [msg, setMsg] = useState<{ tom: "ok" | "erro" | "aviso"; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [bio, setBio] = useState<EstadoBio>({ disponivel: false, ativo: false });
  const [codigo, setCodigo] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [pendente, setPendente] = useState(false);
  const pacote = useRef<Pacote | null>(null);
  const versao = useRef(0);
  const dek = useRef<Uint8Array | null>(null);
  const pendenteLocal = useRef<Pacote | null>(null); // mudanças feitas sem internet, quando a nuvem já andou
  const ultimoToque = useRef(Date.now());
  const foraDesde = useRef<number | null>(null);

  const aviso = (t: string, tom: "ok" | "erro" | "aviso" = "erro") => setMsg({ tom, t });

  // ---------------------------------------------------------------- nuvem e cópia local
  const carregarPacote = useCallback(async (): Promise<boolean> => {
    // devolve true se existe cofre
    const local = lerLocal(email);
    try {
      const e = await cofreNuvem.estado(token);
      if (!e.existe) { gravarLocal(email, null); pacote.current = null; versao.current = 0; return false; }
      if (local && local.versao === e.versao) { pacote.current = desempacotar(local.pacote); versao.current = local.versao; setPendente(local.pendente); return true; }
      const r = await cofreNuvem.pacote(token);
      pacote.current = desempacotar(r.pacote); versao.current = r.versao;
      if (local?.pendente) { pendenteLocal.current = desempacotar(local.pacote); setPendente(true); } // junta depois de destrancar
      else { gravarLocal(email, { pacote: r.pacote, versao: r.versao, pendente: false }); setPendente(false); }
      return true;
    } catch (e) {
      if (local && !(e instanceof ErroConta && e.status > 0 && e.status < 500)) {
        pacote.current = desempacotar(local.pacote); versao.current = local.versao; setPendente(local.pendente);
        aviso("Sem conexão: abri a cópia guardada neste aparelho. As mudanças sobem quando a internet voltar.", "aviso");
        return true;
      }
      throw e;
    }
  }, [email, token]);

  useEffect(() => {
    if (!sessao) return;
    let vivo = true;
    void (async () => {
      try {
        const existe = await carregarPacote();
        if (!vivo) return;
        setBio(await estadoBio(email));
        setEtapa(existe ? "trancado" : "criar");
      } catch (e) {
        if (vivo) { aviso(mensagem(e)); setEtapa("criar"); }
      }
    })();
    return () => { vivo = false; };
  }, [sessao, email, carregarPacote]);

  /** Grava o pacote novo; se outro aparelho mexeu antes, junta as duas listas e tenta de novo. */
  const sincronizar = useCallback(async (novos: Item[]): Promise<void> => {
    if (!pacote.current || !dek.current) return;
    let p = await salvarItens(pacote.current, dek.current, novos);
    let lista = novos;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const r = await cofreNuvem.gravar(token, empacotar(p), versao.current);
        pacote.current = p; versao.current = r.versao; gravarLocal(email, { pacote: empacotar(p), versao: r.versao, pendente: false });
        setPendente(false); setItens(lista);
        return;
      } catch (e) {
        if (e instanceof ErroConta && e.codigo === "versao_mudou") {
          const r = await cofreNuvem.pacote(token);
          const remoto = desempacotar(r.pacote);
          const aberto = await abrirComChave(remoto, dek.current);
          lista = juntar(lista, aberto.itens);
          pacote.current = remoto; versao.current = r.versao;
          p = await salvarItens(remoto, dek.current, lista);
          continue;
        }
        // sem internet (ou servidor fora): fica guardado aqui e sobe na próxima
        pacote.current = p; gravarLocal(email, { pacote: empacotar(p), versao: versao.current, pendente: true });
        setPendente(true); setItens(lista);
        if (e instanceof ErroConta && e.status >= 400 && e.status < 500) throw e;
        return;
      }
    }
    throw new Error("O cofre está sendo alterado em outro aparelho. Tente de novo em instantes.");
  }, [email, token]);

  // ---------------------------------------------------------------- trancar
  const trancar = useCallback((motivo?: string) => {
    dek.current?.fill(0); dek.current = null;
    setItens([]); setCodigo("");
    void protegerTela(false);
    setEtapa((e) => (e === "aberto" || e === "codigo" ? "trancado" : e));
    if (motivo) aviso(motivo, "aviso");
  }, []);

  useEffect(() => {
    if (etapa !== "aberto" && etapa !== "codigo") return;
    void protegerTela(true);
    const toque = () => { ultimoToque.current = Date.now(); };
    const visib = () => {
      if (document.hidden) foraDesde.current = Date.now();
      else if (foraDesde.current && Date.now() - foraDesde.current > SEGUNDO_PLANO_MS) trancar("Cofre trancado porque você saiu do app.");
      if (!document.hidden) foraDesde.current = null;
    };
    const relogio = setInterval(() => { if (Date.now() - ultimoToque.current > INATIVO_MS) trancar("Cofre trancado por falta de uso."); }, 10_000);
    ultimoToque.current = Date.now();
    window.addEventListener("pointerdown", toque); window.addEventListener("keydown", toque); document.addEventListener("visibilitychange", visib);
    return () => { clearInterval(relogio); window.removeEventListener("pointerdown", toque); window.removeEventListener("keydown", toque); document.removeEventListener("visibilitychange", visib); void protegerTela(false); };
  }, [etapa, trancar]);
  useEffect(() => () => { dek.current?.fill(0); }, []);

  // ---------------------------------------------------------------- entrar no cofre
  async function depoisDeAbrir(a: { dek: Uint8Array; itens: Item[] }) {
    dek.current = a.dek;
    let lista = a.itens;
    // mudanças feitas sem internet que ainda não subiram: junta com o que já estava na nuvem e sobe
    const local = lerLocal(email);
    if (pendenteLocal.current) {
      try { lista = juntar(lista, (await abrirComChave(pendenteLocal.current, a.dek)).itens); } catch { /* cópia local ilegível: fica a da nuvem */ }
      pendenteLocal.current = null;
    }
    setItens(lista); setEtapa("aberto"); setMsg(null);
    if (local?.pendente) { try { await sincronizar(lista); } catch (e) { aviso(mensagem(e)); } }
  }
  async function rodar(f: () => Promise<void>) {
    setMsg(null); setOcupado(true);
    try { await f(); } catch (e) { aviso(mensagem(e)); } finally { setOcupado(false); }
  }

  if (!sessao) return <Aviso>Entre com o seu Vetorial ID (aba Conta) para usar o cofre: ele fica ligado à sua conta e aparece em qualquer aparelho em que você entrar.</Aviso>;
  if (etapa === "carregando") return <div className="py-10 text-center text-sm text-suave">Abrindo o cofre…</div>;

  const aviso_ = msg && <Aviso tom={msg.tom}>{msg.t}</Aviso>;

  // ---------------------------------------------------------------- criar
  if (etapa === "criar") return <Criar aviso={aviso_} ocupado={ocupado} aoCriar={(senha) => rodar(async () => {
    const c = await criarCofre(senha);
    const r = await cofreNuvem.gravar(token, empacotar(c.pacote), 0);
    pacote.current = c.pacote; versao.current = r.versao; dek.current = c.aberto.dek;
    gravarLocal(email, { pacote: empacotar(c.pacote), versao: r.versao, pendente: false });
    setCodigo(c.codigo); setItens([]); setEtapa("codigo");
  })} />;

  if (etapa === "codigo") return <Codigo codigo={codigo} aoAnotar={() => { setCodigo(""); setEtapa("aberto"); void estadoBio(email).then(setBio); }} />;

  // ---------------------------------------------------------------- trancado
  if (etapa === "trancado" || etapa === "recuperar") return (
    <Trancado recuperar={etapa === "recuperar"} aviso={aviso_} ocupado={ocupado} bio={bio}
      aoSenha={(s) => rodar(async () => { if (!pacote.current) throw new Error("Cofre não encontrado."); await depoisDeAbrir(await abrirComSenha(pacote.current, s)); })}
      aoDigital={() => rodar(async () => {
        if (!pacote.current) throw new Error("Cofre não encontrado.");
        try { await depoisDeAbrir(await abrirComChave(pacote.current, await abrirComBio(email))); }
        catch (e) {
          const c = (e as { codigo?: string }).codigo;
          if (c === "cancelado") return;
          if (c === "invalidada" || c === "chave") { await desativarBio(email); setBio(await estadoBio(email)); }
          throw e;
        }
      })}
      aoRecuperar={(cod, nova) => rodar(async () => {
        if (!pacote.current) throw new Error("Cofre não encontrado.");
        const a = await abrirComRecuperacao(pacote.current, cod);
        const p2 = await trocarSenha(pacote.current, a.dek, nova);
        const r = await cofreNuvem.gravar(token, empacotar(p2), versao.current);
        pacote.current = p2; versao.current = r.versao; gravarLocal(email, { pacote: empacotar(p2), versao: r.versao, pendente: false });
        await desativarBio(email);
        dek.current = a.dek; setItens(a.itens); setEtapa("aberto"); aviso("Senha trocada. Gere um código de recuperação novo em “Segurança do cofre”.", "ok");
      })}
      aoAlternar={() => { setMsg(null); setEtapa(etapa === "trancado" ? "recuperar" : "trancado"); }} />
  );

  // ---------------------------------------------------------------- aberto
  const salvar = (novos: Item[]) => rodar(async () => { await sincronizar(novos); });
  return (
    <Aberto itens={itens} aviso={aviso_} pendente={pendente} ocupado={ocupado} bio={bio} email={email}
      aoTrancar={() => trancar()}
      aoSalvarItem={(it) => salvar([...itens.filter((x) => x.id !== it.id), { ...it, atualizado: Date.now() }])}
      aoApagarItem={(id) => salvar(itens.map((x) => (x.id === id ? { ...x, apagado: true, titulo: "", usuario: "", segredo: "", url: "", notas: "", atualizado: Date.now() } : x)))}
      aoTentarDeNovo={() => salvar(itens)}
      aoAtivarBio={() => rodar(async () => { if (!dek.current) return; try { await ativarBio(email, dek.current); setBio(await estadoBio(email)); aviso("Desbloqueio por digital, rosto ou padrão ativado neste aparelho.", "ok"); } catch (e) { if ((e as { codigo?: string }).codigo !== "cancelado") throw e; } })}
      aoDesativarBio={() => rodar(async () => { await desativarBio(email); setBio(await estadoBio(email)); aviso("Desbloqueio por digital desativado.", "ok"); })}
      aoTrocarSenha={(nova) => rodar(async () => {
        if (!pacote.current || !dek.current) return;
        const p2 = await trocarSenha(pacote.current, dek.current, nova);
        const r = await cofreNuvem.gravar(token, empacotar(p2), versao.current);
        pacote.current = p2; versao.current = r.versao; gravarLocal(email, { pacote: empacotar(p2), versao: r.versao, pendente: false });
        aviso("Senha do cofre trocada. Nos outros aparelhos use a nova senha.", "ok");
      })}
      aoNovoCodigo={() => rodar(async () => {
        if (!pacote.current || !dek.current) return;
        const n = await novaRecuperacao(pacote.current, dek.current);
        const r = await cofreNuvem.gravar(token, empacotar(n.pacote), versao.current);
        pacote.current = n.pacote; versao.current = r.versao; gravarLocal(email, { pacote: empacotar(n.pacote), versao: r.versao, pendente: false });
        setCodigo(n.codigo); setEtapa("codigo");
      })}
      aoApagarCofre={() => rodar(async () => {
        await cofreNuvem.apagar(token); gravarLocal(email, null); await desativarBio(email);
        pacote.current = null; versao.current = 0; dek.current?.fill(0); dek.current = null; setItens([]); setEtapa("criar");
        aviso("Cofre apagado de vez.", "ok");
      })} />
  );
}

// ======================================================================= telas
function Criar({ aviso, ocupado, aoCriar }: { aviso: React.ReactNode; ocupado: boolean; aoCriar: (senha: string) => void }) {
  const [s1, setS1] = useState(""), [s2, setS2] = useState(""), [erro, setErro] = useState("");
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (s1.length < 10) return setErro("Use pelo menos 10 caracteres.");
    if (s1 !== s2) return setErro("As duas senhas não são iguais.");
    setErro(""); aoCriar(s1);
  };
  return (
    <div className="mx-auto max-w-md space-y-4">
      {aviso}
      <Cartao titulo="Criar o seu cofre">
        <p className="mb-3 text-sm text-suave">Guarde senhas, cartões, chaves e notas. Tudo é cifrado <b className="text-texto">aqui no seu aparelho</b> antes de subir: nem o servidor nem a Vetorial Tech conseguem ler. Ele aparece em qualquer aparelho em que você entrar com o seu Vetorial ID.</p>
        <form onSubmit={enviar} className="space-y-3">
          <div><input className={campo} type="password" autoComplete="new-password" placeholder="Senha do cofre" value={s1} onChange={(e) => setS1(e.target.value)} /><Forca senha={s1} /></div>
          <input className={campo} type="password" autoComplete="new-password" placeholder="Repita a senha" value={s2} onChange={(e) => setS2(e.target.value)} />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao variante="primario" className="w-full" disabled={ocupado || !s1}>{ocupado ? "Criando…" : "Criar cofre"}</Botao>
        </form>
        <p className="mt-3 text-xs text-suave">Esta senha é só do cofre (diferente da senha do Vetorial ID). Na próxima tela você recebe um código de recuperação: sem a senha e sem o código, ninguém consegue abrir o cofre, nem a gente.</p>
      </Cartao>
    </div>
  );
}

function Codigo({ codigo, aoAnotar }: { codigo: string; aoAnotar: () => void }) {
  const [ok, setOk] = useState(false), [copiado, setCopiado] = useState(false);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Cartao titulo="Seu código de recuperação">
        <p className="mb-3 text-sm text-suave">Se você esquecer a senha do cofre, só este código abre ele. Ele aparece <b className="text-texto">uma vez só</b>. Anote em papel e guarde fora do celular.</p>
        <div className="select-all rounded-2xl border border-neon/30 bg-neon/5 px-3 py-4 text-center font-mono text-base tracking-wider text-neon">{codigo}</div>
        <div className="mt-3 flex gap-2">
          <Botao className="flex-1" onClick={() => { void navigator.clipboard?.writeText(codigo).then(() => setCopiado(true)).catch(() => undefined); }}>{copiado ? "Copiado" : "Copiar"}</Botao>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={ok} onChange={(e) => setOk(e.target.checked)} />Anotei o código em um lugar seguro.</label>
        <Botao variante="primario" className="mt-3 w-full" disabled={!ok} onClick={aoAnotar}>Continuar</Botao>
      </Cartao>
    </div>
  );
}

function Trancado({ recuperar, aviso, ocupado, bio, aoSenha, aoDigital, aoRecuperar, aoAlternar }: {
  recuperar: boolean; aviso: React.ReactNode; ocupado: boolean; bio: EstadoBio;
  aoSenha: (s: string) => void; aoDigital: () => void; aoRecuperar: (codigo: string, nova: string) => void; aoAlternar: () => void;
}) {
  const [senha, setSenha] = useState(""), [cod, setCod] = useState(""), [nova, setNova] = useState(""), [erro, setErro] = useState("");
  const jaPediu = useRef(false);
  useEffect(() => { if (bio.ativo && !recuperar && !jaPediu.current) { jaPediu.current = true; aoDigital(); } }, [bio.ativo, recuperar, aoDigital]);
  return (
    <div className="mx-auto max-w-md space-y-4">
      {aviso}
      <Cartao titulo={recuperar ? "Recuperar o cofre" : "Cofre trancado"}>
        {!recuperar ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); aoSenha(senha); setSenha(""); }}>
            {bio.ativo && <Botao type="button" variante="primario" className="w-full" disabled={ocupado} onClick={aoDigital}><Icone nome="seguranca" tam={18} />Abrir com digital, rosto ou padrão</Botao>}
            <input className={campo} type="password" autoComplete="current-password" placeholder="Senha do cofre" value={senha} onChange={(e) => setSenha(e.target.value)} />
            <Botao variante={bio.ativo ? "suave" : "primario"} className="w-full" disabled={ocupado || !senha}>{ocupado ? "Abrindo…" : "Abrir com a senha"}</Botao>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (nova.length < 10) return setErro("A senha nova precisa de pelo menos 10 caracteres."); setErro(""); aoRecuperar(cod, nova); }}>
            <p className="text-sm text-suave">Digite o código de recuperação que você anotou e escolha uma senha nova.</p>
            <input className={`${campo} font-mono uppercase`} autoComplete="off" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X" value={cod} onChange={(e) => setCod(e.target.value)} />
            <div><input className={campo} type="password" autoComplete="new-password" placeholder="Senha nova do cofre" value={nova} onChange={(e) => setNova(e.target.value)} /><Forca senha={nova} /></div>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <Botao variante="primario" className="w-full" disabled={ocupado || !cod || !nova}>{ocupado ? "Verificando…" : "Recuperar e abrir"}</Botao>
          </form>
        )}
        <button type="button" className="mt-3 w-full text-center text-sm text-neon" onClick={aoAlternar}>{recuperar ? "Voltar" : "Esqueci a senha"}</button>
      </Cartao>
    </div>
  );
}

function Aberto(p: {
  itens: Item[]; aviso: React.ReactNode; pendente: boolean; ocupado: boolean; bio: EstadoBio; email: string;
  aoTrancar: () => void; aoSalvarItem: (i: Item) => void; aoApagarItem: (id: string) => void; aoTentarDeNovo: () => void;
  aoAtivarBio: () => void; aoDesativarBio: () => void; aoTrocarSenha: (nova: string) => void; aoNovoCodigo: () => void; aoApagarCofre: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Item | null>(null);
  const [ver, setVer] = useState<Item | null>(null);
  const [ajustes, setAjustes] = useState(false);
  const lista = visiveis(p.itens).filter((i) => (i.titulo + " " + i.usuario + " " + i.url).toLowerCase().includes(busca.toLowerCase())).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

  // o botão voltar do celular fecha o item/ajustes antes de sair da tela
  useEffect(() => registrarVoltar(3, () => { if (editando) { setEditando(null); return true; } if (ver) { setVer(null); return true; } if (ajustes) { setAjustes(false); return true; } return false; }), [editando, ver, ajustes]);

  if (editando) return <Editor item={editando} ocupado={p.ocupado} aoCancelar={() => setEditando(null)} aoSalvar={(i) => { p.aoSalvarItem(i); setEditando(null); setVer(null); }} />;
  if (ver) return <Detalhe item={ver} aoVoltar={() => setVer(null)} aoEditar={() => { setEditando(ver); }} aoApagar={() => { p.aoApagarItem(ver.id); setVer(null); }} />;
  if (ajustes) return <AjustesDoCofre {...p} aoVoltar={() => setAjustes(false)} />;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {p.aviso}
      {p.pendente && <Aviso>Há mudanças que ainda não subiram para a nuvem. <button className="underline" onClick={p.aoTentarDeNovo}>Tentar agora</button></Aviso>}
      <div className="flex gap-2">
        <input className={campo} type="search" placeholder="Buscar no cofre" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no cofre" />
        <Botao onClick={p.aoTrancar} aria-label="Trancar o cofre">Trancar</Botao>
      </div>
      <div className="flex gap-2">
        <Botao variante="primario" className="flex-1" onClick={() => setEditando(novoItem("senha"))}>+ Novo item</Botao>
        <Botao onClick={() => setAjustes(true)}>Segurança do cofre</Botao>
      </div>
      {lista.length === 0 ? (
        <Cartao><p className="py-6 text-center text-sm text-suave">{p.itens.some((i) => !i.apagado) ? "Nada encontrado." : "O cofre está vazio. Toque em “Novo item” para guardar a primeira senha."}</p></Cartao>
      ) : (
        <ul className="space-y-2">
          {lista.map((i) => (
            <li key={i.id}><button className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-borda bg-white/[0.03] px-3 py-2 text-left hover:bg-white/5" onClick={() => setVer(i)}>
              <span className="grid size-10 flex-none place-items-center rounded-xl bg-neon/10 text-neon"><Icone nome="cofre" tam={20} /></span>
              <span className="min-w-0"><span className="block truncate text-[15px] font-medium">{i.titulo || "(sem nome)"}</span><span className="block truncate text-xs text-suave">{i.usuario || ROTULO[i.tipo]}</span></span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function copiar(texto: string, aoCopiar: () => void) {
  void navigator.clipboard?.writeText(texto).then(() => { aoCopiar(); setTimeout(() => { void navigator.clipboard?.writeText("").catch(() => undefined); }, LIMPAR_COPIA_MS); }).catch(() => undefined);
}

function Detalhe({ item, aoVoltar, aoEditar, aoApagar }: { item: Item; aoVoltar: () => void; aoEditar: () => void; aoApagar: () => void }) {
  const [mostrar, setMostrar] = useState(false), [copiado, setCopiado] = useState(""), [confirmar, setConfirmar] = useState(false);
  const linha = (rotulo: string, valor: string, segredo = false) => valor ? (
    <div className="rounded-xl border border-borda px-3 py-2">
      <div className="text-xs text-suave">{rotulo}</div>
      <div className="flex items-center gap-2"><div className={`min-w-0 flex-1 break-all text-sm ${segredo && !mostrar ? "tracking-widest" : ""}`}>{segredo && !mostrar ? "••••••••••" : valor}</div>
        {segredo && <button className="text-xs text-neon" onClick={() => setMostrar((m) => !m)}>{mostrar ? "Ocultar" : "Mostrar"}</button>}
        <button className="text-xs text-neon" onClick={() => copiar(valor, () => { setCopiado(rotulo); setTimeout(() => setCopiado(""), 2500); })}>{copiado === rotulo ? "Copiado" : "Copiar"}</button></div>
    </div>
  ) : null;
  return (
    <div className="mx-auto max-w-md space-y-3">
      <Cartao titulo={ROTULO[item.tipo]} acao={<button className="text-sm text-neon" onClick={aoVoltar}>Voltar</button>}>
        <h2 className="mb-3 text-lg font-semibold">{item.titulo || "(sem nome)"}</h2>
        <div className="space-y-2">
          {linha(item.tipo === "cartao" ? "Número ou conta" : "Usuário ou e-mail", item.usuario)}
          {linha(item.tipo === "nota" ? "Nota" : "Senha ou código", item.segredo, true)}
          {linha("Endereço", item.url)}
          {linha("Observações", item.notas)}
        </div>
        <p className="mt-3 text-xs text-suave">O que você copia some da área de transferência em 30 segundos.</p>
        <div className="mt-3 flex gap-2"><Botao className="flex-1" onClick={aoEditar}>Editar</Botao>{confirmar ? <Botao variante="perigo" className="flex-1" onClick={aoApagar}>Apagar mesmo</Botao> : <Botao variante="perigo" onClick={() => setConfirmar(true)}>Apagar</Botao>}</div>
      </Cartao>
    </div>
  );
}

function Editor({ item, ocupado, aoCancelar, aoSalvar }: { item: Item; ocupado: boolean; aoCancelar: () => void; aoSalvar: (i: Item) => void }) {
  const [i, setI] = useState(item), [ver, setVer] = useState(false), [erro, setErro] = useState("");
  const mudar = <K extends keyof Item>(k: K, v: Item[K]) => setI((x) => ({ ...x, [k]: v }));
  return (
    <div className="mx-auto max-w-md space-y-3">
      <Cartao titulo={item.titulo ? "Editar item" : "Novo item"} acao={<button className="text-sm text-neon" onClick={aoCancelar}>Cancelar</button>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!i.titulo.trim()) return setErro("Dê um nome para o item."); aoSalvar({ ...i, titulo: i.titulo.trim() }); }}>
          <select className={campo} value={i.tipo} onChange={(e) => mudar("tipo", e.target.value as TipoDeItem)} aria-label="Tipo">{(Object.keys(ROTULO) as TipoDeItem[]).map((t) => <option key={t} value={t}>{ROTULO[t]}</option>)}</select>
          <input className={campo} placeholder="Nome (ex.: Banco, Instagram da loja)" value={i.titulo} onChange={(e) => mudar("titulo", e.target.value)} />
          {i.tipo !== "nota" && <input className={campo} placeholder={i.tipo === "cartao" ? "Número ou conta" : "Usuário ou e-mail"} autoComplete="off" value={i.usuario} onChange={(e) => mudar("usuario", e.target.value)} />}
          <div>
            <div className="flex gap-2"><input className={campo} type={ver ? "text" : "password"} autoComplete="off" placeholder={i.tipo === "nota" ? "Texto da nota" : "Senha ou código"} value={i.segredo} onChange={(e) => mudar("segredo", e.target.value)} />
              <Botao type="button" onClick={() => setVer((v) => !v)}>{ver ? "Ocultar" : "Ver"}</Botao></div>
            {i.tipo !== "nota" && <div className="mt-2 flex items-center gap-2"><Botao type="button" onClick={() => { mudar("segredo", gerarSenha()); setVer(true); }}>Gerar senha forte</Botao></div>}
            {i.tipo === "senha" && <Forca senha={i.segredo} />}
          </div>
          {i.tipo !== "nota" && <input className={campo} placeholder="Endereço (opcional)" autoComplete="off" value={i.url} onChange={(e) => mudar("url", e.target.value)} />}
          <textarea className={`${campo} min-h-20 py-2`} placeholder="Observações (opcional)" value={i.notas} onChange={(e) => mudar("notas", e.target.value)} />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao variante="primario" className="w-full" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar no cofre"}</Botao>
        </form>
      </Cartao>
    </div>
  );
}

function AjustesDoCofre(p: Parameters<typeof Aberto>[0] & { aoVoltar: () => void }) {
  const [nova, setNova] = useState(""), [confirmar, setConfirmar] = useState(""), [apagar, setApagar] = useState(false);
  return (
    <div className="mx-auto max-w-md space-y-3">
      {p.aviso}
      <Cartao titulo="Segurança do cofre" acao={<button className="text-sm text-neon" onClick={p.aoVoltar}>Voltar</button>}>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">Digital, rosto ou padrão do celular</div>
            <p className="mb-2 text-xs text-suave">{p.bio.disponivel ? "Abre o cofre sem digitar a senha. A chave fica protegida dentro do celular." : "Disponível no Android 9 ou mais novo, com bloqueio de tela ligado (digital, rosto, PIN ou padrão)."}</p>
            {p.bio.ativo ? <Botao onClick={p.aoDesativarBio}>Desativar neste aparelho</Botao> : <Botao variante="primario" disabled={!p.bio.disponivel || p.ocupado} onClick={p.aoAtivarBio}>Ativar neste aparelho</Botao>}
          </div>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (nova.length >= 10 && nova === confirmar) { p.aoTrocarSenha(nova); setNova(""); setConfirmar(""); } }}>
            <div className="text-sm font-medium">Trocar a senha do cofre</div>
            <input className={campo} type="password" autoComplete="new-password" placeholder="Senha nova" value={nova} onChange={(e) => setNova(e.target.value)} />
            <Forca senha={nova} />
            <input className={campo} type="password" autoComplete="new-password" placeholder="Repita a senha nova" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            <Botao disabled={p.ocupado || nova.length < 10 || nova !== confirmar}>Trocar senha</Botao>
          </form>
          <div>
            <div className="text-sm font-medium">Código de recuperação</div>
            <p className="mb-2 text-xs text-suave">Gera um código novo; o antigo deixa de funcionar.</p>
            <Botao disabled={p.ocupado} onClick={p.aoNovoCodigo}>Gerar código novo</Botao>
          </div>
          <div>
            <div className="text-sm font-medium text-erro">Apagar o cofre</div>
            <p className="mb-2 text-xs text-suave">Apaga tudo, em todos os aparelhos. Não tem volta.</p>
            {apagar ? <Botao variante="perigo" disabled={p.ocupado} onClick={p.aoApagarCofre}>Apagar de vez</Botao> : <Botao variante="perigo" onClick={() => setApagar(true)}>Apagar o cofre…</Botao>}
          </div>
        </div>
      </Cartao>
    </div>
  );
}
