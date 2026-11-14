package tech.vetorial.vindex;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Apps da suíte Vetorial Tech: só instala o que vem das páginas de lançamento do GitHub do Toni,
 * assinado com a mesma chave do Vindex e com o SHA-256 igual ao publicado. O resto passa pela verificação normal.
 */
public final class Suite {
    private Suite() { }

    static final String DONO = "tonysantquees95-code";
    /** pacote, nome, repositório (o da Vênus é privado: o link vem do servidor da Vênus, assinado pelo GitHub e válido por poucos minutos) */
    public static final String[][] APPS = {
        {"tech.vetorial.vindex", "Vindex", "Vindex-"},
        {"tech.vetorial.vortex", "Vortex", "Vortex"},
        {"tech.vetorial.velox", "Velox", "Velox-gaming-search"},
        {"com.tonimarques.sextafeira", "Vênus", "Venus-core"},
    };
    static final String PACOTE_VENUS = "com.tonimarques.sextafeira";

    public static String[] app(String pacote) {
        for (String[] a : APPS) if (a[0].equals(pacote)) return a;
        return null;
    }

    /** Só https://github.com/<dono>/<repositório da suíte>/releases/download/… */
    public static boolean urlPermitida(String pacote, String url) {
        String[] a = app(pacote);
        if (a == null || url == null) return false;
        try {
            java.net.URL u = new java.net.URL(url);
            if (u.getProtocol().equals("https") && PACOTE_VENUS.equals(pacote) && u.getHost().toLowerCase(Locale.ROOT).endsWith(".githubusercontent.com")) return true;
            return u.getProtocol().equals("https")
                && u.getHost().equalsIgnoreCase("github.com")
                && u.getPath().toLowerCase(Locale.ROOT).startsWith(("/" + DONO + "/" + a[2] + "/releases/download/").toLowerCase(Locale.ROOT));
        } catch (Exception e) {
            return false;
        }
    }

    /** Olha um APK solto (por exemplo em Downloads) sem instalar: de quem é, quem assinou e que poderes pede. null = nada a apontar. */
    public static String[] avaliarApk(Context ctx, File apk) {
        PackageManager pm = ctx.getPackageManager();
        int flags = bandeiraDeAssinatura() | PackageManager.GET_PERMISSIONS | PackageManager.GET_SERVICES;
        PackageInfo pi = pm.getPackageArchiveInfo(apk.getPath(), flags);
        if (pi == null) return new String[]{"medio", "O arquivo termina em .apk mas o Android não consegue ler: pode estar corrompido ou disfarçado."};
        try {
            Set<String> minhas = assinaturas(pm.getPackageInfo(ctx.getPackageName(), bandeiraDeAssinatura()));
            Set<String> dele = assinaturas(pi);
            dele.retainAll(minhas);
            if (!dele.isEmpty()) {
                if (app(pi.packageName) != null) return null; // app da suíte, assinado pela Vetorial Tech
                return new String[]{"alto", "Diz ser da Vetorial Tech (" + pi.packageName + ") mas não é um app da suíte, embora tenha a nossa assinatura."};
            }
        } catch (Exception e) { /* segue para o resto */ }
        boolean sobrepoe = false, sms = false, smsEnviar = false, admin = false, acessibilidade = false, ouve = false, instala = false;
        if (pi.requestedPermissions != null) for (String p : pi.requestedPermissions) {
            if ("android.permission.SYSTEM_ALERT_WINDOW".equals(p)) sobrepoe = true;
            if ("android.permission.READ_SMS".equals(p)) sms = true;
            if ("android.permission.SEND_SMS".equals(p)) smsEnviar = true;
            if ("android.permission.BIND_DEVICE_ADMIN".equals(p)) admin = true;
            if ("android.permission.REQUEST_INSTALL_PACKAGES".equals(p)) instala = true;
        }
        if (pi.services != null) for (android.content.pm.ServiceInfo s : pi.services) {
            if ("android.permission.BIND_ACCESSIBILITY_SERVICE".equals(s.permission)) acessibilidade = true;
            if ("android.permission.BIND_NOTIFICATION_LISTENER_SERVICE".equals(s.permission)) ouve = true;
        }
        boolean depuravel = pi.applicationInfo != null && (pi.applicationInfo.flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        String[] r = Motor.riscoDoApp(true, acessibilidade, sobrepoe, sms && smsEnviar, ouve, admin, depuravel);
        String nome = pi.packageName == null ? "app" : pi.packageName;
        if (r == null) return new String[]{"baixo", "APK de fora da loja (" + nome + "). Só instale se você conhece a origem."};
        String extra = instala ? " Também pode instalar outros apps." : "";
        return new String[]{r[0], "APK " + nome + ": " + r[1] + extra};
    }

    public static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    /** SHA-256 de cada certificado de assinatura (inclui o histórico, para trocas de chave). */
    @SuppressWarnings("deprecation")
    static Set<String> assinaturas(PackageInfo pi) {
        Set<String> r = new HashSet<>();
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            Signature[] ss = null;
            if (Build.VERSION.SDK_INT >= 28) {
                SigningInfo si = pi.signingInfo;
                if (si != null) ss = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
            } else {
                ss = pi.signatures;
            }
            if (ss != null) for (Signature s : ss) r.add(hex(md.digest(s.toByteArray())));
        } catch (Exception e) { /* sem leitura: conjunto vazio, nada confere */ }
        return r;
    }

    @SuppressWarnings("deprecation")
    static int bandeiraDeAssinatura() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    /** Confere o APK baixado: é o pacote esperado e a assinatura é a mesma do Vindex. Devolve o motivo da recusa, ou null se está tudo certo. */
    public static String conferir(Context ctx, File apk, String pacote) {
        PackageManager pm = ctx.getPackageManager();
        PackageInfo novo = pm.getPackageArchiveInfo(apk.getPath(), bandeiraDeAssinatura());
        if (novo == null) return "O arquivo baixado não é um APK válido.";
        if (!pacote.equals(novo.packageName)) return "O APK é de outro app (" + novo.packageName + "). Nada foi instalado.";
        try {
            PackageInfo eu = pm.getPackageInfo(ctx.getPackageName(), bandeiraDeAssinatura());
            Set<String> minhas = assinaturas(eu);
            Set<String> dele = assinaturas(novo);
            dele.retainAll(minhas);
            if (dele.isEmpty()) return "A assinatura do APK não é a da Vetorial Tech. Nada foi instalado.";
        } catch (Exception e) {
            return "Não consegui conferir a assinatura do APK.";
        }
        return null;
    }

    public static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[64 * 1024];
            int n;
            while ((n = in.read(b)) > 0) md.update(b, 0, n);
        }
        return hex(md.digest());
    }

    /**
     * Instala pela sessão do instalador. Em atualização de um app que o próprio Vindex instalou antes (Android 12 ou mais novo)
     * o Android não pede confirmação; na primeira instalação sempre pede um toque.
     */
    public static void instalar(Context ctx, File apk, String pacote, String acao) throws Exception {
        PackageInstaller instalador = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        p.setAppPackageName(pacote);
        if (Build.VERSION.SDK_INT >= 31) p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = instalador.createSession(p);
        PackageInstaller.Session s = instalador.openSession(id);
        try {
            try (OutputStream out = s.openWrite("apk", 0, apk.length()); InputStream in = new FileInputStream(apk)) {
                byte[] b = new byte[64 * 1024];
                int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
                s.fsync(out);
            }
            Intent resposta = new Intent(acao).setPackage(ctx.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pend = PendingIntent.getBroadcast(ctx, id, resposta, flags);
            s.commit(pend.getIntentSender());
        } catch (Exception e) {
            s.abandon();
            throw e;
        } finally {
            s.close();
        }
    }
}
