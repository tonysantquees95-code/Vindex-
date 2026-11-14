import test from "node:test";
import assert from "node:assert/strict";
import { organizarProgramas } from "../src/programas.ts";

const p = (nome, bytes, instaladoEm, extra = {}) => ({ id: nome, nome, editora: "", versao: "", bytes, instaladoEm, local: "", sistema: false, silencioso: false, ...extra });
const lista = [p("zeta", 10, "2024-01-01"), p("Alfa", 500, "2023-05-05"), p("beta", 500, "2025-02-02", { editora: "Acme" })];

test("ordena por nome sem ligar para maiúsculas, por tamanho (maior primeiro) e por mais recentes", () => {
  assert.deepEqual(organizarProgramas(lista, "", "nome").map((x) => x.nome), ["Alfa", "beta", "zeta"]);
  assert.deepEqual(organizarProgramas(lista, "", "tamanho").map((x) => x.nome), ["Alfa", "beta", "zeta"]);
  assert.deepEqual(organizarProgramas(lista, "", "data").map((x) => x.nome), ["beta", "zeta", "Alfa"]);
});

test("busca por nome, editora ou pacote e não mexe na lista original", () => {
  assert.deepEqual(organizarProgramas(lista, "ACME", "nome").map((x) => x.nome), ["beta"]);
  assert.deepEqual(organizarProgramas(lista, "al", "nome").map((x) => x.nome), ["Alfa"]);
  assert.equal(organizarProgramas(lista, "nada", "nome").length, 0);
  assert.deepEqual(lista.map((x) => x.nome), ["zeta", "Alfa", "beta"]);
});
