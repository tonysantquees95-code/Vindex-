package tech.vetorial.vindex;

import android.graphics.Color;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/** Registra o plugin do Vindex e mantém o app ENTRE as barras do Android (status em cima, navegação embaixo). */
public class MainActivity extends BridgeActivity {
    private static final int FUNDO = Color.parseColor("#070B14");
    /** Pasta que outro app (o Vortex) pediu para abrir; o plugin entrega uma vez e limpa. */
    static volatile String pastaPedida = null;

    private static void lerPedido(Intent i) {
        if (i == null) return;
        String p = i.getStringExtra("vindex_pasta");
        if (p != null && p.startsWith("/")) pastaPedida = p;
        // outro app (navegador, etc.) pediu "abrir downloads": abre direto na pasta Download
        if ("android.intent.action.VIEW_DOWNLOADS".equals(i.getAction())) {
            pastaPedida = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS).getAbsolutePath();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        lerPedido(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VindexPlugin.class);
        super.onCreate(savedInstanceState);

        // O Capacitor não trata o "voltar" do aparelho (sai do app). Aqui ele anda no histórico do app (janelas, subpastas, abas)
        // e só sai quando não há mais para onde voltar.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge() == null ? null : getBridge().getWebView();
                if (w != null && w.canGoBack()) { w.goBack(); return; }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
        lerPedido(getIntent());

        Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.getDecorView().setBackgroundColor(FUNDO);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setAppearanceLightStatusBars(false);     // ícones claros sobre o fundo escuro
        c.setAppearanceLightNavigationBars(false);

        final View raiz = findViewById(android.R.id.content);
        raiz.setBackgroundColor(FUNDO);
        // Barras de cima e de baixo (e o teclado) viram margem: nada fica escondido atrás delas, em qualquer versão do Android.
        ViewCompat.setOnApplyWindowInsetsListener(raiz, (v, insets) -> {
            Insets barras = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets teclado = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(barras.left, barras.top, barras.right, Math.max(barras.bottom, teclado.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(raiz);
        raiz.postDelayed(new Runnable() { public void run() { perguntarPrincipal(); } }, 2500);
    }

    /** Só na primeira abertura: pergunta se o Vindex deve ser o gerenciador principal (abre os downloads e as pastas de outros apps). */
    private void perguntarPrincipal() {
        if (isFinishing()) return;
        android.content.SharedPreferences sp = getSharedPreferences("vindex_principal", MODE_PRIVATE);
        if (sp.getBoolean("perguntou", false)) return;
        sp.edit().putBoolean("perguntou", true).apply();
        new android.app.AlertDialog.Builder(this)
            .setTitle("Usar o Vindex como gerenciador principal?")
            .setMessage("Quando um app pedir para abrir os downloads ou uma pasta, o Vindex abre. Na próxima tela escolha o Vindex e toque em \"Sempre\".")
            .setPositiveButton("Sim, usar", new android.content.DialogInterface.OnClickListener() {
                public void onClick(android.content.DialogInterface d, int w) {
                    try { startActivity(new Intent("android.intent.action.VIEW_DOWNLOADS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignora) { }
                }
            })
            .setNegativeButton("Agora não", null)
            .show();
    }
}
