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

        long[] m = Motor.lerMeminfo("MemTotal:        7745124 kB\nMemFree:  100 kB\nMemAvailable:    3000000 kB\nSwapTotal:       8388604 kB\nSwapFree:        6000000 kB\n");
        confere(m[0] == 7745124L * 1024 && m[1] == 3000000L * 1024 && m[2] == 8388604L * 1024 && m[3] == 6000000L * 1024, "lê RAM física e virtual do meminfo");
        confere(Motor.lerMeminfo("lixo")[0] == -1, "meminfo ilegível devolve -1");
        confere(Motor.diasDoPatch("2025-01-01", java.sql.Timestamp.valueOf("2025-01-11 12:00:00").getTime()) == 10, "dias do patch de segurança");
        confere(Motor.diasDoPatch("???", 0) == -1, "patch ilegível");
        confere("alto".equals(Motor.suspeito("fatura.pdf.exe", 10)[0]), "extensão dupla é perigo");
        confere("medio".equals(Motor.suspeito("jogo.apk", 10)[0]), "APK fora da loja pede atenção");
        confere(Motor.suspeito("foto.jpg", 10) == null && Motor.suspeito("musica.mp3", 10) == null, "arquivo normal passa");
        grava(new File(t, "e/boleto.pdf.scr"), "x");
        JSONObject v = Motor.verificar(Motor.varrer(java.util.Collections.singletonList(new File(t, "e")), 2));
        confere(v.getInt("analisados") == 1 && v.getJSONArray("achados").length() == 1, "verificação acha o arquivo suspeito");

        confere(Motor.riscoDoApp(false, false, false, false, false, false, false) == null, "app da loja sem nada estranho passa");
        confere("baixo".equals(Motor.riscoDoApp(true, false, false, false, false, false, false)[0]), "só fora da loja é baixo");
        confere("alto".equals(Motor.riscoDoApp(true, true, false, false, false, false, false)[0]), "fora da loja + acessibilidade é alto");
        confere("medio".equals(Motor.riscoDoApp(false, false, false, false, true, false, false)[0]), "da loja ouvindo notificações é atenção");

        // lixeira do explorador: arquivo e pasta inteira vão para Vindex-Quarentena e voltam com o desfazer
        File lx = new File(t, "lx"); grava(new File(lx, "pasta/dentro.txt"), "x"); grava(new File(lx, "solto.txt"), "y");
        JSONObject lixo = Motor.explorarLixeira(new JSONArray().put(new File(lx, "pasta").getPath()).put(new File(lx, "solto.txt").getPath()));
        confere(lixo.getJSONArray("movidos").length() == 2 && !new File(lx, "pasta").exists() && new File(lx, Motor.QUARENTENA + "/pasta/dentro.txt").exists(), "pasta e arquivo vão para a lixeira");
        confere(Motor.explorarLixeira(new JSONArray().put(new File(lx, Motor.QUARENTENA).getPath())).getJSONArray("movidos").length() == 0, "a própria lixeira não vai para a lixeira");
        Motor.desfazer(lixo.getJSONArray("movidos"));
        confere(new File(lx, "pasta/dentro.txt").exists() && new File(lx, "solto.txt").exists(), "desfazer devolve pasta e arquivo");

        // quarentena visível, achada pela coleção e excluída de vez (caminhos curtos são protegidos)
        Motor.explorarLixeira(new JSONArray().put(new File(lx, "solto.txt").getPath()));
        boolean aparece = false;
        JSONArray lst = Motor.explorarListar(lx, false, 100).getJSONArray("itens");
        for (int i = 0; i < lst.length(); i++) if (Motor.QUARENTENA.equals(lst.getJSONObject(i).getString("nome"))) aparece = true;
        confere(aparece, "a quarentena aparece na listagem");
        java.util.List<File> rs = new java.util.ArrayList<>(); rs.add(lx);
        confere(Motor.explorarQuarentenas(rs).length() == 1, "acha a pasta de quarentena");
        confere(Motor.explorarApagar(new JSONArray().put("/storage")).getJSONArray("falhas").length() == 1, "caminho curto é protegido");
        File dentro = new File(lx, Motor.QUARENTENA + "/solto.txt");
        int fundura = 0; for (String p : dentro.getPath().split("/+")) if (!p.isEmpty()) fundura++;
        if (fundura >= 4) confere(Motor.explorarApagar(new JSONArray().put(dentro.getPath())).getInt("apagados") == 1 && !dentro.exists(), "exclui de vez");

        System.out.println(falhas == 0 ? "TUDO CERTO" : falhas + " falha(s)");
        System.exit(falhas == 0 ? 0 : 1);
    }
}
