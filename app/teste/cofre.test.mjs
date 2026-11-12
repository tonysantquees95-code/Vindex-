import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/cofre/cripto.ts";

const RAPIDO = { iter: 1000 };
const item = (id, titulo, atualizado, extra = {}) => ({ ...C.novoItem(), id, titulo, atualizado, ...extra });

test("cria, salva, abre com a senha e os itens voltam iguais", async () => {
  const { pacote, aberto } = await C.criarCofre("minha senha forte 123", RAPIDO);
  const it = item("a", "Banco", 1, { usuario: "toni", segredo: "s3gredo-çãõ" });
  const p2 = await C.salvarItens(pacote, aberto.dek, [it]);
  const de = C.desempacotar(C.empacotar(p2));
  const r = await C.abrirComSenha(de, "minha senha forte 123");
  assert.deepEqual(r.itens, [it]);
});

test("o pacote não deixa ver o segredo nem o título", async () => {
  const { pacote, aberto } = await C.criarCofre("minha senha forte 123", RAPIDO);
  const p2 = await C.salvarItens(pacote, aberto.dek, [item("a", "TituloSecreto", 1, { segredo: "SegredoClaro" })]);
  const texto = C.empacotar(p2) + JSON.stringify(p2);
  assert.ok(!texto.includes("SegredoClaro") && !texto.includes("TituloSecreto"));
  assert.ok(!atob(C.empacotar(p2)).includes("SegredoClaro"));
});

test("senha errada é recusada com código 'senha'", async () => {
  const { pacote } = await C.criarCofre("minha senha forte 123", RAPIDO);
  await assert.rejects(() => C.abrirComSenha(pacote, "outra senha qualquer"), (e) => e.codigo === "senha");
});

test("código de recuperação abre, aceita minúsculas e enganos, e o formato é o esperado", async () => {
  const { pacote, aberto, codigo } = await C.criarCofre("minha senha forte 123", RAPIDO);
  assert.match(codigo, /^([0-9A-Z]{5}-){5}[0-9A-Z]$/);
  const p2 = await C.salvarItens(pacote, aberto.dek, [item("a", "X", 1)]);
  const digitado = codigo.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l");
  assert.equal((await C.abrirComRecuperacao(p2, digitado)).itens.length, 1);
  await assert.rejects(() => C.abrirComRecuperacao(p2, "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-A"), (e) => e.codigo === "recuperacao");
});

test("trocar a senha: a nova abre, a antiga não, os itens ficam", async () => {
  const { pacote, aberto } = await C.criarCofre("senha antiga 123456", RAPIDO);
  const p2 = await C.salvarItens(pacote, aberto.dek, [item("a", "X", 1)]);
  const p3 = await C.trocarSenha(p2, aberto.dek, "senha nova 654321", RAPIDO);
  assert.equal((await C.abrirComSenha(p3, "senha nova 654321")).itens.length, 1);
  await assert.rejects(() => C.abrirComSenha(p3, "senha antiga 123456"), (e) => e.codigo === "senha");
});

test("nova recuperação invalida o código velho", async () => {
  const { pacote, aberto, codigo } = await C.criarCofre("minha senha forte 123", RAPIDO);
  const { pacote: p2, codigo: novo } = await C.novaRecuperacao(pacote, aberto.dek, RAPIDO);
  assert.notEqual(novo, codigo);
  await C.abrirComRecuperacao(p2, novo);
  await assert.rejects(() => C.abrirComRecuperacao(p2, codigo), (e) => e.codigo === "recuperacao");
});

test("a chave do aparelho (digital) abre; chave de outro cofre não", async () => {
  const a = await C.criarCofre("minha senha forte 123", RAPIDO);
  const b = await C.criarCofre("minha senha forte 123", RAPIDO);
  assert.equal((await C.abrirComChave(a.pacote, a.aberto.dek)).itens.length, 0);
  await assert.rejects(() => C.abrirComChave(a.pacote, b.aberto.dek), (e) => e.codigo === "chave");
});

test("adulterar o pacote é detectado", async () => {
  const { pacote, aberto } = await C.criarCofre("minha senha forte 123", RAPIDO);
  const p2 = await C.salvarItens(pacote, aberto.dek, [item("a", "X", 1)]);
  const ct = C.deB64(p2.dados.ct); ct[0] ^= 1;
  const ruim = { ...p2, dados: { ...p2.dados, ct: C.paraB64(ct) } };
  await assert.rejects(() => C.abrirComSenha(ruim, "minha senha forte 123"), (e) => e.codigo === "pacote");
  await assert.rejects(() => C.abrirComSenha({ v: 2 }, "x"), (e) => e.codigo === "pacote");
  assert.throws(() => C.desempacotar("isso não é base64 de json"), (e) => e.codigo === "pacote");
});

test("juntar: vale o mais recente, apagar vence edição antiga, lápide velha some", () => {
  const dia = 24 * 3600_000, agora = 200 * dia;
  const t = agora - 10 * dia;
  const local = [item("a", "A-local", t), item("b", "B", t), item("c", "C", t)];
  const nuvem = [item("a", "A-nuvem", t + 5), item("b", "B", t + 10, { apagado: true }), item("d", "D", 1, { apagado: true })];
  const r = C.juntar(local, nuvem, agora);
  assert.equal(r.find((i) => i.id === "a").titulo, "A-nuvem");
  assert.equal(r.find((i) => i.id === "b").apagado, true);
  assert.ok(r.find((i) => i.id === "c"));
  assert.equal(r.find((i) => i.id === "d"), undefined);
  assert.deepEqual(C.visiveis(r).map((i) => i.id).sort(), ["a", "c"]);
});

test("gerador: tamanho, grupos pedidos e sem repetição previsível", () => {
  const s = C.gerarSenha({ tamanho: 24, maiusculas: true, numeros: true, simbolos: true });
  assert.equal(s.length, 24);
  assert.match(s, /[a-z]/); assert.match(s, /[A-Z]/); assert.match(s, /[0-9]/); assert.match(s, /[^A-Za-z0-9]/);
  const so = C.gerarSenha({ tamanho: 12, maiusculas: false, numeros: false, simbolos: false });
  assert.match(so, /^[a-z]{12}$/);
  assert.notEqual(C.gerarSenha(), C.gerarSenha());
  assert.equal(C.gerarSenha({ tamanho: 3, maiusculas: true, numeros: true, simbolos: true }).length, 8);
});

test("força da senha", () => {
  assert.equal(C.forcaDaSenha("abc"), 0);
  assert.ok(C.forcaDaSenha("Abcdefghij1!zzzz") >= 3);
  assert.ok(C.forcaDaSenha("abcdefgh") < C.forcaDaSenha("Abcdefgh1234!xyz"));
});

test("o pacote gravado cabe no que o servidor aceita (só caracteres de base64)", async () => {
  const { pacote } = await C.criarCofre("minha senha forte 123", RAPIDO);
  assert.match(C.empacotar(pacote), /^[A-Za-z0-9+/=_.:-]+$/);
});
