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
            if (!de.isFile()) { falhas.put(de.getPath() + ": não existe mais"); continue; }
            File final_ = nomeLivre(pasta, para.getName());
            if (simulacao) { movidos.put(mov(de.getPath(), final_.getPath(), m.optString("motivo"))); continue; }
            try {
                if (!pasta.isDirectory() && !pasta.mkdirs()) throw new IOException("não consegui criar a pasta");
                Files.move(de.toPath(), final_.toPath(), StandardCopyOption.ATOMIC_MOVE);
                movidos.put(mov(de.getPath(), final_.getPath(), m.optString("motivo")));
            } catch (IOException | UnsupportedOperationException e1) {
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
}
