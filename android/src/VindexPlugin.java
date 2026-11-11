package tech.vetorial.vindex;

import android.app.ActivityManager;
import android.app.AlertDialog;
import android.app.AppOpsManager;
import android.app.KeyguardManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.TrafficStats;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.content.Context;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Debug;
import android.os.Environment;
import android.os.Process;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Ponte do Android: recebe {comando, args} da interface e responde com o mesmo JSON do motor em Rust. */
@CapacitorPlugin(name = "Vindex")
public class VindexPlugin extends Plugin {

    @PluginMethod
    public void motor(final PluginCall call) {
        final String comando = call.getString("comando", "");
        final String args = call.getString("args", "{}");
        getBridge().execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Object r = executar(comando, new JSONObject(args));
                    JSObject saida = new JSObject();
                    saida.put("resultado", String.valueOf(r));
                    call.resolve(saida);
                } catch (Exception e) {
                    call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void escolherPasta(final PluginCall call) {
        if (!temAcessoATudo()) {
            pedirAcessoATudo();
            call.reject("Libere “Acesso a todos os arquivos” para o Vindex nas configurações que abriram e tente de novo.");
            return;
        }
        final String[] nomes = {"Downloads", "Documentos", "Fotos (DCIM)", "Imagens", "Vídeos", "Músicas"};
        final String[] tipos = {Environment.DIRECTORY_DOWNLOADS, Environment.DIRECTORY_DOCUMENTS, Environment.DIRECTORY_DCIM, Environment.DIRECTORY_PICTURES, Environment.DIRECTORY_MOVIES, Environment.DIRECTORY_MUSIC};
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                new AlertDialog.Builder(getActivity()).setTitle("Escolher pasta").setItems(nomes, (d, i) -> {
                    JSObject r = new JSObject();
                    r.put("pasta", Environment.getExternalStoragePublicDirectory(tipos[i]).getAbsolutePath());
                    call.resolve(r);
                }).setOnCancelListener(d -> {
                    JSObject r = new JSObject();
                    r.put("pasta", JSObject.NULL);
                    call.resolve(r);
                }).show();
            }
        });
    }

    // ------------------------------------------------------------ permissões (tela de boas-vindas do app)
    @PluginMethod
    public void permissoes(final PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("lista", new JSONArray()
                    .put(new JSONObject().put("id", "arquivos").put("rotulo", "Acesso a todos os arquivos")
                            .put("motivo", "Para ler, organizar e limpar Downloads, Documentos e Fotos. Sem isto o Vindex não enxerga as suas pastas.")
                            .put("obrigatoria", true).put("concedida", temAcessoATudo()))
                    .put(new JSONObject().put("id", "uso").put("rotulo", "Acesso ao uso de apps")
                            .put("motivo", "Para mostrar quais apps mais usam o aparelho e deixar o Vindex ajudar a otimizar. Só lê o tempo de uso, nunca o conteúdo.")
                            .put("obrigatoria", false).put("concedida", temUso()))
                    .put(new JSONObject().put("id", "instalar").put("rotulo", "Instalar atualizações")
                            .put("motivo", "Para o Vindex baixar a versão nova dele mesmo e abrir a instalação, sem você procurar o arquivo.")
                            .put("obrigatoria", false).put("concedida", podeInstalar())));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    /** Abre a tela do Android onde a pessoa libera a permissão (o Android não deixa um app se liberar sozinho). */
    @PluginMethod
    public void pedirPermissao(final PluginCall call) {
        String id = call.getString("id", "");
        if ("arquivos".equals(id)) pedirAcessoATudo();
        else if ("instalar".equals(id)) abrirTela(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())), new Intent(Settings.ACTION_SECURITY_SETTINGS));
        else if ("uso".equals(id)) abrirTela(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())), new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        else { call.reject("Permissão desconhecida."); return; }
        call.resolve();
    }

    /** Atalhos para configurações do sistema que o Vindex recomenda (Play Protect, bloqueio de tela, acessibilidade…). */
    @PluginMethod
    public void abrirConfiguracao(final PluginCall call) {
        String id = call.getString("id", "");
        Intent geral = new Intent(Settings.ACTION_SETTINGS);
        if ("playprotect".equals(id)) {
            Intent gp = new Intent();
            gp.setClassName("com.google.android.gms", "com.google.android.gms.security.settings.VerifyAppsSettingsActivity");
            abrirTela(gp, new Intent(Settings.ACTION_SECURITY_SETTINGS), geral);
        } else if ("bloqueio".equals(id)) abrirTela(new Intent(Settings.ACTION_SECURITY_SETTINGS), geral);
        else if ("acessibilidade".equals(id)) abrirTela(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS), geral);
        else if ("desenvolvedor".equals(id)) abrirTela(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS), geral);
        else if ("atualizacao".equals(id)) abrirTela(new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS), geral);
        else if (id.startsWith("app:") && id.substring(4).matches("[A-Za-z0-9._]{1,200}")) abrirTela(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + id.substring(4))), geral);
        else { call.reject("Configuração desconhecida."); return; }
        call.resolve();
    }

    private void abrirTela(Intent... opcoes) {
        for (Intent i : opcoes) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                return;
            } catch (Exception e) { /* tenta a próxima */ }
        }
    }

    private boolean temUso() {
        try {
            AppOpsManager ao = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            int modo = ao.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
            return modo == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------ atualização do próprio Vindex
    private static final String ACAO_INSTALAR = "tech.vetorial.vindex.INSTALAR";
    private BroadcastReceiver instalador;

    @Override
    public void load() {
        instalador = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent i) {
                int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirmar = (Intent) i.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirmar != null) {
                        confirmar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        try { ctx.startActivity(confirmar); } catch (Exception e) { /* sem tela de confirmação */ }
                    }
                }
            }
        };
        IntentFilter f = new IntentFilter(ACAO_INSTALAR);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(instalador, f, Context.RECEIVER_EXPORTED);
        else getContext().registerReceiver(instalador, f);
    }

    private boolean podeInstalar() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** Baixa o APK novo (só de endereços do GitHub), confere o SHA-256 e abre a confirmação de instalação do Android. */
    @PluginMethod
    public void instalarAtualizacao(final PluginCall call) {
        final String url = call.getString("url", "");
        final String sha = call.getString("sha256", "");
        final boolean https = url.startsWith("https://");
        String host = "";
        try { host = new java.net.URL(url).getHost().toLowerCase(java.util.Locale.ROOT); } catch (Exception e) { /* url inválida */ }
        if (!https || !(host.equals("github.com") || host.endsWith(".githubusercontent.com") || host.endsWith(".github.com"))) {
            call.reject("Endereço de atualização não permitido.");
            return;
        }
        if (!podeInstalar()) {
            pedirTela("instalar");
            call.reject("Libere “Instalar apps desconhecidos” para o Vindex na tela que abriu e toque em Atualizar de novo.");
            return;
        }
        getBridge().execute(new Runnable() {
            @Override
            public void run() {
                try {
                    File apk = new File(getContext().getCacheDir(), "vindex-atualizacao.apk");
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setConnectTimeout(20_000);
                    c.setReadTimeout(60_000);
                    if (c.getResponseCode() != 200) throw new Exception("O download falhou (" + c.getResponseCode() + ").");
                    java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                    java.io.InputStream in = c.getInputStream();
                    java.io.FileOutputStream out = new java.io.FileOutputStream(apk);
                    try {
                        byte[] b = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(b)) > 0) { out.write(b, 0, n); md.update(b, 0, n); }
                    } finally { out.close(); in.close(); c.disconnect(); }
                    StringBuilder hex = new StringBuilder();
                    for (byte x : md.digest()) hex.append(String.format("%02x", x));
                    if (!sha.isEmpty() && !sha.equalsIgnoreCase(hex.toString())) { apk.delete(); throw new Exception("O arquivo baixado não confere com o publicado. Nada foi instalado."); }

                    PackageInstaller pi = getContext().getPackageManager().getPackageInstaller();
                    int id = pi.createSession(new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL));
                    PackageInstaller.Session ses = pi.openSession(id);
                    try {
                        java.io.OutputStream so = ses.openWrite("vindex.apk", 0, apk.length());
                        java.io.InputStream si = new java.io.FileInputStream(apk);
                        try {
                            byte[] b = new byte[64 * 1024];
                            int n;
                            while ((n = si.read(b)) > 0) so.write(b, 0, n);
                            ses.fsync(so);
                        } finally { si.close(); so.close(); }
                        Intent it = new Intent(ACAO_INSTALAR).setPackage(getContext().getPackageName());
                        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                        ses.commit(PendingIntent.getBroadcast(getContext(), id, it, flags).getIntentSender());
                    } finally { ses.close(); }
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
                }
            }
        });
    }

    private void pedirTela(String id) {
        if ("instalar".equals(id)) abrirTela(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())), new Intent(Settings.ACTION_SECURITY_SETTINGS));
    }

    // ------------------------------------------------------------ permissão de arquivos
    private boolean temAcessoATudo() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager();
    }

    private void pedirAcessoATudo() {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
    }

    // ------------------------------------------------------------ comandos
    private List<File> raizes(JSONObject a) throws JSONException {
        JSONArray r = a.optJSONArray("raizes");
        if (r == null || r.length() == 0) throw new JSONException("Escolha pelo menos uma pasta.");
        if (!temAcessoATudo()) {
            pedirAcessoATudo();
            throw new JSONException("Libere “Acesso a todos os arquivos” para o Vindex e tente de novo.");
        }
        List<File> v = new ArrayList<>();
        for (int i = 0; i < r.length(); i++) {
            File f = new File(r.getString(i));
            if (!f.isDirectory()) throw new JSONException("A pasta não existe: " + f.getPath());
            if (f.getParentFile() == null) throw new JSONException("Escolha uma pasta, não a raiz do armazenamento: " + f.getPath());
            v.add(f);
        }
        return v;
    }

    private Object executar(String comando, JSONObject a) throws Exception {
        long agora = System.currentTimeMillis();
        int prof = a.optInt("profundidade", 6);
        switch (comando) {
            case "diagnostico":
                return diagnostico();
            case "otimizar_tudo":
                return otimizarTudo(a.optBoolean("simulacao", false));
            case "alvos_limpeza": {
                JSONArray lista = new JSONArray();
                for (String[] t : alvosDeLimpeza()) lista.put(new JSONObject().put("id", t[0]).put("rotulo", t[1]).put("pasta", t[2]));
                return lista;
            }
            case "planejar_limpeza":
            case "executar_limpeza": {
                boolean exec = "executar_limpeza".equals(comando);
                boolean sim = !exec || a.optBoolean("simulacao", false);
                JSONArray ids = a.optJSONArray("alvos");
                long apagados = 0, total = 0;
                JSONArray porAlvo = new JSONArray(), falhas = new JSONArray();
                for (String[] t : alvosDeLimpeza()) {
                    if (ids != null && ids.length() > 0 && !contemId(ids, t[0])) continue;
                    List<File> pastas = new ArrayList<>();
                    pastas.add(new File(t[2]));
                    JSONObject r = Motor.limparPastas(pastas, 1, agora, sim);
                    apagados += r.getLong("apagados");
                    total += r.getLong("liberado_bytes");
                    porAlvo.put(new JSONArray().put(t[0]).put(r.getLong("liberado_bytes")));
                    JSONArray f = r.getJSONArray("falhas");
                    for (int i = 0; i < f.length(); i++) falhas.put(f.getString(i));
                }
                if (!exec) return new JSONObject().put("total_bytes", total).put("arquivos", apagados).put("por_alvo", porAlvo);
                return new JSONObject().put("apagados", apagados).put("liberado_bytes", total).put("falhas", falhas).put("simulacao", sim);
            }
            case "otimizar_memoria":
                return liberarMemoria();
            case "estado_protecao":
                return estadoProtecao();
            case "verificar_apps":
                return verificarApps();
            case "verificar_arquivos":
                return Motor.verificar(Motor.varrer(raizes(a), 4));
            case "varrer":
                return Motor.resumo(Motor.varrer(raizes(a), prof));
            case "duplicados":
                return Motor.duplicados(Motor.varrer(raizes(a), prof), a.optLong("min_bytes", 1024));
            case "gigantes":
                return Motor.gigantes(Motor.varrer(raizes(a), prof), a.optLong("min_bytes", 200L * 1024 * 1024), a.optLong("parado_dias", 90), agora / 1000);
            case "organizar_categorias": {
                List<File> r = raizes(a);
                return Motor.aplicar(Motor.planoPorCategoria(Motor.varrer(r, 1), r.get(0)), a.optBoolean("simulacao", true));
            }
            case "aplicar_regras": {
                List<File> r = raizes(a);
                JSONArray regras = a.optJSONArray("regras") == null ? new JSONArray() : a.getJSONArray("regras");
                String erros = Motor.validar(regras);
                if (!erros.isEmpty()) throw new JSONException(erros);
                JSONArray movs = Motor.avaliar(regras, Motor.varrer(r, a.optInt("profundidade", 3)), r.get(0), agora / 1000);
                return Motor.aplicar(movs, a.optBoolean("simulacao", true));
            }
            case "duplicados_para_quarentena": {
                File manter = new File(a.getString("manter"));
                JSONArray grupos = Motor.duplicados(Motor.varrer(raizes(a), prof), 1);
                for (int i = 0; i < grupos.length(); i++) {
                    JSONArray c = grupos.getJSONObject(i).getJSONArray("caminhos");
                    for (int j = 0; j < c.length(); j++) {
                        if (new File(c.getString(j)).equals(manter)) return Motor.aplicar(Motor.quarentenaDeDuplicados(c, manter), a.optBoolean("simulacao", false));
                    }
                }
                throw new JSONException("Esse arquivo não tem mais cópias.");
            }
            case "desfazer":
                return Motor.desfazer(a.optJSONArray("movidos") == null ? new JSONArray() : a.getJSONArray("movidos"));
            default:
                throw new JSONException("Comando desconhecido: " + comando);
        }
    }

    // ------------------------------------------------------------ hardware
    private double percentualDoSistema() {
        // Android 8+ bloqueia /proc/stat para apps comuns; sem leitura, mede só o próprio Vindex.
        try {
            long[] a = lerStat();
            Thread.sleep(300);
            long[] b = lerStat();
            long total = b[0] - a[0];
            return total <= 0 ? 0 : 100.0 * (total - (b[1] - a[1])) / total;
        } catch (Exception e) {
            try {
                long t0 = Process.getElapsedCpuTime();
                long w0 = SystemClock.elapsedRealtime();
                Thread.sleep(300);
                long dt = SystemClock.elapsedRealtime() - w0;
                int nucleos = Math.max(1, Runtime.getRuntime().availableProcessors());
                return dt <= 0 ? 0 : Math.min(100.0, 100.0 * (Process.getElapsedCpuTime() - t0) / (dt * nucleos));
            } catch (InterruptedException ie) {
                return 0;
            }
        }
    }

    private long[] lerStat() throws Exception {
        java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader("/proc/stat"));
        try {
            String[] p = r.readLine().trim().split("\\s+");
            long total = 0;
            for (int i = 1; i < p.length; i++) total += Long.parseLong(p[i]);
            long ocioso = Long.parseLong(p[4]) + (p.length > 5 ? Long.parseLong(p[5]) : 0);
            return new long[]{total, ocioso};
        } finally {
            r.close();
        }
    }

    /** Carga estimada pela frequência dos núcleos: quando o Android esconde /proc/stat, é o que dá para ler. -1 se nada legível. */
    private double cpuPelaFrequencia() {
        try {
            double soma = 0;
            int n = 0;
            for (int i = 0; i < 32; i++) {
                File d = new File("/sys/devices/system/cpu/cpu" + i + "/cpufreq");
                if (!d.isDirectory()) { if (i > 0 && n > 0) break; else continue; }
                long atual = lerLong(new File(d, "scaling_cur_freq"));
                long max = lerLong(new File(d, "cpuinfo_max_freq"));
                long min = lerLong(new File(d, "cpuinfo_min_freq"));
                if (atual <= 0 || max <= min) continue;
                soma += Math.max(0, Math.min(1, (double) (atual - min) / (max - min)));
                n++;
            }
            return n == 0 ? -1 : 100.0 * soma / n;
        } catch (Exception e) {
            return -1;
        }
    }

    private static long lerLong(File f) {
        try {
            java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader(f));
            try { return Long.parseLong(r.readLine().trim()); } finally { r.close(); }
        } catch (Exception e) {
            return -1;
        }
    }

    private boolean statLegivel() {
        try { lerStat(); return true; } catch (Exception e) { return false; }
    }

    private void sensoresTermicos(JSONArray sensores) throws JSONException {
        File[] zonas = new File("/sys/class/thermal").listFiles();
        if (zonas == null) return;
        int n = 0;
        for (File z : zonas) {
            if (n >= 6 || !z.getName().startsWith("thermal_zone")) continue;
            long t = lerLong(new File(z, "temp"));
            if (t <= 0) continue;
            double c = t > 1000 ? t / 1000.0 : t;
            if (c < 10 || c > 120) continue;
            String tipo = "";
            try {
                java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader(new File(z, "type")));
                try { tipo = r.readLine().trim(); } finally { r.close(); }
            } catch (Exception e) { tipo = z.getName(); }
            sensores.put(new JSONObject().put("nome", tipo).put("celsius", c));
            n++;
        }
    }

    private JSONObject rede() throws JSONException {
        Context c = getContext();
        String tipo = "Sem conexão";
        boolean vpn = false, internet = false;
        long mbps = -1;
        int sinal = -1;
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            NetworkCapabilities nc = n == null ? null : cm.getNetworkCapabilities(n);
            if (nc != null) {
                vpn = nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
                internet = nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                if (nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) tipo = "Wi-Fi";
                else if (nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) tipo = "Dados móveis";
                else if (nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) tipo = "Cabo";
                else tipo = vpn ? "VPN" : "Conectado";
                long kbps = nc.getLinkDownstreamBandwidthKbps();
                if (kbps > 0) mbps = kbps / 1000;
            }
        } catch (Exception e) { /* sem permissão de rede: segue só com o tráfego */ }
        if ("Wi-Fi".equals(tipo)) {
            try {
                WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                WifiInfo wi = wm.getConnectionInfo();
                if (wi != null) {
                    if (wi.getLinkSpeed() > 0) mbps = wi.getLinkSpeed();
                    int rssi = wi.getRssi();
                    if (rssi > -127 && rssi < 0) sinal = (int) Math.max(0, Math.min(100, (rssi + 100) * 100 / 55.0));
                }
            } catch (Exception e) { /* ok */ }
        }
        long rx = TrafficStats.getTotalRxBytes(), tx = TrafficStats.getTotalTxBytes();
        return new JSONObject().put("recebido", Math.max(0, rx)).put("enviado", Math.max(0, tx)).put("interfaces", "Sem conexão".equals(tipo) ? 0 : 1)
                .put("tipo", tipo).put("internet", internet).put("vpn", vpn).put("velocidade_mbps", mbps).put("sinal", sinal);
    }

    private JSONArray cacheApps = null;
    private long cacheAppsEm = 0;

    /** Apps que mais ficaram abertos nas últimas 24 h (precisa do acesso ao uso). */
    private JSONArray appsMaisUsados() {
        JSONArray saida = new JSONArray();
        if (!temUso()) return saida;
        long agora = System.currentTimeMillis();
        if (cacheApps != null && agora - cacheAppsEm < 60_000) return cacheApps;
        try {
            UsageStatsManager u = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
            List<UsageStats> lista = u.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, agora - 24L * 3_600_000L, agora);
            java.util.Map<String, Long> soma = new java.util.HashMap<>();
            if (lista != null) {
                for (UsageStats us : lista) {
                    long t = us.getTotalTimeInForeground();
                    if (t <= 0 || us.getPackageName().equals(getContext().getPackageName())) continue;
                    Long antes = soma.get(us.getPackageName());
                    soma.put(us.getPackageName(), (antes == null ? 0 : antes) + t);
                }
            }
            List<java.util.Map.Entry<String, Long>> ordem = new ArrayList<>(soma.entrySet());
            java.util.Collections.sort(ordem, (x, y) -> Long.compare(y.getValue(), x.getValue()));
            PackageManager pm = getContext().getPackageManager();
            for (int i = 0; i < Math.min(8, ordem.size()); i++) {
                String pacote = ordem.get(i).getKey();
                String nome = pacote;
                try { nome = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pacote, 0))); } catch (Exception e) { /* mantém o pacote */ }
                saida.put(new JSONObject().put("pid", 0).put("nome", nome).put("cpu", 0).put("memoria", 0).put("tempo_uso_s", ordem.get(i).getValue() / 1000));
            }
        } catch (Exception e) { /* sem leitura */ }
        cacheApps = saida;
        cacheAppsEm = agora;
        return saida;
    }

    private JSONObject diagnostico() throws JSONException {
        Context c = getContext();
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        // /proc/meminfo é a leitura certa: MemAvailable conta o que o Android devolve na hora (cache), e o Swap é a "RAM virtual"
        // dos celulares que anunciam, por exemplo, 8 GB + 8 GB de RAM Plus.
        long[] mem = meminfo();
        long totalRam = mem[0] > 0 ? mem[0] : mi.totalMem;
        long disponivel = mem[1] >= 0 ? mem[1] : mi.availMem;
        long usada = Math.max(0, totalRam - disponivel);
        long swapTotal = Math.max(0, mem[2]);
        long swapUsado = mem[2] > 0 && mem[3] >= 0 ? Math.max(0, mem[2] - mem[3]) : 0;

        Intent bat = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        JSONObject bateria = null;
        Double temp = null;
        if (bat != null) {
            int nivel = bat.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int escala = bat.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int status = bat.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int saude = bat.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN);
            int t = bat.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            if (t != Integer.MIN_VALUE) temp = t / 10.0;
            String estado = status == BatteryManager.BATTERY_STATUS_CHARGING ? "carregando" : status == BatteryManager.BATTERY_STATUS_FULL ? "cheia" : "descarregando";
            bateria = new JSONObject().put("nivel", escala > 0 ? 100.0 * nivel / escala : 0).put("estado", estado).put("saude", saude == BatteryManager.BATTERY_HEALTH_GOOD ? 100 : 50);
        }

        File dados = Environment.getDataDirectory();
        StatFs fs = new StatFs(dados.getPath());
        long total = fs.getTotalBytes();
        long livre = fs.getAvailableBytes();
        double pu = total == 0 ? 0 : 100.0 * (total - livre) / total;
        JSONObject disco = new JSONObject().put("nome", "Interno").put("ponto", "/").put("tipo", "flash").put("sistema", "f2fs/ext4").put("total", total).put("livre", livre)
                .put("percentual_usado", pu).put("saude", pu >= 95 ? "critica" : pu >= 85 ? "atencao" : "boa");

        Debug.MemoryInfo[] pss = am.getProcessMemoryInfo(new int[]{Process.myPid()});
        JSONArray processos = appsMaisUsados();
        if (processos.length() == 0) processos.put(new JSONObject().put("pid", Process.myPid()).put("nome", "Vindex").put("cpu", 0).put("memoria", pss.length > 0 ? pss[0].getTotalPss() * 1024L : 0L));

        JSONArray sensores = new JSONArray();
        sensoresTermicos(sensores);
        if (temp != null) sensores.put(new JSONObject().put("nome", "Bateria").put("celsius", temp));
        double maxTemp = temp == null ? -1 : temp;
        for (int k = 0; k < sensores.length(); k++) maxTemp = Math.max(maxTemp, sensores.getJSONObject(k).getDouble("celsius"));

        boolean cpuReal = statLegivel();
        double cpu = cpuReal ? percentualDoSistema() : cpuPelaFrequencia();
        boolean estimado = !cpuReal && cpu >= 0;
        if (cpu < 0) cpu = percentualDoSistema();
        return new JSONObject()
                .put("sistema", "Android " + Build.VERSION.RELEASE).put("maquina", Build.MANUFACTURER + " " + Build.MODEL)
                .put("ligado_ha_s", SystemClock.elapsedRealtime() / 1000).put("cpu_nome", Build.HARDWARE).put("cpu_nucleos", Runtime.getRuntime().availableProcessors())
                .put("cpu_uso", cpu).put("cpu_estimado", estimado)
                .put("memoria", new JSONObject().put("total", totalRam).put("usada", usada).put("disponivel", disponivel).put("percentual", totalRam == 0 ? 0 : 100.0 * usada / totalRam))
                .put("swap_total", swapTotal).put("swap_usado", swapUsado)
                .put("temperatura_max", maxTemp < 0 ? JSONObject.NULL : maxTemp).put("sensores", sensores)
                .put("bateria", bateria == null ? JSONObject.NULL : bateria)
                .put("discos", new JSONArray().put(disco))
                .put("processos", processos)
                .put("rede", rede());
    }

    private List<String[]> alvosDeLimpeza() {
        Context c = getContext();
        List<String[]> v = new ArrayList<>();
        v.add(new String[]{"cache_app", "Cache do próprio Vindex", c.getCacheDir().getPath()});
        File ext = c.getExternalCacheDir();
        if (ext != null) v.add(new String[]{"cache_ext", "Cache externo do Vindex", ext.getPath()});
        if (temAcessoATudo()) {
            File dcim = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), ".thumbnails");
            if (dcim.isDirectory()) v.add(new String[]{"miniaturas_dcim", "Miniaturas antigas da galeria (Câmera)", dcim.getPath()});
            File pic = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ".thumbnails");
            if (pic.isDirectory()) v.add(new String[]{"miniaturas_pic", "Miniaturas antigas da galeria (Imagens)", pic.getPath()});
            File perdidos = new File(Environment.getExternalStorageDirectory(), "LOST.DIR");
            if (perdidos.isDirectory()) v.add(new String[]{"lost_dir", "Restos de arquivos recuperados (LOST.DIR)", perdidos.getPath()});
        }
        return v;
    }

    private static boolean contemId(JSONArray ids, String id) {
        for (int i = 0; i < ids.length(); i++) if (id.equals(ids.optString(i))) return true;
        return false;
    }

    /** Limpa o que o Android permite (cache do Vindex, miniaturas) e encerra apps em segundo plano. */
    private JSONObject otimizarTudo(boolean simulacao) throws JSONException {
        double antes = diagnostico().getJSONObject("memoria").getDouble("percentual");
        List<File> pastas = new ArrayList<>();
        for (String[] t : alvosDeLimpeza()) pastas.add(new File(t[2]));
        JSONObject limp = Motor.limparPastas(pastas, 1, System.currentTimeMillis(), simulacao);
        JSONObject mem = simulacao ? new JSONObject().put("suportado", true).put("processos_ajustados", 0).put("liberado_bytes", 0).put("nota", "Simulação: nenhum app foi encerrado.") : liberarMemoria();
        return new JSONObject().put("limpeza", limp).put("memoria", mem).put("ram_antes", antes).put("ram_depois", diagnostico().getJSONObject("memoria").getDouble("percentual"));
    }

    /**
     * RAM de verdade: pede ao Android para encerrar os apps instalados que estão em segundo plano
     * (killBackgroundProcesses). Não mexe no app que está na tela, no sistema nem no Vindex.
     */
    private JSONObject liberarMemoria() throws JSONException {
        Context c = getContext();
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        PackageManager pm = c.getPackageManager();
        long antes = memoriaDisponivel();
        int n = 0;
        try {
            for (ApplicationInfo ai : pm.getInstalledApplications(0)) {
                boolean sistema = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
                boolean parado = (ai.flags & ApplicationInfo.FLAG_STOPPED) != 0;
                if (sistema || parado || ai.packageName.equals(c.getPackageName())) continue;
                am.killBackgroundProcesses(ai.packageName);
                n++;
            }
            Thread.sleep(1500);
        } catch (Exception e) {
            return new JSONObject().put("suportado", false).put("processos_ajustados", 0).put("liberado_bytes", 0)
                    .put("nota", "Não consegui encerrar apps em segundo plano neste aparelho.");
        }
        long liberado = Math.max(0, memoriaDisponivel() - antes);
        return new JSONObject().put("suportado", true).put("processos_ajustados", n).put("liberado_bytes", liberado)
                .put("nota", "Pedi para " + n + " apps em segundo plano devolverem memória. O Android pode reabrir alguns sozinhos.");
    }

    private long memoriaDisponivel() {
        long[] m = meminfo();
        if (m[1] >= 0) return m[1];
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        ((ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(mi);
        return mi.availMem;
    }

    private long[] meminfo() {
        try {
            java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader("/proc/meminfo"));
            StringBuilder sb = new StringBuilder();
            String l;
            try { while ((l = r.readLine()) != null) sb.append(l).append('\n'); } finally { r.close(); }
            return Motor.lerMeminfo(sb.toString());
        } catch (Exception e) {
            return new long[]{-1, -1, -1, -1};
        }
    }

    // ------------------------------------------------------------ segurança
    private JSONObject item(String rotulo, Boolean ok, String detalhe, String config) throws JSONException {
        return new JSONObject().put("rotulo", rotulo).put("ok", ok == null ? JSONObject.NULL : ok).put("detalhe", detalhe).put("config", config == null ? JSONObject.NULL : config);
    }

    private JSONObject estadoProtecao() throws JSONException {
        Context c = getContext();
        JSONArray itens = new JSONArray();
        KeyguardManager kg = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
        boolean travado = kg != null && kg.isDeviceSecure();
        itens.put(item("Tela bloqueada com senha, PIN ou biometria", travado, travado ? "Protegida" : "Sem bloqueio: quem pegar o celular vê tudo.", "bloqueio"));

        Boolean protect = null;
        try {
            int v = Settings.Global.getInt(c.getContentResolver(), "package_verifier_enable", -1);
            if (v == 1) protect = true; else if (v == 0) protect = false;
        } catch (Exception e) { /* sem leitura */ }
        itens.put(item("Google Play Protect (verificação de apps)", protect, protect == null ? "Não deu para ler: confira no Play Protect." : protect ? "Ligado" : "Desligado: ligue para o Google checar os apps que você instala.", "playprotect"));

        long dias = Motor.diasDoPatch(Build.VERSION.SECURITY_PATCH, System.currentTimeMillis());
        itens.put(item("Atualização de segurança do sistema", dias < 0 ? null : dias <= 120, dias < 0 ? "Sem informação" : "Última de " + Build.VERSION.SECURITY_PATCH + " (" + dias + " dias atrás)" + (dias > 120 ? ": procure atualização do sistema." : ""), "atualizacao"));

        boolean adb = Settings.Global.getInt(c.getContentResolver(), Settings.Global.ADB_ENABLED, 0) == 1;
        itens.put(item("Depuração USB desligada", !adb, adb ? "Ligada: desligue se você não é desenvolvedor." : "Desligada", "desenvolvedor"));

        String acess = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        int nAcess = acess == null || acess.trim().isEmpty() ? 0 : acess.split(":").length;
        itens.put(item("Serviços de acessibilidade", nAcess == 0 ? Boolean.TRUE : null, nAcess == 0 ? "Nenhum ligado" : nAcess + " ligado(s): confirme que você reconhece todos (golpes usam isso para controlar o celular).", "acessibilidade"));

        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            NetworkCapabilities nc = n == null ? null : cm.getNetworkCapabilities(n);
            boolean vpn = nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
            itens.put(item("VPN", vpn ? Boolean.TRUE : null, vpn ? "Ativa" : "Sem VPN (opcional; ajuda em Wi-Fi público)", null));
        } catch (Exception e) { /* ok */ }

        return new JSONObject().put("suportado", true).put("antivirus_ligado", protect == null ? JSONObject.NULL : protect).put("tempo_real_ligado", JSONObject.NULL)
                .put("assinaturas_dias", dias < 0 ? JSONObject.NULL : dias).put("firewall", new JSONArray()).put("itens", itens)
                .put("nota", "O Vindex confere o aparelho e os apps instalados, mas não é um antivírus: o Play Protect do Google continua sendo a proteção em tempo real.");
    }

    private JSONObject verificarApps() throws JSONException {
        Context c = getContext();
        PackageManager pm = c.getPackageManager();
        String acess = String.valueOf(Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES));
        String notif = String.valueOf(Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners"));
        JSONArray achados = new JSONArray();
        int analisados = 0;
        List<PackageInfo> pacotes;
        try {
            pacotes = pm.getInstalledPackages(PackageManager.GET_PERMISSIONS);
        } catch (Exception e) {
            throw new JSONException("Não consegui listar os apps deste aparelho.");
        }
        List<String> lojas = java.util.Arrays.asList("com.android.vending", "com.sec.android.app.samsungapps", "com.huawei.appmarket", "com.xiaomi.mipicks", "com.amazon.venezia", "com.heytap.market", "com.vivo.appstore", "com.oppo.market", "com.android.packageinstaller.noop");
        for (PackageInfo pi : pacotes) {
            ApplicationInfo ai = pi.applicationInfo;
            if (ai == null || pi.packageName.equals(c.getPackageName())) continue;
            if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
            analisados++;
            String instalador = null;
            try { instalador = pm.getInstallerPackageName(pi.packageName); } catch (Exception e) { /* sem leitura */ }
            boolean fora = instalador == null || !lojas.contains(instalador);
            boolean acessivel = acess.contains(pi.packageName + "/");
            boolean ouve = notif.contains(pi.packageName + "/");
            boolean sobrepoe = false, lerSms = false, admin = false, sms = false, smsEnviar = false;
            if (pi.requestedPermissions != null) {
                for (String p : pi.requestedPermissions) {
                    if ("android.permission.SYSTEM_ALERT_WINDOW".equals(p)) sobrepoe = true;
                    if ("android.permission.READ_SMS".equals(p)) sms = true;
                    if ("android.permission.SEND_SMS".equals(p)) smsEnviar = true;
                    if ("android.permission.BIND_DEVICE_ADMIN".equals(p)) admin = true;
                }
            }
            lerSms = sms && smsEnviar;
            if (sobrepoe) sobrepoe = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || appSobrepoe(pi.packageName);
            boolean depuravel = (ai.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            String[] r = Motor.riscoDoApp(fora, acessivel, sobrepoe, lerSms, ouve, admin, depuravel);
            if (r == null) continue;
            String nome = String.valueOf(pm.getApplicationLabel(ai));
            achados.put(new JSONObject().put("caminho", nome + " (" + pi.packageName + ")").put("nivel", r[0]).put("motivo", r[1]));
        }
        return new JSONObject().put("analisados", analisados).put("achados", achados);
    }

    private boolean appSobrepoe(String pacote) {
        try {
            AppOpsManager ao = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            int uid = getContext().getPackageManager().getApplicationInfo(pacote, 0).uid;
            return ao.checkOpNoThrow("android:system_alert_window", uid, pacote) == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }
}
