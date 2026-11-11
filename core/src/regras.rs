//! AutomationRules: regras personalizadas de organização (a interface visual edita este mesmo JSON).
use crate::categorias::Categoria;
use crate::organizador::{Arquivo, Movimento, QUARENTENA};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct Condicoes {
    pub extensoes: Vec<String>,
    pub categorias: Vec<Categoria>,
    pub nome_contem: Option<String>,
    pub tamanho_min: Option<u64>,
    pub tamanho_max: Option<u64>,
    pub parado_dias_min: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub enum Acao {
    /// move para a pasta (relativa à base ou absoluta)
    Mover { destino: PathBuf },
    /// envia para a quarentena do Vindex, que se esvazia só quando o usuário quiser
    Quarentena,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Regra {
    pub id: String,
    pub nome: String,
    #[serde(default = "verdadeiro")]
    pub ativa: bool,
    #[serde(default)]
    pub condicoes: Condicoes,
    pub acao: Acao,
}

fn verdadeiro() -> bool {
    true
}

impl Condicoes {
    pub fn vazia(&self) -> bool {
        self.extensoes.is_empty() && self.categorias.is_empty() && self.nome_contem.is_none() && self.tamanho_min.is_none() && self.tamanho_max.is_none() && self.parado_dias_min.is_none()
    }

    /// Todas as condições preenchidas precisam valer ("e").
    pub fn confere(&self, a: &Arquivo, agora: u64) -> bool {
        (self.extensoes.is_empty() || self.extensoes.iter().any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&a.extensao)))
            && (self.categorias.is_empty() || self.categorias.contains(&a.categoria))
            && self.nome_contem.as_ref().map_or(true, |t| a.nome.to_lowercase().contains(&t.to_lowercase()))
            && self.tamanho_min.map_or(true, |m| a.bytes >= m)
            && self.tamanho_max.map_or(true, |m| a.bytes <= m)
            && self.parado_dias_min.map_or(true, |d| agora.saturating_sub(a.modificado) >= d * 86_400)
    }
}

/// Primeira regra ativa que casa decide o destino; regra sem condição nenhuma é ignorada (evita mover tudo sem querer).
pub fn avaliar(regras: &[Regra], arquivos: &[Arquivo], base: &Path, agora: u64) -> Vec<Movimento> {
    let mut v = Vec::new();
    for a in arquivos {
        let Some(r) = regras.iter().find(|r| r.ativa && !r.condicoes.vazia() && r.condicoes.confere(a, agora)) else { continue };
        let pasta = match &r.acao {
            Acao::Mover { destino } => if destino.is_absolute() { destino.clone() } else { base.join(destino) },
            Acao::Quarentena => base.join(QUARENTENA),
        };
        if a.caminho.parent() == Some(pasta.as_path()) {
            continue;
        }
        v.push(Movimento { de: a.caminho.clone(), para: pasta.join(&a.nome), motivo: format!("regra: {}", r.nome) });
    }
    v
}

pub fn validar(regras: &[Regra]) -> Vec<String> {
    let mut erros = Vec::new();
    for r in regras {
        if r.nome.trim().is_empty() {
            erros.push(format!("{}: dê um nome à regra.", r.id));
        }
        if r.condicoes.vazia() {
            erros.push(format!("{}: escolha pelo menos uma condição.", r.nome));
        }
        if let (Some(a), Some(b)) = (r.condicoes.tamanho_min, r.condicoes.tamanho_max) {
            if a > b {
                erros.push(format!("{}: o tamanho mínimo é maior que o máximo.", r.nome));
            }
        }
        if let Acao::Mover { destino } = &r.acao {
            if destino.as_os_str().is_empty() {
                erros.push(format!("{}: informe a pasta de destino.", r.nome));
            }
        }
    }
    erros
}

#[cfg(test)]
mod testes {
    use super::*;
    fn arq(nome: &str, ext: &str, bytes: u64, mod_: u64, cat: Categoria) -> Arquivo {
        Arquivo { caminho: PathBuf::from("/d").join(nome), nome: nome.into(), extensao: ext.into(), categoria: cat, bytes, modificado: mod_ }
    }
    #[test]
    fn primeira_regra_que_casa_decide() {
        let regras = vec![
            Regra { id: "1".into(), nome: "Notas fiscais".into(), ativa: true, condicoes: Condicoes { extensoes: vec![".PDF".into()], nome_contem: Some("nota".into()), ..Default::default() }, acao: Acao::Mover { destino: "Fiscal".into() } },
            Regra { id: "2".into(), nome: "PDFs".into(), ativa: true, condicoes: Condicoes { categorias: vec![Categoria::Documentos], ..Default::default() }, acao: Acao::Mover { destino: "Docs".into() } },
            Regra { id: "3".into(), nome: "Velhos".into(), ativa: true, condicoes: Condicoes { parado_dias_min: Some(30), ..Default::default() }, acao: Acao::Quarentena },
            Regra { id: "4".into(), nome: "Sem condição".into(), ativa: true, condicoes: Condicoes::default(), acao: Acao::Quarentena },
        ];
        let agora = 100 * 86_400;
        let l = vec![arq("Nota-123.pdf", "pdf", 10, agora, Categoria::Documentos), arq("lista.pdf", "pdf", 10, agora, Categoria::Documentos), arq("velho.zip", "zip", 10, 0, Categoria::Compactados), arq("novo.zip", "zip", 10, agora, Categoria::Compactados)];
        let m = avaliar(&regras, &l, Path::new("/base"), agora);
        assert_eq!(m.len(), 3);
        assert_eq!(m[0].para, Path::new("/base/Fiscal/Nota-123.pdf"));
        assert_eq!(m[1].para, Path::new("/base/Docs/lista.pdf"));
        assert_eq!(m[2].para, Path::new("/base").join(QUARENTENA).join("velho.zip"));
    }
    #[test]
    fn regra_desligada_e_validacao() {
        let r = Regra { id: "x".into(), nome: "".into(), ativa: false, condicoes: Condicoes::default(), acao: Acao::Mover { destino: "".into() } };
        assert!(avaliar(&[r.clone()], &[arq("a.pdf", "pdf", 1, 0, Categoria::Documentos)], Path::new("/b"), 1).is_empty());
        assert_eq!(validar(&[r]).len(), 3);
    }
    #[test]
    fn json_das_regras_e_estavel() {
        let j = r#"{"id":"a","nome":"Fotos","condicoes":{"categorias":["imagens"],"tamanho_min":1000},"acao":{"tipo":"mover","destino":"Fotos"}}"#;
        let r: Regra = serde_json::from_str(j).unwrap();
        assert!(r.ativa);
        assert_eq!(r.condicoes.categorias, vec![Categoria::Imagens]);
        assert_eq!(r.acao, Acao::Mover { destino: "Fotos".into() });
    }
}
