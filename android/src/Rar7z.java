package tech.vetorial.vindex;

import net.sf.sevenzipjbinding.ExtractOperationResult;
import net.sf.sevenzipjbinding.IInArchive;
import net.sf.sevenzipjbinding.ISequentialOutStream;
import net.sf.sevenzipjbinding.SevenZip;
import net.sf.sevenzipjbinding.SevenZipException;
import net.sf.sevenzipjbinding.impl.RandomAccessFileInStream;
import net.sf.sevenzipjbinding.simple.ISimpleInArchive;
import net.sf.sevenzipjbinding.simple.ISimpleInArchiveItem;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;

/** RAR de qualquer versão (RAR 2, 3, 4, 5 e mais novos) pelo motor do 7-Zip. Entra quando o leitor antigo (junrar) não dá conta. */
final class Rar7z {
    private Rar7z() { }

    interface Item { void item(String nome, boolean pasta, long tamanho, ISimpleInArchiveItem it) throws Exception; }

    /** Percorre os itens do arquivo. Fecha tudo no fim. */
    static void percorrer(File f, String senha, Item aoItem) throws Exception {
        RandomAccessFile raf = new RandomAccessFile(f, "r");
        IInArchive a = null;
        try {
            RandomAccessFileInStream in = new RandomAccessFileInStream(raf);
            a = (senha == null || senha.isEmpty()) ? SevenZip.openInArchive(null, in) : SevenZip.openInArchive(null, in, senha);
            ISimpleInArchive s = a.getSimpleInterface();
            for (ISimpleInArchiveItem it : s.getArchiveItems()) {
                Long t = it.getSize();
                aoItem.item(it.getPath(), it.isFolder(), t == null ? 0 : t, it);
            }
        } finally {
            try { if (a != null) a.close(); } catch (Throwable ignora) { }
            try { raf.close(); } catch (Throwable ignora) { }
        }
    }

    /** Extrai um item para o arquivo de saída, devolvendo quantos bytes gravou. */
    static long extrair(ISimpleInArchiveItem it, File alvo, String senha) throws Exception {
        final OutputStream out = new java.io.FileOutputStream(alvo);
        final long[] n = new long[1];
        try {
            ISequentialOutStream saida = new ISequentialOutStream() {
                public int write(byte[] dados) throws SevenZipException {
                    if (Compactador.cancelar) throw new SevenZipException("Cancelado.");
                    try { out.write(dados); } catch (IOException e) { throw new SevenZipException(e); }
                    n[0] += dados.length; Compactador.feitos += dados.length;
                    return dados.length;
                }
            };
            ExtractOperationResult r = (senha == null || senha.isEmpty()) ? it.extractSlow(saida) : it.extractSlow(saida, senha);
            if (r == ExtractOperationResult.WRONG_PASSWORD) throw new Exception("Senha incorreta ou arquivo protegido por senha. Informe a senha e tente de novo.");
            if (r != ExtractOperationResult.OK) throw new Exception("Falha ao extrair " + it.getPath() + " (" + r + "). O arquivo pode estar incompleto ou corrompido.");
        } finally {
            out.close();
        }
        return n[0];
    }
}
