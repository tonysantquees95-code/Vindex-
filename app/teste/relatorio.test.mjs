import test from "node:test";
import assert from "node:assert/strict";
import { novosApps, relatorioVencido, SEMANA } from "../src/relatorio.ts";

const app = (pacote) => ({ pacote, nome: pacote, versao: "1", foraDaLoja: true, instaladoEm: 0 });

test("app novo só aparece depois da primeira conferência", () => {
  assert.deepEqual(novosApps([app("a"), app("b")], null), []);
  assert.deepEqual(novosApps([app("a"), app("b")], ["a"]).map((x) => x.pacote), ["b"]);
  assert.deepEqual(novosApps([app("a")], ["a", "c"]), []);
});

test("relatório vence em uma semana", () => {
  const r = { quando: 1000, analisados: 1, achados: 0, graves: 0, novos: [], foraDaLoja: 0 };
  assert.equal(relatorioVencido(null, 5), true);
  assert.equal(relatorioVencido(r, 1000 + SEMANA - 1), false);
  assert.equal(relatorioVencido(r, 1000 + SEMANA), true);
  assert.equal(relatorioVencido(r, 500), true);
});
