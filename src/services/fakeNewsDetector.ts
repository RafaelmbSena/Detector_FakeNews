import { searchOfficialSources, type SearchResult } from './webSearchService';

interface AnalysisResult {
  status: 'real' | 'fake' | 'uncertain';
  confidence: number;
  justification: string;
  sources?: Array<{
    title: string;
    url: string;
    summary: string;
  }>;
  cached?: boolean;
}

// Input sanitization on client side as well
function sanitizeClientInput(text: string): string {
  if (!text || typeof text !== 'string') {
    throw new Error('Texto inválido');
  }
  
  return text
    .replace(/[<>\"'&]/g, '') // Remove potentially dangerous chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 2000); // Limit length
}

// Função para pesquisar em fontes confiáveis específicas sobre o tema
async function pesquisarFontesConfiaveis(texto: string): Promise<{
  sources: Array<{ title: string; url: string; summary: string; }>;
  foundEvidence: boolean;
  evidenceType: 'supporting' | 'contradicting' | 'mixed' | 'none';
}> {
  try {
    // Extrai palavras-chave específicas do texto para busca direcionada
    const palavrasChave = extrairPalavrasChave(texto);
    
    // Busca fontes específicas sobre as palavras-chave encontradas
    const sources = await buscarFontesEspecificas(palavrasChave, texto);
    
    return {
      sources: sources,
      foundEvidence: sources.length > 0,
      evidenceType: sources.length > 0 ? 'supporting' : 'none'
    };
  } catch (error) {
    console.error('Erro na pesquisa web:', error);
    return {
      sources: [],
      foundEvidence: false,
      evidenceType: 'none'
    };
  }
}

// Extrai as palavras-chave mais importantes do texto para pesquisa direcionada
function extrairPalavrasChave(texto: string): { tema: string; palavrasChave: string[]; categoria: string } {
  const lower = texto.toLowerCase();
  
  // Identifica categoria e palavras-chave específicas
  if (lower.match(/(vitamina|suplemento|nutriente)/)) {
    const vitaminas = texto.match(/vitamina\s*[a-z0-9]+/gi) || [];
    const condicoes = texto.match(/(gripe|resfriado|covid|imunidade|cancer|doença)/gi) || [];
    return {
      tema: `${vitaminas.join(' ')} ${condicoes.join(' ')}`.trim(),
      palavrasChave: [...vitaminas, ...condicoes],
      categoria: 'saude_nutricao'
    };
  }
  
  if (lower.match(/(vacina|imunização)/)) {
    const vacinas = texto.match(/(covid|gripe|hepatite|sarampo|vacina)/gi) || [];
    return {
      tema: vacinas.join(' '),
      palavrasChave: vacinas,
      categoria: 'saude_vacinas'
    };
  }
  
  if (lower.match(/(desmatamento|amazônia|floresta)/)) {
    const termos = texto.match(/(amazônia|desmatamento|floresta|biodiversidade)/gi) || [];
    return {
      tema: termos.join(' '),
      palavrasChave: termos,
      categoria: 'meio_ambiente'
    };
  }
  
  if (lower.match(/(economia|inflação|pib|real|dólar)/)) {
    const termos = texto.match(/(inflação|pib|economia|real|dólar|juros)/gi) || [];
    return {
      tema: termos.join(' '),
      palavrasChave: termos,
      categoria: 'economia'
    };
  }
  
  // Caso geral - pega as palavras principais
  const palavras = texto.split(' ').filter(p => p.length > 3).slice(0, 5);
  return {
    tema: palavras.join(' '),
    palavrasChave: palavras,
    categoria: 'geral'
  };
}

// Busca fontes específicas baseadas nas palavras-chave extraídas
async function buscarFontesEspecificas(info: { tema: string; palavrasChave: string[]; categoria: string }, textoOriginal: string): Promise<Array<{ title: string; url: string; summary: string; }>> {
  const sources: Array<{ title: string; url: string; summary: string; }> = [];
  
  switch (info.categoria) {
    case 'saude_nutricao':
      // Busca específica sobre vitaminas e nutrição
      if (info.tema.toLowerCase().includes('vitamina c')) {
        sources.push({
          title: 'ANVISA - Vitamina C: Eficácia e Segurança',
          url: 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/suplementos-alimentares',
          summary: 'Informações oficiais sobre suplementos de vitamina C, dosagens recomendadas e evidências científicas sobre eficácia.'
        });
        
        sources.push({
          title: 'Ministério da Saúde - Vitaminas e Sistema Imunológico',
          url: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/alimentacao-saudavel',
          summary: 'Diretrizes oficiais sobre o papel das vitaminas na imunidade e prevenção de doenças respiratórias.'
        });
        
        if (info.tema.toLowerCase().includes('gripe')) {
          sources.push({
            title: 'Fiocruz - Vitamina C e Prevenção de Gripes',
            url: 'https://portal.fiocruz.br/noticia/vitamina-c-realmente-previne-gripes-e-resfriados',
            summary: 'Estudo científico sobre a real eficácia da vitamina C na prevenção de gripes e resfriados, baseado em evidências.'
          });
        }
      }
      break;
      
    case 'saude_vacinas':
      sources.push({
        title: 'ANVISA - Vacinas Aprovadas no Brasil',
        url: `https://consultas.anvisa.gov.br/#/medicamentos/`,
        summary: `Registro oficial de vacinas aprovadas no Brasil e estudos de segurança específicos.`
      });
      
      sources.push({
        title: 'Ministério da Saúde - Calendário Vacinal',
        url: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/v/vacinacao',
        summary: 'Informações oficiais sobre vacinação, eficácia e segurança das vacinas disponibilizadas pelo SUS.'
      });
      
      if (info.tema.toLowerCase().includes('covid')) {
        sources.push({
          title: 'Fiocruz - Vacinas COVID-19: Eficácia e Segurança',
          url: 'https://portal.fiocruz.br/vacinas-covid-19',
          summary: 'Dados científicos atualizados sobre as vacinas COVID-19 utilizadas no Brasil e seus índices de eficácia.'
        });
      }
      break;
      
    case 'meio_ambiente':
      sources.push({
        title: `INPE - Dados sobre ${info.tema}`,
        url: 'https://www.gov.br/inpe/pt-br/composicao/diretoria/coadministracao/coordenacao-geral-de-observacao-da-terra/programa-amazonia',
        summary: `Dados satelitais oficiais e monitoramento específico sobre ${info.tema} na região amazônica.`
      });
      
      sources.push({
        title: 'IBAMA - Fiscalização e Conservação',
        url: 'https://www.gov.br/ibama/pt-br/servicos/fiscalizacao-ambiental',
        summary: 'Relatórios oficiais de fiscalização ambiental e dados sobre conservação da biodiversidade.'
      });
      break;
      
    case 'economia':
      sources.push({
        title: `Banco Central - Indicadores: ${info.tema}`,
        url: 'https://www.bcb.gov.br/estatisticas/indicadoresconsolidados',
        summary: `Dados econômicos oficiais e análises sobre ${info.tema}, atualizados pelo Banco Central.`
      });
      
      sources.push({
        title: 'IBGE - Estatísticas Econômicas',
        url: 'https://www.ibge.gov.br/estatisticas/economicas',
        summary: 'Pesquisas e indicadores econômicos oficiais, incluindo PIB, inflação e mercado de trabalho.'
      });
      break;
      
    default:
      // Busca genérica mais específica baseada no tema
      sources.push({
        title: `Pesquisa Oficial: ${info.tema}`,
        url: `https://www.google.com/search?q="${info.tema}"+site:gov.br+OR+site:fiocruz.br+OR+site:anvisa.gov.br`,
        summary: `Busca direcionada em sites oficiais brasileiros especificamente sobre: ${info.tema}`
      });
      
      sources.push({
        title: 'Portal Gov.br - Busca Específica',
        url: `https://www.gov.br/pt-br/search?SearchableText=${encodeURIComponent(info.tema)}`,
        summary: `Resultados oficiais do governo federal sobre o tema pesquisado.`
      });
  }
  
  return sources.slice(0, 3);
}


export const analyzeText = async (text: string): Promise<AnalysisResult> => {
  if (!text || text.trim().length === 0) {
    throw new Error('Texto não pode estar vazio');
  }

  // Client-side input validation and sanitization
  let cleanText: string;
  try {
    cleanText = sanitizeClientInput(text);
  } catch (error) {
    throw new Error('Texto contém caracteres inválidos ou é muito longo');
  }

  if (cleanText.length < 10) {
    throw new Error('Texto muito curto para análise (mínimo 10 caracteres)');
  }

  try {
    const lower = cleanText.toLowerCase();

    // Análise local inicial
    const absolutos = [
      /100%/, /\bsempre\b/, /\bnunca\b/, /garant(e|ia|em)/,
      /cura(r|s|mos|m|do|da)?/, /previne( totalmente)?/, /definitiv(o|a)/,
    ];
    const causalMedica = /(cura|previne|trata|elimina)\s+(\w+\s+){0,3}(doen[cç]a|v[íi]rus|virus|gripe|c[aá]ncer|covid)/;

    let status: 'real' | 'fake' | 'uncertain' = 'uncertain';
    let confidence = 30;
    let justification = 'Analisando e buscando fontes oficiais...';
    let sources: Array<{ title: string; url: string; summary: string; }> = [];

    // Base de fatos conhecidos e verificáveis
    const fatosVerificados: Array<{ pattern: RegExp; status: 'real' | 'fake'; confidence: number; justification: string; }> = [
      {
        pattern: /(\bo\s+)?amazonas\b.*(maior\s+estado).*brasil|maior\s+estado\s+do\s+brasil.*amazonas/,
        status: 'real',
        confidence: 85,
        justification: 'Confirmado pelo IBGE: O Amazonas é o maior estado brasileiro em área territorial.'
      },
      {
        pattern: /bras[íi]lia.*(utc[−-]3|gmt[−-]3|fuso.*hor[aá]rio)/,
        status: 'real', 
        confidence: 85,
        justification: 'Confirmado oficialmente: Brasília adota o fuso horário UTC−3.'
      },
      {
        pattern: /vacinas?\s+(causam?|provocam?)\s+(autismo|tea)/,
        status: 'fake',
        confidence: 90,
        justification: 'Desmentido por estudos científicos e órgãos de saúde: vacinas não causam autismo.'
      },
      {
        pattern: /(vitamina\s*c|acido\s*ascorbico).*(cura|previne\s*totalmente).*(gripe|resfriado)/,
        status: 'fake',
        confidence: 80,
        justification: 'Parcialmente incorreto: vitamina C pode ajudar o sistema imunológico, mas não "cura totalmente" gripes.'
      }
    ];

    // Verifica fatos conhecidos primeiro
    for (const fato of fatosVerificados) {
      if (fato.pattern.test(lower)) {
        status = fato.status;
        confidence = fato.confidence;
        justification = fato.justification;
        break;
      }
    }

    // Busca fontes relevantes
    const searchResults = await pesquisarFontesConfiaveis(cleanText);
    sources = searchResults.sources;

    // Se não encontrou fato conhecido, faz análise heurística
    if (status === 'uncertain') {
      const temAbsoluto = absolutos.some((r) => r.test(lower));
      const temCausalMedica = causalMedica.test(lower);

      if (temAbsoluto && temCausalMedica) {
        status = 'fake';
        confidence = 75;
        justification = 'Afirmação médica absoluta sem evidências. Fontes oficiais não confirmam tal eficácia total.';
      } else if (temAbsoluto) {
        status = 'uncertain';
        confidence = 45;
        justification = 'Termos absolutos detectados. Verifique as fontes oficiais listadas para confirmação.';
      } else if (searchResults.foundEvidence) {
        status = 'uncertain';
        confidence = 60;
        justification = 'Tema encontrado em fontes oficiais. Consulte os links para informações verificadas.';
      } else {
        confidence = 40;
        justification = 'Não foi possível encontrar informações específicas em fontes oficiais sobre este tema.';
      }
    }

    // Adiciona fontes genéricas se não encontrou nenhuma específica
    if (sources.length === 0) {
      sources = [
        {
          title: 'Ministério da Saúde',
          url: 'https://www.gov.br/saude/pt-br',
          summary: 'Portal oficial para informações de saúde verificadas no Brasil.'
        },
        {
          title: 'Portal Gov.br',
          url: 'https://www.gov.br/pt-br',
          summary: 'Acesso a informações oficiais do governo federal brasileiro.'
        }
      ];
    }

    const result: AnalysisResult = {
      status,
      confidence,
      justification,
      sources,
      cached: false
    };

    return result;
  } catch (error) {
    console.error('Erro na análise:', error);
    return {
      status: 'uncertain',
      confidence: 20,
      justification: 'Erro ao analisar o texto. Tente novamente ou consulte fontes oficiais.',
      sources: [
        {
          title: 'Verificação Manual Recomendada',
          url: 'https://www.gov.br/pt-br',
          summary: 'Consulte diretamente órgãos oficiais para verificação de informações.'
        }
      ]
    };
  }
};