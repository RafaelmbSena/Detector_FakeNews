// Serviço para pesquisa web em fontes confiáveis brasileiras
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface WebSearchResponse {
  results: SearchResult[];
  foundOfficialSources: boolean;
}

// Lista de domínios oficiais e confiáveis brasileiros
const DOMINIOS_CONFIAVEIS = [
  'gov.br',
  'anvisa.gov.br',
  'butantan.gov.br', 
  'fiocruz.br',
  'saude.gov.br',
  'ibge.gov.br',
  'inpe.br',
  'bcb.gov.br',
  'capes.gov.br',
  'cnpq.br',
  'ibama.gov.br',
  'mec.gov.br'
];

// Simula pesquisa web focada em fontes oficiais brasileiras
export const searchOfficialSources = async (query: string): Promise<WebSearchResponse> => {
  try {
    // Constrói query específica para sites oficiais brasileiros
    const officialQuery = `"${query}" ${DOMINIOS_CONFIAVEIS.map(d => `site:${d}`).join(' OR ')}`;
    
    console.log('Pesquisando:', officialQuery);
    
    // Por enquanto, retorna fontes baseadas no conteúdo da query
    // Em produção, isso faria uma chamada real para API de pesquisa
    const results = generateRelevantSources(query);
    
    return {
      results,
      foundOfficialSources: results.length > 0
    };
  } catch (error) {
    console.error('Erro na pesquisa web:', error);
    return {
      results: [],
      foundOfficialSources: false
    };
  }
};

// Gera fontes relevantes baseadas no conteúdo da pesquisa
function generateRelevantSources(query: string): SearchResult[] {
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];
  
  // Temas de saúde e medicina
  if (lowerQuery.match(/(saúde|doença|vírus|vacina|covid|gripe|câncer|medicina|tratamento|cura|remédio|medicamento)/)) {
    results.push({
      title: 'Ministério da Saúde - Informações Oficiais sobre Saúde',
      url: 'https://www.gov.br/saude/pt-br',
      snippet: 'Portal oficial com informações verificadas sobre saúde pública, doenças, tratamentos e medicamentos aprovados no Brasil.',
      domain: 'gov.br'
    });
    
    if (lowerQuery.match(/(vacina|imunização|vacinação)/)) {
      results.push({
        title: 'ANVISA - Vacinas e Medicamentos Aprovados',
        url: 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/vacinas',
        snippet: 'Informações oficiais sobre vacinas aprovadas, estudos clínicos e segurança de medicamentos.',
        domain: 'anvisa.gov.br'
      });
    }
    
    if (lowerQuery.match(/(covid|coronavirus|sars|pandemia)/)) {
      results.push({
        title: 'Fiocruz - Dados Científicos COVID-19',
        url: 'https://portal.fiocruz.br/covid-19-perguntas-e-respostas',
        snippet: 'Pesquisas científicas, dados epidemiológicos e informações verificadas sobre COVID-19 no Brasil.',
        domain: 'fiocruz.br'
      });
    }
  }
  
  // Temas ambientais e climáticos
  if (lowerQuery.match(/(amazônia|desmatamento|meio ambiente|clima|aquecimento|floresta|biodiversidade)/)) {
    results.push({
      title: 'INPE - Monitoramento da Amazônia',
      url: 'https://www.gov.br/inpe/pt-br/composicao/diretoria/coadministracao/coordenacao-geral-de-observacao-da-terra/programa-amazonia',
      snippet: 'Dados oficiais de desmatamento, queimadas e monitoramento ambiental da Amazônia via satélite.',
      domain: 'inpe.br'
    });
    
    results.push({
      title: 'IBAMA - Fiscalização Ambiental',
      url: 'https://www.gov.br/ibama/pt-br',
      snippet: 'Informações sobre fiscalização ambiental, unidades de conservação e políticas de proteção.',
      domain: 'ibama.gov.br'
    });
  }
  
  // Temas econômicos e financeiros
  if (lowerQuery.match(/(economia|inflação|pib|desemprego|juros|banco central|real|dólar|moeda)/)) {
    results.push({
      title: 'Banco Central - Indicadores Econômicos',
      url: 'https://www.bcb.gov.br/estatisticas',
      snippet: 'Dados oficiais sobre inflação, PIB, taxa de juros, câmbio e outros indicadores econômicos.',
      domain: 'bcb.gov.br'
    });
    
    results.push({
      title: 'IBGE - Estatísticas Nacionais',
      url: 'https://www.ibge.gov.br/estatisticas',
      snippet: 'Censos, pesquisas demográficas, dados de emprego e estatísticas socioeconômicas oficiais.',
      domain: 'ibge.gov.br'
    });
  }
  
  // Educação e ciência
  if (lowerQuery.match(/(educação|escola|universidade|ciência|pesquisa|enem|vestibular)/)) {
    results.push({
      title: 'MEC - Ministério da Educação',
      url: 'https://www.gov.br/mec/pt-br',
      snippet: 'Políticas educacionais, dados sobre ensino superior e básico, ENEM e programas educacionais.',
      domain: 'mec.gov.br'
    });
    
    results.push({
      title: 'CAPES - Portal de Periódicos Científicos',
      url: 'https://www.periodicos.capes.gov.br/',
      snippet: 'Acesso a publicações científicas verificadas e pesquisas acadêmicas de instituições brasileiras.',
      domain: 'capes.gov.br'
    });
  }
  
  return results.slice(0, 4); // Limita a 4 resultados mais relevantes
}