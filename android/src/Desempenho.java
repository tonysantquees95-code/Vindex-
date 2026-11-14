package tech.vetorial.vindex;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.BatteryManager;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.Locale;

/** Leituras rápidas e liberação de RAM usadas pelo widget da tela inicial e pelo painel flutuante. */
final class Desempenho {
    private Desempenho() { }

    /** {total, disponível} em bytes. */
    static long[] ram(Context c) {
        long total = -1, disp = -1;
        try (BufferedReader r = new BufferedReader(new FileReader("/proc/meminfo"))) {
            StringBuilder sb = new StringBuilder(); String l;
            while ((l = r.readLine()) != null) sb.append(l).append('\n');
            long[] m = Motor.lerMeminfo(sb.toString());
            total = m[0]; disp = m[1];
        } catch (Exception ignora) { }
        if (total <= 0 || disp < 0) {
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            ((ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(mi);
            total = mi.totalMem; disp = mi.availMem;
        }
        return new long[]{total, disp};
    }

    static int ramPercentual(Context c) { long[] m = ram(c); return m[0] <= 0 ? 0 : (int) Math.round(100.0 * (m[0] - m[1]) / m[0]); }

    /** Temperatura da bateria em °C (NaN se o aparelho não informa) e nível em %. */
    static double[] bateria(Context c) {
        Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b == null) return new double[]{Double.NaN, -1, 0};
        int t = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        int n = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), e = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int s = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean carga = s == BatteryManager.BATTERY_STATUS_CHARGING;
        return new double[]{t == Integer.MIN_VALUE ? Double.NaN : t / 10.0, e > 0 && n >= 0 ? 100.0 * n / e : -1, carga ? 1 : 0};
    }

    static String gb(long bytes) { return String.format(Locale.US, "%.1f", bytes / 1073741824.0).replace('.', ','); }

    static String linhaRam(Context c) { long[] m = ram(c); return "RAM " + ramPercentual(c) + "% · " + gb(m[0] - m[1]) + " de " + gb(m[0]) + " GB"; }

    static String linhaBateria(Context c) {
        double[] b = bateria(c);
        String t = Double.isNaN(b[0]) ? "–" : String.format(Locale.US, "%.0f °C", b[0]);
        return "Temp. " + t + (b[1] >= 0 ? " · Bateria " + Math.round(b[1]) + "%" + (b[2] > 0 ? " ⚡" : "") : "");
    }

    /** Pede ao Android para encerrar apps instalados que estão em segundo plano. Devolve quanto de RAM voltou, em bytes. Não toca no sistema nem no Vindex. */
    static long liberar(Context c) {
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        PackageManager pm = c.getPackageManager();
        long antes = ram(c)[1];
        try {
            for (ApplicationInfo ai : pm.getInstalledApplications(0)) {
                boolean sistema = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
                boolean parado = (ai.flags & ApplicationInfo.FLAG_STOPPED) != 0;
                if (sistema || parado || ai.packageName.equals(c.getPackageName())) continue;
                am.killBackgroundProcesses(ai.packageName);
            }
            Thread.sleep(1500);
        } catch (Exception ignora) { }
        return Math.max(0, ram(c)[1] - antes);
    }
}
