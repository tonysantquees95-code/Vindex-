package tech.vetorial.vindex;

import android.graphics.Color;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

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
    }
}
