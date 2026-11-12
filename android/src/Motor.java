package tech.vetorial.vindex;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Motor de arquivos do Vindex no Android: mesmo contrato JSON do motor em Rust (Windows).
 * Só lógica de arquivos (sem dependências do Android além de org.json), para testar com JUnit.
 */
public final class Motor {
    public static final String QUARENTENA = "Vindex-Quarentena";

    private Motor() {}

    // ---------------------------------------------------------------- categorias
    public static String categoriaDaExtensao(String ext) {
        switch (ext) {
            case "jpg": case "jpeg": case "png": case "gif": case "webp": case "bmp": case "heic": case "svg": case "tif": case "tiff": case "raw": return "imagens";
            case "mp4": case "mkv": case "avi": case "mov": case "wmv": case "webm": case "flv": case "3gp": return "videos";
            case "mp3": case "wav": case "flac": case "aac": case "ogg": case "m4a": case "opus": case "wma": return "audios";
            case "pdf": case "doc": case "docx": case "txt": case "rtf": case "odt": case "md": case "epub": return "documentos";
            case "xls": case "xlsx": case "csv": case "ods": return "planilhas";
            case "ppt": case "pptx": case "odp": case "key": return "apresentacoes";
            case "zip": case "rar": case "7z": case "tar": case "gz": case "bz2": case "xz": return "compactados";
            case "exe": case "msi": case "apk": case "dmg": case "deb": case "iso": return "instaladores";
            case "rs": case "js": case "ts": case "py": case "kt": case "java": case "c": case "cpp": case "h": case "json": case "html": case "css": case "sql": return "codigo";
            default: return "outros";
        }
    }

    public static String pastaDaCategoria(String cat) {
        switch (cat) {
            case "imagens": return "Imagens";
            case "videos": return "Vídeos";
            case "audios": return "Áudios";
            case "documentos": return "Documentos";
            case "planilhas": return "Planilhas";
            case "apresentacoes": return "Apresentações";
            case "compactados": return "Compactados";
            case "instaladores": return "Instaladores";
            case "codigo": return "Código";
            default: return "Outros";
        }
    }

    public static String extensao(String nome) {
        int i = nome.lastIndexOf('.');
        return i <= 0 || i == nome.length() - 1 ? "" : nome.substring(i + 1).toLowerCase(Locale.ROOT);
    }

    // ---------------------------------------------------------------- arquivos
    public static final class Arq {
        public final File caminho;
        public final String nome, ext, categoria;
        public final long bytes, modificado; // modificado em segundos

        Arq(File f) {
            caminho = f;
            nome = f.getName();
            ext = extensao(nome);
            categoria = categoriaDaExtensao(ext);
            bytes = f.length();
            modificado = f.lastModified() / 1000;
        }

        JSONObject json() throws JSONException {
            return new JSONObject().put("caminho", caminho.getPath()).put("nome", nome).put("extensao", ext).put("categoria", categoria).put("bytes", bytes).put("modificado", modificado);
        }
    }

    private static boolean oculto(String n) {
        return n.startsWith(".") || n.startsWith("~$");
    }

    private static boolean ehLink(File f) {
        return Files.isSymbolicLink(f.toPath());
    }

    public static List<Arq> varrer(List<File> raizes, int profundidade) {
        List<Arq> v = new ArrayList<>();
        for (File r : raizes) descer(r, 1, Math.max(1, profundidade), v);
        return v;
    }

    private static void descer(File pasta, int nivel, int max, List<Arq> saida) {
        File[] filhos = pasta.listFiles();
        if (filhos == null) return;
        for (File f : filhos) {
            String n = f.getName();
            if (oculto(n) || n.equals(QUARENTENA) || ehLink(f)) continue;
            if (f.isFile()) saida.add(new Arq(f));
            else if (f.isDirectory() && nivel < max) descer(f, nivel + 1, max, saida);
        }
    }

    public static String sha256(File f, long limite) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest h = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[64 * 1024];
            long lido = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                h.update(buf, 0, n);
                lido += n;
                if (limite > 0 && lido >= limite) break;
            }
            StringBuilder s = new StringBuilder();
            for (byte b : h.digest()) s.append(String.format("%02x", b));
            return s.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    /** Duplicados exatos: tamanho → início do arquivo → SHA-256 completo. */
    public static JSONArray duplicados(List<Arq> arquivos, long minBytes) throws JSONException {
        Map<Long, List<Arq>> porTamanho = new HashMap<>();
        for (Arq a : arquivos) if (a.bytes >= Math.max(1, minBytes)) porTamanho.computeIfAbsent(a.bytes, k -> new ArrayList<>()).add(a);
        List<JSONObject> grupos = new ArrayList<>();
        for (Map.Entry<Long, List<Arq>> e : porTamanho.entrySet()) {
            if (e.getValue().size() < 2) continue;
            Map<String, List<Arq>> porInicio = new HashMap<>();
            for (Arq a : e.getValue()) {
                try { porInicio.computeIfAbsent(sha256(a.caminho, 64 * 1024), k -> new ArrayList<>()).add(a); } catch (IOException ignorado) { /* lido por outro app */ }
            }
            for (List<Arq> cand : porInicio.values()) {
                if (cand.size() < 2) continue;
                Map<String, List<String>> porHash = new HashMap<>();
                for (Arq a : cand) {
                    try { porHash.computeIfAbsent(sha256(a.caminho, 0), k -> new ArrayList<>()).add(a.caminho.getPath()); } catch (IOException ignorado) { /* idem */ }
                }
                for (Map.Entry<String, List<String>> h : porHash.entrySet()) {
                    if (h.getValue().size() < 2) continue;
                    List<String> caminhos = h.getValue();
                    Collections.sort(caminhos);
                    grupos.add(new JSONObject().put("sha256", h.getKey()).put("bytes", e.getKey()).put("caminhos", new JSONArray(caminhos)).put("desperdicio", e.getKey() * (caminhos.size() - 1)));
                }
            }
        }
        Collections.sort(grupos, (a, b) -> {
            int c = Long.compare(b.optLong("desperdicio"), a.optLong("desperdicio"));
            return c != 0 ? c : a.optString("sha256").compareTo(b.optString("sha256"));
        });
        return new JSONArray(grupos);
    }

    public static JSONArray gigantes(List<Arq> arquivos, long minBytes, long paradoDias, long agoraS) throws JSONException {
        List<Arq> v = new ArrayList<>();
        for (Arq a : arquivos) if (a.bytes >= minBytes && agoraS - a.modificado >= paradoDias * 86_400L) v.add(a);
        Collections.sort(v, (a, b) -> Long.compare(b.bytes, a.bytes));
        JSONArray r = new JSONArray();
        for (Arq a : v) r.put(a.json());
        return r;
    }

    // ---------------------------------------------------------------- explorador (gerenciador de arquivos)
    private static JSONObject itemJson(File f, boolean contar) throws JSONException {
        boolean pasta = f.isDirectory();
        String[] filhos = pasta && contar ? f.list() : null;
        return new JSONObject().put("nome", f.getName()).put("caminho", f.getPath()).put("pasta", pasta)
                .put("bytes", pasta ? 0 : f.length()).put("modificado", f.lastModified() / 1000)
                .put("categoria", pasta ? "pasta" : categoriaDaExtensao(extensao(f.getName())))
                .put("itens", filhos == null ? 0 : filhos.length);
    }

    public static JSONObject explorarListar(File pasta, boolean ocultos, int limite) throws JSONException {
        if (!pasta.isDirectory()) throw new JSONException("A pasta não existe.");
        File[] filhos = pasta.listFiles();
        if (filhos == null) throw new JSONException("Sem permissão para abrir essa pasta.");
        List<File> l = new ArrayList<>();
        for (File f : filhos) {
            String n = f.getName();
            if (!ocultos && oculto(n)) continue;
            l.add(f);
        }
        Collections.sort(l, (a, b) -> {
            boolean pa = a.isDirectory(), pb = b.isDirectory();
            if (pa != pb) return pa ? -1 : 1;
            return a.getName().toLowerCase(Locale.ROOT).compareTo(b.getName().toLowerCase(Locale.ROOT));
        });
        JSONArray itens = new JSONArray();
        for (File f : l) {
            if (itens.length() >= limite) break;
            itens.put(itemJson(f, true));
        }
        File pai = pasta.getParentFile();
        return new JSONObject().put("caminho", pasta.getPath()).put("pai", pai == null ? JSONObject.NULL : pai.getPath())
                .put("itens", itens).put("truncado", l.size() > limite);
    }

    private static JSONArray itensDe(List<Arq> arquivos, String categoria, int limite) throws JSONException {
        List<Arq> l = new ArrayList<>();
        for (Arq a : arquivos) {
            if (categoria == null || a.categoria.equals(categoria) || (categoria.equals("documentos") && (a.categoria.equals("planilhas") || a.categoria.equals("apresentacoes")))) l.add(a);
        }
        Collections.sort(l, (x, y) -> Long.compare(y.modificado, x.modificado));
        JSONArray v = new JSONArray();
        for (Arq a : l) {
            if (v.length() >= limite) break;
            v.put(itemJson(a.caminho, false));
        }
        return v;
    }

    public static JSONArray explorarRecentes(List<File> raizes, int limite) throws JSONException {
        return itensDe(varrer(raizes, 5), null, Math.max(1, Math.min(500, limite)));
    }

    public static JSONArray explorarColecao(List<File> raizes, String categoria, int limite) throws JSONException {
        return itensDe(varrer(raizes, 6), categoria, Math.max(1, Math.min(1000, limite)));
    }

    public static JSONArray explorarBuscar(File raiz, String texto, int limite) throws JSONException {
        JSONArray v = new JSONArray();
        String t = texto == null ? "" : texto.trim().toLowerCase(Locale.ROOT);
        if (t.isEmpty() || !raiz.isDirectory()) return v;
        buscarEm(raiz, t, 1, Math.max(1, Math.min(500, limite)), v);
        return v;
    }

    private static void buscarEm(File pasta, String t, int nivel, int limite, JSONArray saida) throws JSONException {
        File[] filhos = pasta.listFiles();
        if (filhos == null) return;
        for (File f : filhos) {
            if (saida.length() >= limite) return;
            String n = f.getName();
            if (oculto(n) || n.equals(QUARENTENA) || ehLink(f)) continue;
            if (n.toLowerCase(Locale.ROOT).contains(t)) saida.put(itemJson(f, false));
            if (f.isDirectory() && nivel < 6) buscarEm(f, t, nivel + 1, limite, saida);
        }
    }

    public static String nomeValido(String nome) throws JSONException {
        String n = nome == null ? "" : nome.trim();
        if (n.isEmpty() || n.length() > 200 || n.equals(".") || n.equals("..") || n.matches(".*[/\\\\:*?\"<>|\\x00].*"))
            throw new JSONException("Nome inválido: não use / \\ : * ? \" < > |");
        return n;
    }

    public static String explorarNovaPasta(File dentro, String nome) throws JSONException {
        String n = nomeValido(nome);
        if (!dentro.isDirectory()) throw new JSONException("A pasta não existe.");
        File d = new File(dentro, n);
        if (d.exists()) throw new JSONException("Já existe algo com esse nome.");
        if (!d.mkdir()) throw new JSONException("Não consegui criar a pasta.");
        return d.getPath();
    }

    public static String explorarRenomear(File f, String nome) throws JSONException {
        String n = nomeValido(nome);
        File pai = f.getParentFile();
        if (pai == null || !f.exists()) throw new JSONException("Não existe mais.");
        File d = new File(pai, n);
        if (d.exists()) throw new JSONException("Já existe algo com esse nome.");
        if (!f.renameTo(d)) throw new JSONException("Não consegui renomear.");
        return d.getPath();
    }

    /** Arquivos e pastas vão para “Vindex-Quarentena” ao lado (a lixeira do Vindex); dá para desfazer. */
    public static JSONObject explorarLixeira(JSONArray caminhos) throws JSONException {
        JSONArray movs = new JSONArray();
        for (int i = 0; i < caminhos.length(); i++) {
            File f = new File(caminhos.getString(i));
            File pai = f.getParentFile();
            if ((!f.isFile() && !f.isDirectory()) || pai == null || f.getName().equals(QUARENTENA)) continue;
            movs.put(mov(f.getPath(), new File(new File(pai, QUARENTENA), f.getName()).getPath(), "lixeira do Vindex"));
        }
        return aplicar(movs, false);
    }

    /** Exclui de vez (sem lixeira). Recusa raízes e caminhos curtos e não segue atalhos. */
    public static JSONObject explorarApagar(JSONArray caminhos) throws JSONException {
        int apagados = 0;
        JSONArray falhas = new JSONArray();
        for (int i = 0; i < caminhos.length(); i++) {
            File f = new File(caminhos.getString(i));
            String[] partes = f.getPath().split("/+");
            int fundura = 0;
            for (String p : partes) if (!p.isEmpty()) fundura++;
            // /storage/emulated/0 (3 níveis) é o armazenamento inteiro: só vale dentro dele
            if (fundura < 4 || f.getName().isEmpty()) { falhas.put(f.getName() + ": protegido, não dá para excluir"); continue; }
            if (!f.exists() && !ehLink(f)) { falhas.put(f.getName() + ": não existe mais"); continue; }
            if (apagarRec(f)) apagados++; else falhas.put(f.getName() + ": não consegui excluir");
        }
        return new JSONObject().put("apagados", apagados).put("falhas", falhas);
    }

    private static boolean apagarRec(File f) {
        if (!ehLink(f) && f.isDirectory()) {
            File[] filhos = f.listFiles();
            if (filhos != null) for (File c : filhos) if (!apagarRec(c)) return false;
        }
        return f.delete();
    }

    /** Todas as pastas “Vindex-Quarentena” dentro das raízes (até 6 níveis). */
    public static JSONArray explorarQuarentenas(List<File> raizes) throws JSONException {
        JSONArray v = new JSONArray();
        for (File r : raizes) acharQuarentenas(r, 1, v);
        return v;
    }

    private static void acharQuarentenas(File pasta, int nivel, JSONArray saida) throws JSONException {
        File[] filhos = pasta.listFiles();
        if (filhos == null) return;
        for (File f : filhos) {
            String n = f.getName();
            if (!f.isDirectory() || oculto(n) || ehLink(f)) continue;
            if (n.equals(QUARENTENA)) {
                JSONObject o = itemJson(f, true);
                o.put("nome", "Quarentena de “" + pasta.getName() + "”");
                saida.put(o);
            } else if (nivel < 6) acharQuarentenas(f, nivel + 1, saida);
        }
    }

    // ---------------------------------------------------------------- movimentos
    public static File nomeLivre(File pasta, String nome) {
        File alvo = new File(pasta, nome);
        if (!alvo.exists()) return alvo;
        int i = nome.lastIndexOf('.');
        String base = i > 0 ? nome.substring(0, i) : nome;
        String ext = i > 0 ? nome.substring(i) : "";
        for (int n = 1; n < 10_000; n++) {
            File c = new File(pasta, base + " (" + n + ")" + ext);
            if (!c.exists()) return c;
        }
        return alvo;
    }

    public static JSONObject mov(String de, String para, String motivo) throws JSONException {
        return new JSONObject().put("de", de).put("para", para).put("motivo", motivo);
    }

    public static JSONArray planoPorCategoria(List<Arq> arquivos, File destino) throws JSONException {
        JSONArray v = new JSONArray();
        for (Arq a : arquivos) {
            File pasta = new File(destino, pastaDaCategoria(a.categoria));
            if (pasta.equals(a.caminho.getParentFile())) continue;
            v.put(mov(a.caminho.getPath(), new File(pasta, a.nome).getPath(), "categoria " + pastaDaCategoria(a.categoria)));
        }
        return v;
    }

    /** Move sem sobrescrever; com simulacao=true só calcula o resultado. */
    public static JSONObject aplicar(JSONArray movimentos, boolean simulacao) throws JSONException {
        JSONArray movidos = new JSONArray();
        JSONArray falhas = new JSONArray();
        for (int i = 0; i < movimentos.length(); i++) {
            JSONObject m = movimentos.getJSONObject(i);
            File de = new File(m.getString("de"));
            File para = new File(m.getString("para"));
            File pasta = para.getParentFile();
            if (pasta == null) { falhas.put(de.getPath() + ": destino inválido"); continue; }
            if (!de.exists()) { falhas.put(de.getPath() + ": não existe mais"); continue; }
            if (de.isDirectory() && pasta.getPath().startsWith(de.getPath() + File.separator)) { falhas.put(de.getPath() + ": não dá para mover uma pasta para dentro dela mesma"); continue; }
            File final_ = nomeLivre(pasta, para.getName());
            if (simulacao) { movidos.put(mov(de.getPath(), final_.getPath(), m.optString("motivo"))); continue; }
            try {
                if (!pasta.isDirectory() && !pasta.mkdirs()) throw new IOException("não consegui criar a pasta");
                Files.move(de.toPath(), final_.toPath(), StandardCopyOption.ATOMIC_MOVE);
                movidos.put(mov(de.getPath(), final_.getPath(), m.optString("motivo")));
            } catch (IOException | UnsupportedOperationException e1) {
                if (de.isDirectory()) { falhas.put(de.getPath() + ": " + e1.getMessage()); continue; } // pasta: só move no mesmo armazenamento
                try {
                    Files.copy(de.toPath(), final_.toPath());
                    if (!de.delete()) throw new IOException("copiei, mas não consegui apagar o original");
                    movidos.put(mov(de.getPath(), final_.getPath(), m.optString("motivo")));
                } catch (IOException e2) {
                    falhas.put(de.getPath() + ": " + e2.getMessage());
                }
            }
        }
        return new JSONObject().put("movidos", movidos).put("falhas", falhas).put("simulacao", simulacao);
    }

    public static JSONObject desfazer(JSONArray movidos) throws JSONException {
        JSONArray volta = new JSONArray();
        for (int i = movidos.length() - 1; i >= 0; i--) {
            JSONObject m = movidos.getJSONObject(i);
            volta.put(mov(m.getString("para"), m.getString("de"), "desfazer"));
        }
        return aplicar(volta, false);
    }

    public static JSONArray quarentenaDeDuplicados(JSONArray caminhos, File manter) throws JSONException {
        File pasta = new File(manter.getParentFile(), QUARENTENA);
        JSONArray v = new JSONArray();
        for (int i = 0; i < caminhos.length(); i++) {
            File c = new File(caminhos.getString(i));
            if (c.equals(manter)) continue;
            v.put(mov(c.getPath(), new File(pasta, c.getName()).getPath(), "duplicado"));
        }
        return v;
    }

    // ---------------------------------------------------------------- regras
    private static boolean contem(JSONArray a, String v) {
        for (int i = 0; i < a.length(); i++) if (a.optString(i).equalsIgnoreCase(v)) return true;
        return false;
    }


    static boolean semCondicao(JSONObject c) {
        JSONArray ext = c.optJSONArray("extensoes");
        JSONArray cat = c.optJSONArray("categorias");
        return (ext == null || ext.length() == 0) && (cat == null || cat.length() == 0)
                && (c.isNull("nome_contem") || c.optString("nome_contem").isEmpty()) && c.isNull("tamanho_min") && c.isNull("tamanho_max") && c.isNull("parado_dias_min");
    }

    static boolean confere(JSONObject c, Arq a, long agoraS) {
        JSONArray ext = c.optJSONArray("extensoes");
        if (ext != null && ext.length() > 0) {
            boolean ok = false;
            for (int i = 0; i < ext.length(); i++) if (ext.optString(i).replaceFirst("^\\.", "").equalsIgnoreCase(a.ext)) ok = true;
            if (!ok) return false;
        }
        JSONArray cat = c.optJSONArray("categorias");
        if (cat != null && cat.length() > 0 && !contem(cat, a.categoria)) return false;
        if (!c.isNull("nome_contem") && !c.optString("nome_contem").isEmpty() && !a.nome.toLowerCase(Locale.ROOT).contains(c.optString("nome_contem").toLowerCase(Locale.ROOT))) return false;
        if (!c.isNull("tamanho_min") && a.bytes < c.optLong("tamanho_min")) return false;
        if (!c.isNull("tamanho_max") && a.bytes > c.optLong("tamanho_max")) return false;
        return c.isNull("parado_dias_min") || agoraS - a.modificado >= c.optLong("parado_dias_min") * 86_400L;
    }

    /** A primeira regra ativa que casa decide; regra sem condição nenhuma é ignorada. */
    public static JSONArray avaliar(JSONArray regras, List<Arq> arquivos, File base, long agoraS) throws JSONException {
        JSONArray v = new JSONArray();
        for (Arq a : arquivos) {
            for (int i = 0; i < regras.length(); i++) {
                JSONObject r = regras.getJSONObject(i);
                JSONObject c = r.optJSONObject("condicoes") == null ? new JSONObject() : r.getJSONObject("condicoes");
                if (!r.optBoolean("ativa", true) || semCondicao(c) || !confere(c, a, agoraS)) continue;
                JSONObject acao = r.getJSONObject("acao");
                File pasta;
                if ("quarentena".equals(acao.optString("tipo"))) pasta = new File(base, QUARENTENA);
                else {
                    File d = new File(acao.optString("destino"));
                    pasta = d.isAbsolute() ? d : new File(base, acao.optString("destino"));
                }
                if (!pasta.equals(a.caminho.getParentFile())) v.put(mov(a.caminho.getPath(), new File(pasta, a.nome).getPath(), "regra: " + r.optString("nome")));
                break;
            }
        }
        return v;
    }

    public static String validar(JSONArray regras) throws JSONException {
        StringBuilder e = new StringBuilder();
        for (int i = 0; i < regras.length(); i++) {
            JSONObject r = regras.getJSONObject(i);
            JSONObject c = r.optJSONObject("condicoes") == null ? new JSONObject() : r.getJSONObject("condicoes");
            if (r.optString("nome").trim().isEmpty()) e.append(r.optString("id")).append(": dê um nome à regra. ");
            if (semCondicao(c)) e.append(r.optString("nome")).append(": escolha pelo menos uma condição. ");
            if (!c.isNull("tamanho_min") && !c.isNull("tamanho_max") && c.optLong("tamanho_min") > c.optLong("tamanho_max")) e.append(r.optString("nome")).append(": o tamanho mínimo é maior que o máximo. ");
            JSONObject acao = r.optJSONObject("acao");
            if (acao != null && "mover".equals(acao.optString("tipo")) && acao.optString("destino").trim().isEmpty()) e.append(r.optString("nome")).append(": informe a pasta de destino. ");
        }
        return e.toString().trim();
    }

    // ---------------------------------------------------------------- limpeza de cache (só do próprio Vindex)
    public static JSONObject limparPastas(List<File> pastas, long idadeMinHoras, long agoraMs, boolean simulacao) throws JSONException {
        long apagados = 0, bytes = 0;
        JSONArray falhas = new JSONArray();
        for (File raiz : pastas) {
            List<File> arquivos = new ArrayList<>();
            coletar(raiz, arquivos);
            for (File f : arquivos) {
                if (agoraMs - f.lastModified() < idadeMinHoras * 3_600_000L) continue;
                long t = f.length();
                if (simulacao || f.delete()) { apagados++; bytes += t; } else falhas.put(f.getPath() + ": em uso");
            }
        }
        return new JSONObject().put("apagados", apagados).put("liberado_bytes", bytes).put("falhas", falhas).put("simulacao", simulacao);
    }

    private static void coletar(File pasta, List<File> saida) {
        File[] filhos = pasta == null ? null : pasta.listFiles();
        if (filhos == null) return;
        for (File f : filhos) {
            if (ehLink(f)) continue;
            if (f.isFile()) saida.add(f);
            else if (f.isDirectory()) coletar(f, saida);
        }
    }

    public static JSONObject resumo(List<Arq> a) throws JSONException {
        TreeMap<String, long[]> por = new TreeMap<>();
        long total = 0;
        for (Arq x : a) {
            long[] c = por.computeIfAbsent(pastaDaCategoria(x.categoria), k -> new long[2]);
            c[0]++;
            c[1] += x.bytes;
            total += x.bytes;
        }
        JSONObject cats = new JSONObject();
        for (Map.Entry<String, long[]> e : por.entrySet()) cats.put(e.getKey(), new JSONArray(Arrays.asList(e.getValue()[0], e.getValue()[1])));
        return new JSONObject().put("arquivos", a.size()).put("bytes", total).put("categorias", cats);
    }

    // ---------------------------------------------------------------- leitura do aparelho (puro, testável)
    /** /proc/meminfo → {MemTotal, MemAvailable, SwapTotal, SwapFree} em bytes (-1 quando não consta). */
    public static long[] lerMeminfo(String texto) {
        long[] r = {-1, -1, -1, -1};
        String[] chaves = {"MemTotal:", "MemAvailable:", "SwapTotal:", "SwapFree:"};
        for (String linha : texto.split("\n")) {
            for (int i = 0; i < chaves.length; i++) {
                if (!linha.startsWith(chaves[i])) continue;
                String[] p = linha.substring(chaves[i].length()).trim().split("\\s+");
                try { r[i] = Long.parseLong(p[0]) * 1024L; } catch (Exception e) { /* linha estranha */ }
            }
        }
        return r;
    }

    /** "2025-09-05" (Build.VERSION.SECURITY_PATCH) → dias de atraso; -1 se não der para ler. */
    public static long diasDoPatch(String patch, long agoraMs) {
        try {
            String[] p = patch.trim().split("-");
            java.util.Calendar c = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
            c.clear();
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            return Math.max(0, (agoraMs - c.getTimeInMillis()) / 86_400_000L);
        } catch (Exception e) {
            return -1;
        }
    }

    private static final List<String> EXECUTAVEIS = Arrays.asList("apk", "exe", "scr", "bat", "cmd", "vbs", "ps1", "jar", "msi", "com", "pif", "lnk", "js", "hta");
    private static final List<String> ISCAS = Arrays.asList("pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "gif", "mp4", "mp3", "txt", "zip", "rar");

    /** {nivel, motivo} para um arquivo que parece golpe; null se parece normal. */
    public static String[] suspeito(String nome, long bytes) {
        String n = nome.toLowerCase(Locale.ROOT);
        String ext = extensao(n);
        if (!EXECUTAVEIS.contains(ext)) return null;
        String semUltima = n.substring(0, n.length() - ext.length() - 1);
        String penultima = extensao(semUltima);
        if (ISCAS.contains(penultima)) return new String[]{"alto", "Extensão dupla (." + penultima + "." + ext + "): finge ser " + penultima.toUpperCase(Locale.ROOT) + " mas é um programa."};
        if (ext.equals("apk")) return new String[]{"medio", "Instalador de app (APK) fora da loja. Só instale se veio do site oficial do app."};
        if (ext.equals("lnk") || ext.equals("hta") || ext.equals("scr") || ext.equals("pif") || ext.equals("vbs") || ext.equals("bat") || ext.equals("cmd") || ext.equals("ps1") || ext.equals("exe") || ext.equals("msi") || ext.equals("com"))
            return new String[]{"medio", "Programa de Windows no celular: não funciona aqui e costuma vir em golpe por e-mail ou WhatsApp."};
        if (ext.equals("js") || ext.equals("jar")) return new String[]{"baixo", "Script/programa: confira de onde veio antes de abrir."};
        return null;
    }

    public static JSONObject verificar(List<Arq> arquivos) throws JSONException {
        JSONArray achados = new JSONArray();
        for (Arq a : arquivos) {
            String[] s = suspeito(a.nome, a.bytes);
            if (s != null) achados.put(new JSONObject().put("caminho", a.caminho.getPath()).put("nivel", s[0]).put("motivo", s[1]));
        }
        return new JSONObject().put("analisados", arquivos.size()).put("achados", achados);
    }

    /** Avalia um app instalado a partir de fatos já levantados. null = nada a apontar. */
    public static String[] riscoDoApp(boolean foraDaLoja, boolean acessibilidade, boolean sobrepoe, boolean lerSms, boolean ouveNotificacoes, boolean admin, boolean depuravel) {
        List<String> motivos = new ArrayList<>();
        if (acessibilidade) motivos.add("usa o serviço de acessibilidade (pode ler a tela e tocar por você)");
        if (sobrepoe) motivos.add("pode desenhar por cima de outros apps");
        if (lerSms) motivos.add("lê e envia SMS");
        if (ouveNotificacoes) motivos.add("lê as suas notificações");
        if (admin) motivos.add("é administrador do aparelho");
        if (depuravel) motivos.add("está em modo de depuração");
        int graves = motivos.size();
        if (graves == 0 && !foraDaLoja) return null;
        if (graves == 0) return new String[]{"baixo", "Instalado fora da loja oficial (APK). Se foi você quem instalou, tudo bem."};
        String texto = "Este app " + String.join("; ", motivos) + (foraDaLoja ? ", e veio de fora da loja oficial." : ".");
        String nivel = foraDaLoja && (acessibilidade || sobrepoe || lerSms || admin) ? "alto" : "medio";
        return new String[]{nivel, texto};
    }
}
