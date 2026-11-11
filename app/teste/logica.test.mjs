import test from "node:test";
import assert from "node:assert/strict";
import { bytes, tempoLigado, tomDoUso, nomeDoArquivo, pastaDoArquivo, acrescentar } from "../src/formato.ts";
import { novaRegra, validar, frase, semCondicao } from "../src/regras.ts";

test("formata bytes, tempo e tom do uso", () => {
  assert.equal(bytes(0), "0 B");
  assert.equal(bytes(1536), "1.5 KB");
  assert.equal(bytes(5 * 1024 ** 3), "5.0 GB");
  assert.equal(tempoLigado(90_000), "1d 1h");
  assert.equal(tempoLigado(600), "10min");
  assert.equal(tomDoUso(30), "ok"); assert.equal(tomDoUso(70), "aviso"); assert.equal(tomDoUso(90), "erro");
});
test("caminhos e histórico", () => {
  assert.equal(nomeDoArquivo("C:\\Users\\a\\foto.jpg"), "foto.jpg");
  assert.equal(pastaDoArquivo("/home/a/foto.jpg"), "/home/a");
  assert.deepEqual(acrescentar([1, 2, 3], 4, 3), [2, 3, 4]);
});
test("regras: validação e frase legível", () => {
  const r = novaRegra("1");
  assert.equal(semCondicao(r), true);
  assert.equal(validar(r).length, 3);
  r.nome = "Fotos"; r.condicoes.categorias = ["imagens"]; r.acao = { tipo: "mover", destino: "Fotos" };
  assert.deepEqual(validar(r), []);
  assert.equal(frase(r), "Arquivos do tipo Imagens → pasta “Fotos”");
  r.condicoes.tamanho_min = 10 * 1048576; r.condicoes.tamanho_max = 1048576;
  assert.deepEqual(validar(r), ["O tamanho mínimo é maior que o máximo."]);
});

import { analisarLink } from "../src/link.ts";
import { REGRAS_PRONTAS, PACOTES_PRONTOS, adicionarProntas, regraDaPronta } from "../src/regras.ts";

test("protetor web: separa golpe de site normal", () => {
  assert.equal(analisarLink("https://www.google.com/search?q=oi").veredito, "seguro");
  assert.equal(analisarLink("https://pineapple.com").veredito, "seguro");
  assert.equal(analisarLink("https://github.com/x/y").veredito, "seguro");
  const golpe = analisarLink("http://nubank-login-verificar.top/entrar");
  assert.equal(golpe.veredito, "perigo");
  assert.ok(golpe.motivos.some((m) => m.includes("nubank")));
  assert.equal(analisarLink("https://paypa1.com/login").veredito, "perigo");
  assert.equal(analisarLink("https://paypa1.com").veredito, "atencao");
  assert.equal(analisarLink("http://192.168.0.1/x").veredito, "perigo");
  assert.equal(analisarLink("https://bit.ly/abc").veredito, "atencao");
  assert.equal(analisarLink("https://xn--pypal-4ve.com").veredito, "atencao");
  assert.equal(analisarLink("   "), null);
});

test("regras prontas são válidas e entram sem duplicar", () => {
  assert.ok(REGRAS_PRONTAS.length >= 10);
  for (const p of REGRAS_PRONTAS) assert.deepEqual(validar({ ...regraDaPronta(p) }), [], p.chave);
  const chaves = new Set(REGRAS_PRONTAS.map((p) => p.chave));
  for (const k of PACOTES_PRONTOS.flatMap((p) => p.chaves)) assert.ok(chaves.has(k), k);
  const dl = PACOTES_PRONTOS.find((p) => p.chave === "downloads");
  const a = adicionarProntas([], dl.chaves);
  assert.equal(a.length, dl.chaves.length);
  assert.equal(adicionarProntas(a, dl.chaves).length, a.length);
  const minha = novaRegra("meu"); minha.nome = "x"; minha.condicoes.extensoes = ["txt"]; minha.acao = { tipo: "mover", destino: "T" };
  const b = adicionarProntas([minha], ["fiscal"]);
  assert.deepEqual(b.map((r) => r.id), ["meu", "pronta:fiscal"]);
});
