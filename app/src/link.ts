// Verificador de links (protetor web): análise local, sem enviar o endereço para ninguém.
export type Veredito = "seguro" | "atencao" | "perigo";
export interface AnaliseDeLink { veredito: Veredito; host: string; motivos: string[]; pontos: number }

const ENCURTADORES = ["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "is.gd", "rb.gy", "shorturl.at", "goo.gl", "ow.ly", "tiny.cc", "buff.ly", "encurtador.com.br"];
const TLDS_SUSPEITOS = ["zip", "mov", "top", "xyz", "click", "work", "loan", "gq", "tk", "ml", "cf", "ga", "country", "kim", "support", "icu", "cyou", "rest"];
const MARCAS: { nome: string; oficiais: string[] }[] = [
  { nome: "paypal", oficiais: ["paypal.com"] }, { nome: "mercadopago", oficiais: ["mercadopago.com.br", "mercadopago.com"] }, { nome: "mercadolivre", oficiais: ["mercadolivre.com.br", "mercadolivre.com"] },
  { nome: "nubank", oficiais: ["nubank.com.br"] }, { nome: "itau", oficiais: ["itau.com.br"] }, { nome: "bradesco", oficiais: ["bradesco.com.br"] },
  { nome: "santander", oficiais: ["santander.com.br"] }, { nome: "caixa", oficiais: ["caixa.gov.br"] }, { nome: "correios", oficiais: ["correios.com.br"] },
  { nome: "receita", oficiais: ["receita.fazenda.gov.br", "gov.br"] }, { nome: "netflix", oficiais: ["netflix.com"] }, { nome: "instagram", oficiais: ["instagram.com"] },
  { nome: "facebook", oficiais: ["facebook.com"] }, { nome: "whatsapp", oficiais: ["whatsapp.com", "wa.me"] }, { nome: "google", oficiais: ["google.com", "google.com.br"] },
  { nome: "microsoft", oficiais: ["microsoft.com", "live.com"] }, { nome: "apple", oficiais: ["apple.com"] }, { nome: "amazon", oficiais: ["amazon.com", "amazon.com.br"] }
];
const PALAVRAS = ["login", "entrar", "verificar", "verify", "senha", "password", "atualizar", "update", "premio", "prêmio", "ganhou", "bonus", "bônus", "urgente", "bloqueado", "suspensa", "cpf", "boleto-vencido"];

const doDominio = (host: string, d: string) => host === d || host.endsWith("." + d);
const normaliza = (t: string) => t.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/@/g, "a");

export function analisarLink(entrada: string): AnaliseDeLink | null {
  let texto = entrada.trim();
  if (!texto) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) texto = "https://" + texto;
  let u: URL;
  try { u = new URL(texto); } catch { return { veredito: "atencao", host: "", motivos: ["Isso não parece um endereço válido."], pontos: 1 }; }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const motivos: string[] = [];
  let pontos = 0;
  const marca = (m: string, p: number) => { motivos.push(m); pontos += p; };

  if (u.protocol !== "https:") marca("O endereço não usa HTTPS (conexão não protegida).", 2);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) marca("Usa um número de IP em vez de um nome de site.", 3);
  if (host.split(".").some((p) => p.startsWith("xn--"))) marca("Usa caracteres disfarçados (punycode) que imitam letras comuns.", 3);
  if (u.username || u.password || entrada.includes("@")) marca("Tem “@” no endereço: o que aparece antes dele costuma enganar sobre o destino real.", 3);
  if (ENCURTADORES.some((e) => doDominio(host, e))) marca("É um link encurtado: o destino real fica escondido.", 2);
  const tld = host.split(".").pop() ?? "";
  if (TLDS_SUSPEITOS.includes(tld)) marca(`A terminação “.${tld}” é muito usada em golpes.`, 2);
  if (host.split(".").length > 4) marca("Tem subdomínios demais, um truque comum para parecer um site conhecido.", 2);
  if ((host.replace(/xn--/g, "").match(/-/g) ?? []).length >= 3) marca("Tem muitos hífens no nome do site.", 1);
  const n = normaliza(host);
  const pedacos = n.split(/[.-]/);
  for (const m of MARCAS) {
    // palavra inteira (nubank-login.com) ou nome longo e distintivo dentro do endereço (mercadopagoseguro.com)
    const parece = pedacos.includes(m.nome) || (m.nome.length >= 7 && n.includes(m.nome));
    if (parece && !m.oficiais.some((o) => doDominio(host, o))) { marca(`Parece imitar “${m.nome}”, mas o site oficial é ${m.oficiais[0]}.`, 3); break; }
  }
  const resto = (u.pathname + u.search).toLowerCase();
  if (PALAVRAS.some((p) => host.includes(p) || resto.includes(p))) marca("Pede login, senha ou ação urgente: cuidado com golpes de “confirme seus dados”.", 1);
  if (entrada.length > 200) marca("O endereço é muito longo.", 1);

  const veredito: Veredito = pontos >= 4 ? "perigo" : pontos >= 1 ? "atencao" : "seguro";
  if (!motivos.length) motivos.push("Nenhum sinal de golpe encontrado nesta análise. Isso não é garantia: confira sempre quem enviou o link.");
  return { veredito, host, motivos, pontos };
}
