package tech.vetorial.vindex;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.WindowManager;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Abrir o cofre com digital, rosto, PIN ou padrão do celular.
 * A chave dos dados do cofre fica cifrada com uma chave do Keystore do Android, que só funciona logo depois
 * de a pessoa se identificar na tela do sistema (BiometricPrompt). Nada disso sai do aparelho.
 */
final class CofreBio {
    interface Resultado {
        void ok(String valor);
        void erro(String codigo, String mensagem);
    }

    private static final String ALIAS = "vindex_cofre_v1";
    private static final String PREFS = "vindex_cofre_bio";
    private static final int VALIDADE_S = 20;

    private CofreBio() {}

    /** O celular tem bloqueio de tela (digital, rosto, PIN ou padrão) e é Android 9 ou mais novo. */
    static boolean disponivel(Context c) {
        if (Build.VERSION.SDK_INT < 28) return false;
        KeyguardManager kg = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
        return kg != null && kg.isDeviceSecure();
    }

    static boolean ativo(Context c, String conta) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains("d_" + conta);
    }

    static void apagar(Context c, String conta) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("d_" + conta).apply();
    }

    /** Impede captura de tela e a miniatura em "recentes" enquanto o cofre está aberto. */
    static void proteger(final Activity a, final boolean ligado) {
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (ligado) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
    }

    private static SecretKey chave(boolean criar) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        if (!criar) return null;
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationValidityDurationSeconds(VALIDADE_S)
            .build());
        return g.generateKey();
    }

    @SuppressWarnings("deprecation")
    private static void identificar(Activity a, String titulo, String subtitulo, final Runnable depois, final Resultado r) {
        if (Build.VERSION.SDK_INT < 28) {
            r.erro("indisponivel", "Este Android não tem a tela de identificação (precisa do Android 9 ou mais novo).");
            return;
        }
        BiometricPrompt.Builder b = new BiometricPrompt.Builder(a).setTitle(titulo).setSubtitle(subtitulo);
        if (Build.VERSION.SDK_INT >= 30) {
            // 15 = biometria forte, 32768 = senha/PIN/padrão do aparelho
            b.setAllowedAuthenticators(15 | 32768);
        } else {
            b.setDeviceCredentialAllowed(true);
        }
        b.build().authenticate(new CancellationSignal(), a.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult resultado) {
                depois.run();
            }

            @Override
            public void onAuthenticationError(int codigo, CharSequence mensagem) {
                boolean cancelou = codigo == 5 || codigo == 10 || codigo == 13;
                r.erro(cancelou ? "cancelado" : "erro", String.valueOf(mensagem));
            }
        });
    }

    /** Guarda o segredo (a chave dos dados, em base64) protegido pela identificação do aparelho. */
    static void guardar(final Activity a, final String conta, final String segredo, final Resultado r) {
        identificar(a, "Ativar o desbloqueio do cofre", "Confirme que é você para liberar a digital, o rosto ou o padrão", new Runnable() {
            @Override
            public void run() {
                try {
                    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                    c.init(Cipher.ENCRYPT_MODE, chave(true));
                    byte[] ct = c.doFinal(segredo.getBytes(StandardCharsets.UTF_8));
                    String valor = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
                    SharedPreferences p = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                    p.edit().putString("d_" + conta, valor).apply();
                    r.ok("ok");
                } catch (Exception e) {
                    r.erro("erro", e.getMessage() == null ? e.toString() : e.getMessage());
                }
            }
        }, r);
    }

    /** Pede a identificação e devolve o segredo guardado. */
    static void abrir(final Activity a, final String conta, final Resultado r) {
        final String guardado = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("d_" + conta, null);
        if (guardado == null || !guardado.contains(":")) {
            r.erro("sem_chave", "O desbloqueio por digital não está ativado neste aparelho.");
            return;
        }
        identificar(a, "Abrir o cofre", "Use a digital, o rosto ou o padrão do celular", new Runnable() {
            @Override
            public void run() {
                try {
                    String[] partes = guardado.split(":");
                    SecretKey k = chave(false);
                    if (k == null) {
                        apagar(a, conta);
                        r.erro("invalidada", "A chave deste aparelho não existe mais. Entre com a senha do cofre.");
                        return;
                    }
                    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                    c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(partes[0], Base64.NO_WRAP)));
                    byte[] claro = c.doFinal(Base64.decode(partes[1], Base64.NO_WRAP));
                    r.ok(new String(claro, StandardCharsets.UTF_8));
                } catch (KeyPermanentlyInvalidatedException e) {
                    apagar(a, conta);
                    r.erro("invalidada", "O bloqueio do celular mudou. Entre com a senha do cofre e ative de novo.");
                } catch (Exception e) {
                    r.erro("erro", e.getMessage() == null ? e.toString() : e.getMessage());
                }
            }
        }, r);
    }
}
