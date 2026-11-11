package tech.vetorial.vindex;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.file.Files;
import java.util.List;

/** Testes do motor Android sem dependência do Android: java -cp ... tech.vetorial.vindex.MotorTeste */
public final class MotorTeste {
    static int falhas = 0;

    static void confere(boolean ok, String msg) {
        if (!ok) { falhas++; System.out.println("FALHOU: " + msg); } else System.out.println("ok: " + msg);
    }

    static void grava(File f, String c) throws Exception {
        f.getParentFile().mkdirs();
        Files.write(f.toPath(), c.getBytes("UTF-8"));
    }

    public static void main(String[] args) throws Exception {
        File t = Files.createTempDirectory("vindex").toFile();
        grava(new File(t, "a/foto.jpg"), "conteudo-igual-123");
        grava(new File(t, "b/foto copia.jpg"), "conteudo-igual-123");
        grava(new File(t, "c/outra.jpg"), "conteudo-igual-124");
        grava(new File(t, "d/musica.mp3"), "som");
        List<Motor.Arq> arqs = Motor.varrer(java.util.Collections.singletonList(t), 5);
        confere(arqs.size() == 4, "varre 4 arquivos");
        JSONArray d = Motor.duplicados(arqs, 1);
        confere(d.length() == 1 && d.getJSONObject(0).getJSONArray("caminhos").length() == 2 && d.getJSONObject(0).getLong("desperdicio") == 18, "acha só o duplicado exato");

        JSONArray regras = new JSONArray("[{\"id\":\"1\",\"nome\":\"Músicas\",\"ativa\":true,\"condicoes\":{\"categorias\":[\"audios\"],\"extensoes\":[],\"nome_contem\":null,\"tamanho_min\":null,\"tamanho_max\":null,\"parado_dias_min\":null},\"acao\":{\"tipo\":\"mover\",\"destino\":\"Musicas\"}}]");
        confere(Motor.validar(regras).isEmpty(), "regra válida");
        JSONArray movs = Motor.avaliar(regras, arqs, t, System.currentTimeMillis() / 1000);
        confere(movs.length() == 1, "regra move só a música");
        JSONObject sim = Motor.aplicar(movs, true);
        confere(sim.getBoolean("simulacao") && new File(t, "d/musica.mp3").exists(), "simulação não move");
        JSONObject real = Motor.aplicar(movs, false);
        confere(new File(t, "Musicas/musica.mp3").exists() && !new File(t, "d/musica.mp3").exists(), "aplica a regra");
        JSONObject volta = Motor.desfazer(real.getJSONArray("movidos"));
        confere(volta.getJSONArray("falhas").length() == 0 && new File(t, "d/musica.mp3").exists(), "desfaz");

        JSONArray vazia = new JSONArray("[{\"id\":\"x\",\"nome\":\"\",\"condicoes\":{},\"acao\":{\"tipo\":\"mover\",\"destino\":\"\"}}]");
        confere(Motor.validar(vazia).contains("condição") && Motor.avaliar(vazia, arqs, t, 0).length() == 0, "regra sem condição é recusada e ignorada");

        JSONArray q = Motor.quarentenaDeDuplicados(d.getJSONObject(0).getJSONArray("caminhos"), new File(d.getJSONObject(0).getJSONArray("caminhos").getString(0)));
        JSONObject rq = Motor.aplicar(q, false);
        confere(rq.getJSONArray("movidos").length() == 1, "duplicado vai para a quarentena");
        confere(Motor.varrer(java.util.Collections.singletonList(t), 5).size() == 3, "quarentena não entra na varredura");

        JSONArray plano = Motor.planoPorCategoria(Motor.varrer(java.util.Collections.singletonList(new File(t, "d")), 1), t);
        confere(plano.length() == 1 && plano.getJSONObject(0).getString("para").endsWith("Áudios" + File.separator + "musica.mp3"), "plano por categoria");

        File cache = new File(t, "cache");
        grava(new File(cache, "x.tmp"), "1234");
        File velho = new File(cache, "y.tmp");
        grava(velho, "12");
        velho.setLastModified(System.currentTimeMillis() - 3 * 86_400_000L);
        JSONObject l = Motor.limparPastas(java.util.Collections.singletonList(cache), 24, System.currentTimeMillis(), false);
        confere(l.getLong("apagados") == 1 && !velho.exists() && new File(cache, "x.tmp").exists(), "limpa só o cache antigo");

        System.out.println(falhas == 0 ? "TUDO CERTO" : falhas + " falha(s)");
        System.exit(falhas == 0 ? 0 : 1);
    }
}
