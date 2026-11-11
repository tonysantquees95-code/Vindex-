package tech.vetorial.vindex;

import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
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

    private JSONObject diagnostico() throws JSONException {
        Context c = getContext();
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        long usada = mi.totalMem - mi.availMem;

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
        JSONObject eu = new JSONObject().put("pid", Process.myPid()).put("nome", "Vindex").put("cpu", 0).put("memoria", pss.length > 0 ? pss[0].getTotalPss() * 1024L : 0L);

        JSONArray sensores = new JSONArray();
        if (temp != null) sensores.put(new JSONObject().put("nome", "Bateria").put("celsius", temp));
        double cpu = percentualDoSistema();
        return new JSONObject()
                .put("sistema", "Android " + Build.VERSION.RELEASE).put("maquina", Build.MANUFACTURER + " " + Build.MODEL)
                .put("ligado_ha_s", SystemClock.elapsedRealtime() / 1000).put("cpu_nome", Build.HARDWARE).put("cpu_nucleos", Runtime.getRuntime().availableProcessors())
                .put("cpu_uso", cpu)
                .put("memoria", new JSONObject().put("total", mi.totalMem).put("usada", usada).put("disponivel", mi.availMem).put("percentual", mi.totalMem == 0 ? 0 : 100.0 * usada / mi.totalMem))
                .put("temperatura_max", temp == null ? JSONObject.NULL : temp).put("sensores", sensores)
                .put("bateria", bateria == null ? JSONObject.NULL : bateria)
                .put("discos", new JSONArray().put(disco))
                .put("processos", new JSONArray().put(eu));
    }

    /** O Android não deixa um app limpar outros apps: o Vindex limpa o próprio cache e mostra isso com clareza. */
    private JSONObject otimizarTudo(boolean simulacao) throws JSONException {
        Context c = getContext();
        double antes = diagnostico().getJSONObject("memoria").getDouble("percentual");
        List<File> pastas = new ArrayList<>();
        pastas.add(c.getCacheDir());
        File ext = c.getExternalCacheDir();
        if (ext != null) pastas.add(ext);
        JSONObject limp = Motor.limparPastas(pastas, 1, System.currentTimeMillis(), simulacao);
        JSONObject mem = new JSONObject().put("suportado", false).put("processos_ajustados", 0).put("liberado_bytes", 0)
                .put("nota", "No Android o sistema gerencia a memória sozinho; o Vindex limpou o próprio cache. Use “Arquivos” para liberar espaço de verdade.");
        return new JSONObject().put("limpeza", limp).put("memoria", mem).put("ram_antes", antes).put("ram_depois", diagnostico().getJSONObject("memoria").getDouble("percentual"));
    }
}
