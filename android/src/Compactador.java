package tech.vetorial.vindex;

import com.github.junrar.Archive;
import com.github.junrar.rarfile.FileHeader;

import org.apache.commons.compress.archivers.sevenz.SevenZArchiveEntry;
import org.apache.commons.compress.archivers.sevenz.SevenZFile;
import org.apache.commons.compress.archivers.sevenz.SevenZOutputFile;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream;
import org.apache.commons.compress.archivers.zip.ZipFile;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;

/** Descompactar e compactar dentro do Vindex (como o WinRAR): ZIP, 7z, RAR, TAR, TAR.GZ/BZ2/XZ, GZ, BZ2 e XZ; cria ZIP, 7z e TAR.GZ. */
public final class Compactador {
    private Compactador() { }

    // progresso que a tela consulta enquanto o trabalho roda
    public static volatile String fase = "";
    public static volatile String atual = "";
    public static volatile long feitos = 0, total = 0;
    public static volatile boolean cancelar = false;

    public static JSONObject progresso() throws Exception {
        return new JSONObject().put("fase", fase).put("atual", atual).put("feitos", feitos).put("total", total);
    }

    private static final int BUF = 1 << 20;

    public static String formato(String nome) {
        String n = nome.toLowerCase(Locale.ROOT);
        if (n.endsWith(".tar.gz") || n.endsWith(".tgz")) return "tgz";
        if (n.endsWith(".tar.bz2") || n.endsWith(".tbz2") || n.endsWith(".tbz")) return "tbz2";
        if (n.endsWith(".tar.xz") || n.endsWith(".txz")) return "txz";
        if (n.endsWith(".zip") || n.endsWith(".jar") || n.endsWith(".cbz") || n.endsWith(".apk")) return "zip";
        if (n.endsWith(".7z")) return "7z";
        if (n.endsWith(".rar") || n.endsWith(".cbr")) return "rar";
        if (n.endsWith(".tar")) return "tar";
        if (n.endsWith(".gz")) return "gz";
        if (n.endsWith(".bz2")) return "bz2";
        if (n.endsWith(".xz")) return "xz";
        return "";
    }

    static String semExtensao(String nome) {
        String n = nome;
        String l = n.toLowerCase(Locale.ROOT);
        for (String e : new String[]{".tar.gz", ".tar.bz2", ".tar.xz", ".tgz", ".tbz2", ".tbz", ".txz"}) if (l.endsWith(e)) return n.substring(0, n.length() - e.length());
        int p = n.lastIndexOf('.');
        return p > 0 ? n.substring(0, p) : n;
    }

    /** Conta bytes lidos do arquivo compactado (progresso dos formatos em fluxo). */
    private static final class Contador extends FilterInputStream {
        Contador(InputStream in) { super(in); }
        @Override public int read() throws IOException { int b = super.read(); if (b >= 0) feitos++; return b; }
        @Override public int read(byte[] b, int o, int l) throws IOException { int n = super.read(b, o, l); if (n > 0) feitos += n; return n; }
    }

    static File unico(File f) {
        if (!f.exists()) return f;
        String n = f.getName();
        int p = n.lastIndexOf('.');
        String stem = p > 0 ? n.substring(0, p) : n, ext = p > 0 ? n.substring(p) : "";
        for (int i = 1; ; i++) { File c = new File(f.getParentFile(), stem + " (" + i + ")" + ext); if (!c.exists()) return c; }
    }

    private static String msgDe(Throwable e) {
        String m = e.getMessage();
        String t = e.getClass().getSimpleName();
        if (t.contains("V5")) return "Este RAR é da versão 5, que ainda não consigo abrir.";
        if (t.contains("Password") || (m != null && m.toLowerCase(Locale.ROOT).contains("password"))) return "O arquivo tem senha. Informe a senha e tente de novo.";
        if (t.contains("UnsupportedZipFeature") || t.contains("Encrypted")) return "Este ZIP é protegido por senha de um tipo que ainda não consigo abrir.";
        if (e instanceof OutOfMemoryError) return "Faltou memória para abrir este arquivo.";
        if (e instanceof java.io.EOFException || (m != null && m.toLowerCase(Locale.ROOT).contains("unexpected end"))) return "O arquivo está incompleto ou vazio. O download provavelmente não terminou: baixe de novo.";
        return m == null || m.isEmpty() ? t : m;
    }

    // ---- listar ----

    public static JSONObject listar(File f, String senha) throws Exception {
        String fmt = formato(f.getName());
        if (fmt.isEmpty()) throw new Exception("Não conheço este formato de arquivo.");
        if (f.length() == 0) throw new Exception("O arquivo está vazio (0 B). O download não terminou: baixe de novo.");
        List<String> nomes = new ArrayList<String>();
        final List<Long> tams = new ArrayList<Long>();
        long[] soma = new long[2]; // itens, bytes
        try {
            switch (fmt) {
                case "zip": {
                    try (ZipFile z = new ZipFile(f)) {
                        Enumeration<ZipArchiveEntry> en = z.getEntries();
                        while (en.hasMoreElements()) { ZipArchiveEntry e = en.nextElement(); if (!e.isDirectory()) { soma[0]++; soma[1] += Math.max(0, e.getSize()); if (nomes.size() < 5000) { nomes.add(e.getName()); tams.add(Math.max(0, e.getSize())); } } }
                    }
                    break;
                }
                case "7z": {
                    try (SevenZFile s = senha == null || senha.isEmpty() ? new SevenZFile(f) : new SevenZFile(f, senha.toCharArray())) {
                        for (SevenZArchiveEntry e : s.getEntries()) { if (!e.isDirectory()) { soma[0]++; soma[1] += Math.max(0, e.getSize()); if (nomes.size() < 5000) { nomes.add(e.getName()); tams.add(Math.max(0, e.getSize())); } } }
                    }
                    break;
                }
                case "rar": {
                    boolean ok = false;
                    Throwable erroAntigo = null;
                    try (Archive a = senha == null || senha.isEmpty() ? new Archive(f) : new Archive(f, senha)) {
                        for (FileHeader h : a.getFileHeaders()) { if (!h.isDirectory()) { soma[0]++; soma[1] += Math.max(0, h.getFullUnpackSize()); if (nomes.size() < 5000) { nomes.add(h.getFileName().replace('\\', '/')); tams.add(Math.max(0, h.getFullUnpackSize())); } } }
                        ok = true;
                    } catch (Throwable t) { erroAntigo = t; }
                    if (!ok) { // RAR 5 e outros que o leitor antigo não abre: motor do 7-Zip
                        soma[0] = 0; soma[1] = 0; nomes.clear(); tams.clear();
                        try {
                            Rar7z.percorrer(f, senha, new Rar7z.Item() {
                                public void item(String nome, boolean pasta, long tam, net.sf.sevenzipjbinding.simple.ISimpleInArchiveItem it) {
                                    if (!pasta) { soma[0]++; soma[1] += Math.max(0, tam); if (nomes.size() < 5000) { nomes.add(nome.replace('\\', '/')); tams.add(Math.max(0, tam)); } }
                                }
                            });
                        } catch (Throwable t2) { throw (t2 instanceof UnsatisfiedLinkError || t2 instanceof NoClassDefFoundError) && erroAntigo != null ? erroAntigo : t2; }
                    }
                    break;
                }
                case "gz": case "bz2": case "xz": {
                    soma[0] = 1; soma[1] = f.length();
                    nomes.add(semExtensao(f.getName())); tams.add(f.length());
                    break;
                }
                default: { // tar e tar.*
                    try (TarArchiveInputStream t = new TarArchiveInputStream(abrirTar(f, fmt, false))) {
                        TarArchiveEntry e;
                        while ((e = t.getNextEntry()) != null) { if (!e.isDirectory()) { soma[0]++; soma[1] += Math.max(0, e.getSize()); if (nomes.size() < 5000) { nomes.add(e.getName()); tams.add(Math.max(0, e.getSize())); } } }
                    }
                }
            }
        } catch (Throwable e) { throw new Exception(msgDe(e)); }
        JSONArray n = new JSONArray();
        for (String s : nomes) n.put(s);
        JSONArray tm = new JSONArray();
        for (Long t : tams) tm.put(t.longValue());
        return new JSONObject().put("itens", soma[0]).put("bytes", soma[1]).put("nomes", n).put("tamanhos", tm).put("formato", fmt);
    }

    private static InputStream abrirTar(File f, String fmt, boolean contar) throws IOException {
        InputStream base = new BufferedInputStream(new FileInputStream(f), BUF);
        if (contar) base = new Contador(base);
        switch (fmt) {
            case "tgz": return new BufferedInputStream(new GzipCompressorInputStream(base), BUF);
            case "tbz2": return new BufferedInputStream(new BZip2CompressorInputStream(base), BUF);
            case "txz": return new BufferedInputStream(new XZCompressorInputStream(base), BUF);
            default: return base;
        }
    }

    // ---- extrair ----

    /** Devolve o caminho seguro dentro do destino, ou null se tenta sair dele (zip-slip). */
    private static File alvoSeguro(File destino, String nome) throws IOException {
        String n = nome.replace('\\', '/');
        while (n.startsWith("/")) n = n.substring(1);
        if (n.isEmpty()) return null;
        File alvo = new File(destino, n);
        String base = destino.getCanonicalPath() + File.separator;
        return alvo.getCanonicalPath().startsWith(base) ? alvo : null;
    }

    private static void gravar(InputStream in, File alvo) throws IOException {
        File pai = alvo.getParentFile();
        if (pai != null) pai.mkdirs();
        byte[] b = new byte[BUF];
        try (OutputStream out = new FileOutputStream(alvo)) {
            int n;
            while ((n = in.read(b)) > 0) {
                if (cancelar) throw new IOException("Cancelado.");
                out.write(b, 0, n);
            }
        }
    }

    /** Nomes marcados para extrair (null = tudo). Vale só durante uma extração. */
    private static volatile java.util.Set<String> filtro = null;

    private static boolean quer(String nome) {
        java.util.Set<String> f = filtro;
        return f == null || f.contains(nome.replace('\\', '/'));
    }

    public static JSONObject extrair(File f, File destino, String senha) throws Exception {
        return extrair(f, destino, senha, null);
    }

    public static JSONObject extrair(File f, File destino, String senha, java.util.Set<String> so) throws Exception {
        filtro = so;
        try { return extrairTudo(f, destino, senha); } finally { filtro = null; }
    }

    private static JSONObject extrairTudo(File f, File destino, String senha) throws Exception {
        String fmt = formato(f.getName());
        if (fmt.isEmpty()) throw new Exception("Não conheço este formato de arquivo.");
        cancelar = false; fase = "extraindo"; atual = f.getName(); feitos = 0; total = 0;
        destino.mkdirs();
        if (!destino.isDirectory()) throw new Exception("Não consegui criar a pasta de destino.");
        List<File> criados = new ArrayList<File>();
        List<String> pulados = new ArrayList<String>();
        long[] cont = new long[2]; // arquivos, bytes
        try {
            switch (fmt) {
                case "zip": {
                    try (ZipFile z = new ZipFile(f)) {
                        Enumeration<ZipArchiveEntry> en = z.getEntries();
                        List<ZipArchiveEntry> lista = new ArrayList<ZipArchiveEntry>();
                        while (en.hasMoreElements()) { ZipArchiveEntry e = en.nextElement(); lista.add(e); if (!e.isDirectory()) total += Math.max(0, e.getSize()); }
                        for (ZipArchiveEntry e : lista) {
                            File alvo = alvoSeguro(destino, e.getName());
                            if (!quer(e.getName())) continue;
                            if (alvo == null) { pulados.add(e.getName()); continue; }
                            if (e.isDirectory()) { alvo.mkdirs(); continue; }
                            if (!z.canReadEntryData(e)) throw new Exception("Este ZIP é protegido por senha ou usa um recurso que ainda não consigo abrir.");
                            alvo = unico(alvo); criados.add(alvo); atual = e.getName();
                            try (InputStream in = z.getInputStream(e)) { gravar(new Contador(in), alvo); }
                            cont[0]++; cont[1] += alvo.length();
                        }
                    }
                    break;
                }
                case "7z": {
                    try (SevenZFile s = senha == null || senha.isEmpty() ? new SevenZFile(f) : new SevenZFile(f, senha.toCharArray())) {
                        for (SevenZArchiveEntry e : s.getEntries()) if (!e.isDirectory()) total += Math.max(0, e.getSize());
                        SevenZArchiveEntry e;
                        byte[] b = new byte[BUF];
                        while ((e = s.getNextEntry()) != null) {
                            File alvo = alvoSeguro(destino, e.getName());
                            if (!quer(e.getName())) continue;
                            if (alvo == null) { pulados.add(e.getName()); continue; }
                            if (e.isDirectory()) { alvo.mkdirs(); continue; }
                            alvo = unico(alvo); criados.add(alvo); atual = e.getName();
                            File pai = alvo.getParentFile();
                            if (pai != null) pai.mkdirs();
                            try (OutputStream out = new FileOutputStream(alvo)) {
                                int n;
                                while ((n = s.read(b)) > 0) { if (cancelar) throw new IOException("Cancelado."); out.write(b, 0, n); feitos += n; }
                            }
                            cont[0]++; cont[1] += alvo.length();
                        }
                    }
                    break;
                }
                case "rar": {
                    boolean feito = false;
                    Throwable erroAntigo = null;
                    long feitosAntes = feitos; int criadosAntes = criados.size();
                    try (Archive a = senha == null || senha.isEmpty() ? new Archive(f) : new Archive(f, senha)) {
                        List<FileHeader> hs = a.getFileHeaders();
                        for (FileHeader h : hs) if (!h.isDirectory()) total += Math.max(0, h.getFullUnpackSize());
                        for (FileHeader h : hs) {
                            String nome = h.getFileName().replace('\\', '/');
                            File alvo = alvoSeguro(destino, nome);
                            if (!quer(nome)) continue;
                            if (alvo == null) { pulados.add(nome); continue; }
                            if (h.isDirectory()) { alvo.mkdirs(); continue; }
                            alvo = unico(alvo); criados.add(alvo); atual = nome;
                            File pai = alvo.getParentFile();
                            if (pai != null) pai.mkdirs();
                            try (OutputStream out = new FileOutputStream(alvo)) { a.extractFile(h, out); }
                            feitos += Math.max(0, h.getFullUnpackSize());
                            cont[0]++; cont[1] += alvo.length();
                            if (cancelar) throw new IOException("Cancelado.");
                        }
                        feito = true;
                    } catch (Throwable t) {
                        if (t instanceof IOException && "Cancelado.".equals(t.getMessage())) throw t;
                        erroAntigo = t;
                    }
                    if (!feito) { // RAR 5 e outros: refaz com o motor do 7-Zip
                        for (int k = criados.size() - 1; k >= criadosAntes; k--) { criados.get(k).delete(); criados.remove(k); }
                        cont[0] = 0; cont[1] = 0; feitos = feitosAntes; total = 0;
                        final long[] tot = new long[1];
                        try {
                            Rar7z.percorrer(f, senha, new Rar7z.Item() {
                                public void item(String nome, boolean pasta, long tam, net.sf.sevenzipjbinding.simple.ISimpleInArchiveItem it) { if (!pasta) tot[0] += Math.max(0, tam); }
                            });
                            total = tot[0];
                            final File dest = destino; final String sn = senha;
                            Rar7z.percorrer(f, senha, new Rar7z.Item() {
                                public void item(String nomeBruto, boolean pasta, long tam, net.sf.sevenzipjbinding.simple.ISimpleInArchiveItem it) throws Exception {
                                    String nome = nomeBruto.replace('\\', '/');
                                    File alvo = alvoSeguro(dest, nome);
                                    if (!quer(nome)) return;
                                    if (alvo == null) { pulados.add(nome); return; }
                                    if (pasta) { alvo.mkdirs(); return; }
                                    alvo = unico(alvo); criados.add(alvo); atual = nome;
                                    File pai = alvo.getParentFile();
                                    if (pai != null) pai.mkdirs();
                                    Rar7z.extrair(it, alvo, sn);
                                    cont[0]++; cont[1] += alvo.length();
                                }
                            });
                        } catch (Throwable t2) { throw (t2 instanceof UnsatisfiedLinkError || t2 instanceof NoClassDefFoundError) && erroAntigo != null ? erroAntigo : t2; }
                    }
                    break;
                }
                case "gz": case "bz2": case "xz": {
                    total = f.length();
                    InputStream base = new BufferedInputStream(new Contador(new FileInputStream(f)), BUF);
                    InputStream in = fmt.equals("gz") ? new GzipCompressorInputStream(base) : fmt.equals("bz2") ? new BZip2CompressorInputStream(base) : new XZCompressorInputStream(base);
                    try {
                        File alvo = unico(new File(destino, semExtensao(f.getName())));
                        criados.add(alvo);
                        gravar(in, alvo);
                        cont[0] = 1; cont[1] = alvo.length();
                    } finally { in.close(); }
                    break;
                }
                default: { // tar e tar.*
                    total = f.length();
                    try (TarArchiveInputStream t = new TarArchiveInputStream(abrirTar(f, fmt, true))) {
                        TarArchiveEntry e;
                        while ((e = t.getNextEntry()) != null) {
                            File alvo = alvoSeguro(destino, e.getName());
                            if (!quer(e.getName())) continue;
                            if (alvo == null) { pulados.add(e.getName()); continue; }
                            if (e.isDirectory()) { alvo.mkdirs(); continue; }
                            if (!e.isFile()) continue; // links e arquivos especiais ficam de fora
                            alvo = unico(alvo); criados.add(alvo); atual = e.getName();
                            gravar(t, alvo);
                            cont[0]++; cont[1] += alvo.length();
                        }
                    }
                }
            }
        } catch (Throwable e) {
            for (File c : criados) c.delete(); // não deixa arquivo pela metade
            fase = "";
            throw new Exception(msgDe(e));
        }
        fase = "";
        JSONArray p = new JSONArray();
        for (String s : pulados) p.put(s);
        return new JSONObject().put("destino", destino.getPath()).put("arquivos", cont[0]).put("bytes", cont[1]).put("pulados", p);
    }

    // ---- compactar ----

    private static void juntar(File f, String nome, List<File> arqs, List<String> nomes) {
        if (f.isDirectory()) {
            nomes.add(nome + "/"); arqs.add(f);
            File[] fs = f.listFiles();
            if (fs != null) for (File c : fs) juntar(c, nome + "/" + c.getName(), arqs, nomes);
        } else { arqs.add(f); nomes.add(nome); }
    }

    /** formato: "zip", "7z" ou "tgz". destino: arquivo a criar (ganha "(1)" se já existir). */
    public static JSONObject compactar(List<File> origens, File destino, String fmt) throws Exception {
        cancelar = false; fase = "compactando"; feitos = 0; total = 0; atual = destino.getName();
        List<File> arqs = new ArrayList<File>();
        List<String> nomes = new ArrayList<String>();
        for (File o : origens) juntar(o, o.getName(), arqs, nomes);
        for (File a : arqs) if (a.isFile()) total += a.length();
        File alvo = unico(destino);
        File pai = alvo.getParentFile();
        if (pai != null) pai.mkdirs();
        byte[] b = new byte[BUF];
        int n = 0;
        try {
            if (fmt.equals("zip")) {
                try (ZipArchiveOutputStream z = new ZipArchiveOutputStream(alvo)) {
                    z.setLevel(6);
                    for (int i = 0; i < arqs.size(); i++) {
                        File a = arqs.get(i);
                        z.putArchiveEntry(new ZipArchiveEntry(a, nomes.get(i)));
                        if (a.isFile()) { try (InputStream in = new FileInputStream(a)) { int r; while ((r = in.read(b)) > 0) { if (cancelar) throw new IOException("Cancelado."); z.write(b, 0, r); feitos += r; } } n++; }
                        z.closeArchiveEntry();
                    }
                    z.finish();
                }
            } else if (fmt.equals("7z")) {
                try (SevenZOutputFile s = new SevenZOutputFile(alvo)) {
                    for (int i = 0; i < arqs.size(); i++) {
                        File a = arqs.get(i);
                        s.putArchiveEntry(s.createArchiveEntry(a, nomes.get(i)));
                        if (a.isFile()) { try (InputStream in = new FileInputStream(a)) { int r; while ((r = in.read(b)) > 0) { if (cancelar) throw new IOException("Cancelado."); s.write(b, 0, r); feitos += r; } } n++; }
                        s.closeArchiveEntry();
                    }
                    s.finish();
                }
            } else if (fmt.equals("tgz")) {
                try (TarArchiveOutputStream t = new TarArchiveOutputStream(new GzipCompressorOutputStream(new java.io.BufferedOutputStream(new FileOutputStream(alvo), BUF)))) {
                    t.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
                    t.setBigNumberMode(TarArchiveOutputStream.BIGNUMBER_POSIX);
                    for (int i = 0; i < arqs.size(); i++) {
                        File a = arqs.get(i);
                        t.putArchiveEntry(new TarArchiveEntry(a, nomes.get(i)));
                        if (a.isFile()) { try (InputStream in = new FileInputStream(a)) { int r; while ((r = in.read(b)) > 0) { if (cancelar) throw new IOException("Cancelado."); t.write(b, 0, r); feitos += r; } } n++; }
                        t.closeArchiveEntry();
                    }
                    t.finish();
                }
            } else throw new Exception("Formato para criar não suportado: " + fmt);
        } catch (Throwable e) {
            alvo.delete();
            fase = "";
            throw new Exception(msgDe(e));
        }
        fase = "";
        return new JSONObject().put("destino", alvo.getPath()).put("arquivos", n).put("bytes", alvo.length());
    }
}
