package tech.vetorial.vindex;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Painel flutuante por cima de qualquer app: RAM, temperatura e bateria ao vivo. Toque = Liberar RAM, arraste = mover, toque longo = fechar. */
public class SobreposicaoService extends Service {
    static volatile boolean ativo = false;
    private WindowManager wm;
    private LinearLayout painel;
    private TextView linha1, linha2;
    private WindowManager.LayoutParams lp;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable ciclo = new Runnable() { @Override public void run() { atualizar(); h.postDelayed(this, 2000); } };
    private boolean ocupado = false;

    static boolean podeDesenhar(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c); }

    static void ligar(Context c) {
        Intent i = new Intent(c, SobreposicaoService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void desligar(Context c) { c.stopService(new Intent(c, SobreposicaoService.class)); }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        if (painel != null) return START_STICKY;
        if (!podeDesenhar(this)) { stopSelf(); return START_NOT_STICKY; }
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("vindex_painel", "Painel de desempenho", NotificationManager.IMPORTANCE_MIN);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
            nb = new Notification.Builder(this, "vindex_painel");
        } else nb = new Notification.Builder(this);
        Notification n = nb.setContentTitle("Vindex: painel de desempenho ligado").setContentText("Toque no app para desligar.").setSmallIcon(android.R.drawable.ic_menu_info_details).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE); else startForeground(7, n);

        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        float d = getResources().getDisplayMetrics().density;
        painel = new LinearLayout(this);
        painel.setOrientation(LinearLayout.VERTICAL);
        int p = (int) (10 * d);
        painel.setPadding(p, (int) (6 * d), p, (int) (6 * d));
        GradientDrawable fundo = new GradientDrawable(); fundo.setColor(Color.argb(215, 7, 11, 20)); fundo.setCornerRadius(14 * d); fundo.setStroke((int) d, Color.argb(120, 120, 220, 255));
        painel.setBackground(fundo);
        linha1 = new TextView(this); linha1.setTextColor(Color.WHITE); linha1.setTextSize(12); linha1.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        linha2 = new TextView(this); linha2.setTextColor(Color.rgb(160, 205, 235)); linha2.setTextSize(11);
        painel.addView(linha1); painel.addView(linha2);
        lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        android.content.SharedPreferences sp = getSharedPreferences("vindex_painel", MODE_PRIVATE);
        lp.x = sp.getInt("x", (int) (12 * d)); lp.y = sp.getInt("y", (int) (90 * d));
        painel.setOnTouchListener(new View.OnTouchListener() {
            float x0, y0; int ix, iy; boolean moveu; long t0;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN: x0 = e.getRawX(); y0 = e.getRawY(); ix = lp.x; iy = lp.y; moveu = false; t0 = System.currentTimeMillis(); return true;
                    case MotionEvent.ACTION_MOVE:
                        if (Math.abs(e.getRawX() - x0) > 12 || Math.abs(e.getRawY() - y0) > 12) moveu = true;
                        if (moveu) { lp.x = ix + (int) (e.getRawX() - x0); lp.y = iy + (int) (e.getRawY() - y0); try { wm.updateViewLayout(painel, lp); } catch (Exception ignora) { } }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (moveu) { getSharedPreferences("vindex_painel", MODE_PRIVATE).edit().putInt("x", lp.x).putInt("y", lp.y).apply(); }
                        else if (System.currentTimeMillis() - t0 > 900) stopSelf();
                        else liberar();
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(painel, lp); } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        ativo = true;
        h.post(ciclo);
        return START_STICKY;
    }

    private void atualizar() {
        if (ocupado) return;
        linha1.setText(Desempenho.linhaRam(this));
        linha2.setText(Desempenho.linhaBateria(this) + "  ·  toque: liberar RAM");
    }

    private void liberar() {
        if (ocupado) return;
        ocupado = true;
        linha1.setText("Liberando RAM…");
        new Thread(new Runnable() { @Override public void run() {
            final long l = Desempenho.liberar(SobreposicaoService.this);
            h.post(new Runnable() { @Override public void run() { ocupado = false; linha1.setText("Voltaram " + Desempenho.gb(l) + " GB de RAM"); h.postDelayed(new Runnable() { public void run() { atualizar(); } }, 2500); } });
        } }).start();
    }

    @Override
    public void onDestroy() {
        ativo = false;
        h.removeCallbacksAndMessages(null);
        try { if (painel != null) wm.removeView(painel); } catch (Exception ignora) { }
        painel = null;
        super.onDestroy();
    }
}
