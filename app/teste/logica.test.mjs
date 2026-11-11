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
