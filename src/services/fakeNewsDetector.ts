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

// Função para pesquisar em fontes confiáveis usando websearch
async function pesquisarFontesConfiaveis(texto: string): Promise<{
  sources: Array<{ title: string; url: string; summary: string; }>;
  foundEvidence: boolean;
  evidenceType: 'supporting' | 'contradicting' | 'mixed' | 'none';
}> {
  try {
    // Busca em sites oficiais brasileiros usando o serviço web
    const searchResponse = await searchOfficialSources(texto);
    
    // Converte os resultados para o formato esperado
    const sources = searchResponse.results.map((result: SearchResult) => ({
      title: result.title,
      url: result.url,
      summary: result.snippet
    }));
    
    return {
      sources: sources,
      foundEvidence: searchResponse.foundOfficialSources,
      evidenceType: searchResponse.foundOfficialSources ? 'supporting' : 'none'
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