//! Interface única (JSON) usada pelo app de Windows e pelos testes. O Android implementa o mesmo contrato em Kotlin.
use crate::{arquivos, explorador, hardware, limpeza, organizador, regras, seguranca};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::SystemTime;

fn texto_lista(v: &Value, campo: &str) -> Vec<String> {
    v.get(campo).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default()
}
fn raizes(v: &Value) -> Result<Vec<PathBuf>, String> {
    let r: Vec<PathBuf> = texto_lista(v, "raizes").into_iter().map(PathBuf::from).collect();
    if r.is_empty() {
        return Err("Escolha pelo menos uma pasta.".into());
    }
    if let Some(p) = r.iter().find(|p| !p.is_dir()) {
        return Err(format!("A pasta não existe: {}", p.display()));
    }
    if let Some(p) = r.iter().find(|p| p.parent().is_none()) {
        return Err(format!("Escolha uma pasta, não a raiz do disco: {}", p.display()));
    }
    Ok(r)
}
fn caminho_de(v: &Value, campo: &str) -> Result<PathBuf, String> {
    v.get(campo).and_then(|x| x.as_str()).filter(|p| !p.trim().is_empty()).map(PathBuf::from).ok_or_else(|| "Escolha o arquivo.".to_string())
}
fn u64_de(v: &Value, campo: &str, padrao: u64) -> u64 {
    v.get(campo).and_then(|x| x.as_u64()).unwrap_or(padrao)
}
fn bool_de(v: &Value, campo: &str, padrao: bool) -> bool {
    v.get(campo).and_then(|x| x.as_bool()).unwrap_or(padrao)
}
fn alvos_escolhidos(v: &Value) -> Vec<limpeza::Alvo> {
    let ids = texto_lista(v, "alvos");
    limpeza::alvos_padrao().into_iter().filter(|a| ids.is_empty() || ids.contains(&a.id)).collect()
}
fn para<T: serde::Serialize>(x: T) -> Result<Value, String> {
    serde_json::to_value(x).map_err(|e| e.to_string())
}

/// O cliente nunca manda caminhos para apagar: só escolhe os alvos pelo id; o plano é refeito aqui.
pub fn executar(comando: &str, args: &Value) -> Result<Value, String> {
    let agora = SystemTime::now();
    match comando {
        "diagnostico" => para(hardware::diagnosticar(u64_de(args, "processos", 8) as usize)),
        "alvos_limpeza" => para(limpeza::alvos_padrao().into_iter().map(|a| json!({"id": a.id, "rotulo": a.rotulo, "pasta": a.pasta})).collect::<Vec<_>>()),
        "planejar_limpeza" => {
            let p = limpeza::planejar(&alvos_escolhidos(args), agora);
            Ok(json!({"total_bytes": p.total_bytes, "arquivos": p.itens.len(), "por_alvo": p.por_alvo}))
        }
        "executar_limpeza" => {
            let alvos = alvos_escolhidos(args);
            let plano = limpeza::planejar(&alvos, agora);
            para(limpeza::executar(&plano, &alvos, bool_de(args, "simulacao", false)))
        }
        "otimizar_memoria" => para(limpeza::otimizar_memoria()),
        // Otimização com 1 clique: limpeza segura + memória, com o antes e o depois.
        "otimizar_tudo" => {
            let antes = hardware::diagnosticar(0);
            let alvos = limpeza::alvos_padrao();
            let plano = limpeza::planejar(&alvos, agora);
            let limp = limpeza::executar(&plano, &alvos, bool_de(args, "simulacao", false));
            let mem = limpeza::otimizar_memoria();
            let depois = hardware::diagnosticar(0);
            Ok(json!({"limpeza": limp, "memoria": mem, "ram_antes": antes.memoria.percentual, "ram_depois": depois.memoria.percentual}))
        }
        "varrer" => {
            let a = organizador::varrer(&raizes(args)?, u64_de(args, "profundidade", 6) as usize);
            let mut por_cat = std::collections::BTreeMap::<String, (usize, u64)>::new();
            for x in &a {
                let e = por_cat.entry(x.categoria.pasta().to_string()).or_default();
                e.0 += 1;
                e.1 += x.bytes;
            }
            Ok(json!({"arquivos": a.len(), "bytes": a.iter().map(|x| x.bytes).sum::<u64>(), "categorias": por_cat}))
        }
        "duplicados" => {
            let a = organizador::varrer(&raizes(args)?, u64_de(args, "profundidade", 6) as usize);
            para(organizador::duplicados(&a, u64_de(args, "min_bytes", 1024)))
        }
        "gigantes" => {
            let a = organizador::varrer(&raizes(args)?, u64_de(args, "profundidade", 6) as usize);
            para(organizador::gigantes_parados(&a, u64_de(args, "min_bytes", 500 * 1024 * 1024), u64_de(args, "parado_dias", 90), organizador::agora_s()))
        }
        "plano_categorias" => {
            let r = raizes(args)?;
            let a = organizador::varrer(&r, 1);
            let destino = args.get("destino").and_then(|x| x.as_str()).map(PathBuf::from).unwrap_or_else(|| r[0].clone());
            para(organizador::plano_por_categoria(&a, &destino))
        }
        "aplicar_regras" => {
            let r = raizes(args)?;
            let regs: Vec<regras::Regra> = serde_json::from_value(args.get("regras").cloned().unwrap_or(json!([]))).map_err(|e| format!("Regras inválidas: {e}"))?;
            let erros = regras::validar(&regs);
            if !erros.is_empty() {
                return Err(erros.join(" "));
            }
            let a = organizador::varrer(&r, u64_de(args, "profundidade", 3) as usize);
            let movs = regras::avaliar(&regs, &a, &r[0], organizador::agora_s());
            para(organizador::aplicar(&movs, bool_de(args, "simulacao", true)))
        }
        "organizar_categorias" => {
            let r = raizes(args)?;
            let a = organizador::varrer(&r, 1);
            let movs = organizador::plano_por_categoria(&a, &r[0]);
            para(organizador::aplicar(&movs, bool_de(args, "simulacao", true)))
        }
        "duplicados_para_quarentena" => {
            let manter = PathBuf::from(args.get("manter").and_then(|x| x.as_str()).ok_or("Falta escolher qual cópia manter.")?);
            let r = raizes(args)?;
            let a = organizador::varrer(&r, u64_de(args, "profundidade", 6) as usize);
            let grupo = organizador::duplicados(&a, 1).into_iter().find(|g| g.caminhos.contains(&manter)).ok_or("Esse arquivo não tem mais cópias.")?;
            para(organizador::aplicar(&organizador::quarentena_de_duplicados(&grupo, &manter), bool_de(args, "simulacao", false)))
        }
        "desfazer" => {
            let m: Vec<organizador::Movimento> = serde_json::from_value(args.get("movidos").cloned().unwrap_or(json!([]))).map_err(|e| e.to_string())?;
            para(organizador::desfazer(&m))
        }
        "explorar_armazenamentos" => para(explorador::armazenamentos()),
        "explorar_listar" => para(explorador::listar(&caminho_de(args, "caminho")?, bool_de(args, "ocultos", false))?),
        "explorar_recentes" => para(explorador::recentes(&raizes(args)?, u64_de(args, "limite", 60) as usize)),
        "explorar_colecao" => para(explorador::colecao(&raizes(args)?, args.get("categoria").and_then(|x| x.as_str()).unwrap_or("outros"), u64_de(args, "limite", 200) as usize)),
        "explorar_buscar" => para(explorador::buscar(&caminho_de(args, "caminho")?, args.get("texto").and_then(|x| x.as_str()).unwrap_or(""), 200)),
        "explorar_nova_pasta" => para(explorador::nova_pasta(&caminho_de(args, "caminho")?, args.get("nome").and_then(|x| x.as_str()).unwrap_or(""))?),
        "explorar_renomear" => para(explorador::renomear(&caminho_de(args, "caminho")?, args.get("nome").and_then(|x| x.as_str()).unwrap_or(""))?),
        "explorar_lixeira" => para(explorador::para_lixeira(&texto_lista(args, "caminhos").into_iter().map(PathBuf::from).collect::<Vec<_>>())),
        "explorar_apagar" => para(explorador::apagar_de_vez(&texto_lista(args, "caminhos").into_iter().map(PathBuf::from).collect::<Vec<_>>())),
        "explorar_quarentenas" => para(explorador::quarentenas(&raizes(args)?)),
        "pastas_conhecidas" => para(arquivos::pastas_conhecidas()),
        "listar_arquivo" => para(arquivos::listar(&caminho_de(args, "origem")?)?),
        "extrair" => {
            let origem = caminho_de(args, "origem")?;
            let destino = args.get("destino").and_then(|x| x.as_str()).filter(|d| !d.trim().is_empty()).map(PathBuf::from).unwrap_or_else(|| arquivos::pasta_sugerida(&origem));
            para(arquivos::extrair(&origem, &destino)?)
        }
        "pasta_sugerida" => para(arquivos::pasta_sugerida(&caminho_de(args, "origem")?)),
        "seguranca_estado" => para(seguranca::estado_protecao()),
        "defender_varrer" => {
            let pasta = args.get("pasta").and_then(|x| x.as_str()).filter(|p| !p.trim().is_empty()).map(PathBuf::from);
            Ok(json!({"resumo": seguranca::defender_varrer(pasta.as_deref())?}))
        }
        "verificar_arquivos" => para(seguranca::verificar_arquivos(&raizes(args)?, u64_de(args, "profundidade", 4) as usize)),
        "programas_iniciais" => para(seguranca::programas_iniciais()),
        "verificar_hosts" => para(seguranca::verificar_hosts()),
        outro => Err(format!("Comando desconhecido: {outro}")),
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::fs;

    #[test]
    fn comando_desconhecido_e_pasta_invalida() {
        assert!(executar("nada", &json!({})).unwrap_err().contains("desconhecido"));
        assert!(executar("varrer", &json!({})).unwrap_err().contains("pasta"));
        assert!(executar("varrer", &json!({"raizes": ["/nao/existe/mesmo"]})).unwrap_err().contains("não existe"));
        assert!(executar("varrer", &json!({"raizes": ["/"]})).unwrap_err().contains("raiz"));
    }

    #[test]
    fn varre_acha_duplicados_e_organiza_por_regra() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("a.pdf"), b"mesmo-conteudo").unwrap();
        fs::write(t.path().join("b.pdf"), b"mesmo-conteudo").unwrap();
        fs::write(t.path().join("c.mp3"), b"musica").unwrap();
        let r = json!({"raizes": [t.path()]});
        let v = executar("varrer", &r).unwrap();
        assert_eq!(v["arquivos"], 3);
        let d = executar("duplicados", &json!({"raizes": [t.path()], "min_bytes": 1})).unwrap();
        assert_eq!(d.as_array().unwrap().len(), 1);
        let regra = json!({"id":"1","nome":"Músicas","condicoes":{"categorias":["audios"]},"acao":{"tipo":"mover","destino":"Musicas"}});
        let sim = executar("aplicar_regras", &json!({"raizes":[t.path()],"regras":[regra.clone()],"simulacao":true})).unwrap();
        assert_eq!(sim["movidos"].as_array().unwrap().len(), 1);
        assert!(t.path().join("c.mp3").exists());
        let real = executar("aplicar_regras", &json!({"raizes":[t.path()],"regras":[regra],"simulacao":false})).unwrap();
        assert!(t.path().join("Musicas/c.mp3").exists());
        let volta = executar("desfazer", &json!({"movidos": real["movidos"]})).unwrap();
        assert!(volta["falhas"].as_array().unwrap().is_empty());
        assert!(t.path().join("c.mp3").exists());
    }

    #[test]
    fn extrai_e_verifica_pela_api() {
        let t = tempfile::tempdir().unwrap();
        let z = t.path().join("p.zip");
        {
            use std::io::Write;
            let mut w = zip::ZipWriter::new(fs::File::create(&z).unwrap());
            w.start_file("a.txt", zip::write::SimpleFileOptions::default()).unwrap();
            w.write_all(b"oi").unwrap();
            w.finish().unwrap();
        }
        let l = executar("listar_arquivo", &json!({"origem": z})).unwrap();
        assert_eq!(l["itens"], 1);
        let r = executar("extrair", &json!({"origem": z})).unwrap();
        assert_eq!(r["arquivos"], 1);
        assert!(t.path().join("p/a.txt").exists());
        assert!(executar("extrair", &json!({})).unwrap_err().contains("arquivo"));
        let v = executar("verificar_arquivos", &json!({"raizes": [t.path()]})).unwrap();
        assert!(v["analisados"].as_u64().unwrap() >= 2);
        assert!(executar("pastas_conhecidas", &json!({})).unwrap().is_array());
    }

    #[test]
    fn diagnostico_e_planejamento_funcionam() {
        assert!(executar("diagnostico", &json!({"processos": 3})).unwrap()["memoria"]["total"].as_u64().unwrap() > 0);
        assert!(executar("planejar_limpeza", &json!({"alvos": ["inexistente"]})).unwrap()["arquivos"] == 0);
    }
}
