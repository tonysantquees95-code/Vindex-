import test from "node:test";
import assert from "node:assert/strict";
import { numeroDaVersao, situacao, versaoDoRelease } from "../src/suite.ts";

const REPO = "tonysantquees95-code/Vortex";
const SHA = "a".repeat(64);
const release = (extra = {}) => ({
  tag_name: "1.59",
  assets: [{ name: "Vortex.apk", size: 10, digest: "sha256:" + SHA, browser_download_url: `https://github.com/${REPO}/releases/download/1.59/Vortex.apk`, ...extra }],
});

test("número da versão", () => {
  assert.equal(numeroDaVersao("1.39"), 39);
  assert.equal(numeroDaVersao("v1.20"), 20);
  assert.equal(numeroDaVersao("abc"), 0);
});

test("release válido vira versão publicada", () => {
  const v = versaoDoRelease(REPO, release());
  assert.equal(v.numero, 59);
  assert.equal(v.sha256, SHA);
});

test("recusa APK sem SHA-256 ou de outro endereço", () => {
  assert.equal(versaoDoRelease(REPO, release({ digest: "" })), null);
  assert.equal(versaoDoRelease(REPO, release({ browser_download_url: "https://exemplo.com/Vortex.apk" })), null);
  assert.equal(versaoDoRelease(REPO, release({ browser_download_url: "https://github.com/outro/Vortex/releases/download/1.59/Vortex.apk" })), null);
  assert.equal(versaoDoRelease(REPO, { tag_name: "1.59", assets: [] }), null);
});

test("situação do app", () => {
  const v = versaoDoRelease(REPO, release());
  assert.equal(situacao(false, "", v), "instalar");
  assert.equal(situacao(true, "1.58", v), "atualizar");
  assert.equal(situacao(true, "1.59", v), "em-dia");
  assert.equal(situacao(true, "1.59", null), "sem-versao");
});

test("versão antiga sem número (1.0) compara pela data de instalação", () => {
  const v = { ...versaoDoRelease(REPO, release()), publicadoEm: 1000 };
  assert.equal(situacao(true, "1.0", v, 2000), "em-dia");
  assert.equal(situacao(true, "1.0", v, 500), "atualizar");
  assert.equal(situacao(true, "1.0", v), "atualizar");
  assert.equal(situacao(true, "1.58", v, 5000), "atualizar");
});
