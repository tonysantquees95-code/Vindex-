package tech.vetorial.vindex;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Widget da tela inicial: RAM, temperatura e bateria, com o botão "Liberar RAM". */
public class VindexWidget extends AppWidgetProvider {
    static final String ACAO_LIBERAR = "tech.vetorial.vindex.WIDGET_LIBERAR";

    static void desenhar(Context c, AppWidgetManager m, int[] ids, String aviso) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_vindex);
            v.setTextViewText(R.id.w_ram, Desempenho.linhaRam(c));
            v.setTextViewText(R.id.w_temp, aviso != null ? aviso : Desempenho.linhaBateria(c));
            v.setProgressBar(R.id.w_barra, 100, Desempenho.ramPercentual(c), false);
            Intent i = new Intent(c, VindexWidget.class).setAction(ACAO_LIBERAR);
            v.setOnClickPendingIntent(R.id.w_liberar, PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            Intent abrir = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (abrir != null) v.setOnClickPendingIntent(R.id.w_titulo, PendingIntent.getActivity(c, 1, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            m.updateAppWidget(id, v);
        }
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) { desenhar(c, m, ids, null); }

    @Override
    public void onReceive(final Context c, final Intent i) {
        if (!ACAO_LIBERAR.equals(i.getAction())) { super.onReceive(c, i); return; }
        final PendingResult r = goAsync();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    AppWidgetManager m = AppWidgetManager.getInstance(c);
                    int[] ids = m.getAppWidgetIds(new ComponentName(c, VindexWidget.class));
                    desenhar(c, m, ids, "Liberando…");
                    long liberado = Desempenho.liberar(c);
                    desenhar(c, m, ids, "Voltaram " + Desempenho.gb(liberado) + " GB de RAM");
                } finally { r.finish(); }
            }
        }).start();
    }
}
