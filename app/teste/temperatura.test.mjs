import test from "node:test";
import assert from "node:assert/strict";
import { avaliar, tipoDoSensor, nivelDaTemperatura, reguaDe, tomDoNivel, dicaDeTemperatura } from "../src/temperatura.ts";

test("reconhece a peça pelo nome do sensor", () => {
  assert.equal(tipoDoSensor("Bateria"), "bateria");
  assert.equal(tipoDoSensor("battery"), "bateria");
  assert.equal(tipoDoSensor("quiet-therm"), "carcaca");
  assert.equal(tipoDoSensor("skin-msm-therm"), "carcaca");
  assert.equal(tipoDoSensor("cpu-1-0-usr"), "processador");
  assert.equal(tipoDoSensor("gpuss-0"), "processador");
});

test("44 °C no processador é normal; 44 °C na bateria já é quente", () => {
  assert.equal(nivelDaTemperatura(44, reguaDe("cpu-0")), 0);
  assert.equal(nivelDaTemperatura(44, reguaDe("Bateria")), 2);
  assert.equal(nivelDaTemperatura(85, reguaDe("cpu-0")), 2);
  assert.equal(nivelDaTemperatura(95, reguaDe("cpu-0")), 3);
});

test("o caso do usuário (sensores mornos, Android sem reclamar) não é 'quente'", () => {
  const a = avaliar([{ nome: "cpu-0-0-usr", celsius: 46 }, { nome: "gpuss-0", celsius: 44 }, { nome: "Bateria", celsius: 33.5 }], { estado: 0 });
  assert.equal(a.nivel, 0);
  assert.equal(dicaDeTemperatura(a), null);
  assert.equal(tomDoNivel(a.nivel), "ok");
});

test("o estado térmico do Android manda no processador", () => {
  const sensores = [{ nome: "cpu-0", celsius: 50 }, { nome: "Bateria", celsius: 33 }];
  assert.equal(avaliar(sensores, { estado: 2 }).nivel, 2);
  assert.equal(avaliar(sensores, { estado: 4 }).nivel, 3);
  assert.match(dicaDeTemperatura(avaliar(sensores, { estado: 2 })), /quente/);
  assert.equal(avaliar([{ nome: "cpu-0", celsius: 90 }], { estado: 0 }).nivel, 0);
});

test("a bateria quente conta mesmo com o Android calmo", () => {
  const a = avaliar([{ nome: "cpu-0", celsius: 45 }, { nome: "Bateria", celsius: 44 }], { estado: 0 });
  assert.equal(a.nivel, 2);
  assert.equal(a.sensor.tipo, "bateria");
  assert.match(dicaDeTemperatura(a), /bateria/i);
});

test("sem estado do Android (Windows, Android antigo) usa a régua de cada peça", () => {
  assert.equal(avaliar([{ nome: "Package id 0", celsius: 55 }], null).nivel, 0);
  assert.equal(avaliar([{ nome: "Package id 0", celsius: 83 }], null).nivel, 2);
  assert.equal(avaliar([], null).nivel, 0);
  assert.equal(avaliar([], null).sensor, null);
});

test("a folga do Android define o arco: 1.0 = limite", () => {
  const a = avaliar([{ nome: "cpu-0", celsius: 50 }], { estado: 0, folga: 0.62 });
  assert.equal(Math.round(a.fracao), 62);
  assert.ok(avaliar([{ nome: "cpu-0", celsius: 50 }], { estado: 0 }).fracao > 0);
});
