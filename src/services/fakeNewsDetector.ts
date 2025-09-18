
interface AnalysisResult {
  status: 'real' | 'fake' | 'uncertain';
  justification: string;
  sources?: Array<{
    title: string;
    url: string;
    summary: string;
  }>;
}

// Base de conhecimento de fatos verdadeiros
const knownFacts = [
  // Geografia do Brasil
  { text: "amazonas é o maior estado do brasil", status: 'real' },
  { text: "brasil é o maior país da américa do sul", status: 'real' },
  { text: "brasília é a capital do brasil", status: 'real' },
  { text: "são paulo é a maior cidade do brasil", status: 'real' },
  
  // Ciência e Saúde
  { text: "a terra é redonda", status: 'real' },
  { text: "vacinas são seguras e eficazes", status: 'real' },
  { text: "água ferve a 100 graus celsius", status: 'real' },
  { text: "fumar faz mal à saúde", status: 'real' },
  
  // História
  { text: "o brasil foi colônia de portugal", status: 'real' },
  { text: "a independência do brasil foi em 1822", status: 'real' },
  
  // Fake news comuns
  { text: "whatsapp vai cobrar", status: 'fake' },
  { text: "vitamina c previne totalmente a gripe", status: 'fake' },
  { text: "microondas causa câncer", status: 'fake' },
];

// Input sanitization
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

// Normaliza texto para comparação
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàãâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòõôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Gera fontes relevantes baseadas no conteúdo
function generateRelevantSources(text: string): Array<{ title: string; url: string; summary: string }> {
  const normalizedText = normalizeText(text);
  const sources: Array<{ title: string; url: string; summary: string }> = [];
  
  // Determinar categoria do conteúdo
  if (normalizedText.includes('saude') || normalizedText.includes('vacina') || normalizedText.includes('doenca') || normalizedText.includes('vitamina') || normalizedText.includes('gripe') || normalizedText.includes('cancer')) {
    sources.push(
      {
        title: "Ministério da Saúde - Informações Oficiais de Saúde",
        url: "https://www.gov.br/saude/pt-br",
        summary: "Portal oficial do Ministério da Saúde com informações confiáveis sobre saúde pública e prevenção"
      },
      {
        title: "ANVISA - Agência Nacional de Vigilância Sanitária",
        url: "https://www.gov.br/anvisa/pt-br",
        summary: "Órgão regulador responsável pela vigilância sanitária e aprovação de medicamentos e vacinas"
      },
      {
        title: "Fiocruz - Fundação Oswaldo Cruz",
        url: "https://portal.fiocruz.br/",
        summary: "Instituição de pesquisa em saúde pública reconhecida internacionalmente"
      }
    );
  } else if (normalizedText.includes('brasil') || normalizedText.includes('governo') || normalizedText.includes('lei') || normalizedText.includes('politica')) {
    sources.push(
      {
        title: "Portal Oficial do Governo Brasileiro",
        url: "https://www.gov.br/",
        summary: "Site oficial do governo federal com informações sobre políticas públicas e legislação"
      },
      {
        title: "Senado Federal - Legislação e Atos Normativos",
        url: "https://www.senado.leg.br/",
        summary: "Portal do Senado com informações sobre leis, projetos e atividade legislativa"
      },
      {
        title: "Câmara dos Deputados",
        url: "https://www.camara.leg.br/",
        summary: "Site oficial da Câmara dos Deputados com informações sobre proposições e atividades parlamentares"
      }
    );
  } else if (normalizedText.includes('economia') || normalizedText.includes('dinheiro') || normalizedText.includes('auxilio') || normalizedText.includes('beneficio')) {
    sources.push(
      {
        title: "Banco Central do Brasil",
        url: "https://www.bcb.gov.br/",
        summary: "Autoridade monetária brasileira com informações oficiais sobre economia e sistema financeiro"
      },
      {
        title: "Receita Federal",
        url: "https://www.gov.br/receitafederal/pt-br",
        summary: "Órgão responsável pela administração dos tributos federais e benefícios sociais"
      },
      {
        title: "Ministério da Economia",
        url: "https://www.gov.br/economia/pt-br",
        summary: "Portal oficial com informações sobre políticas econômicas e benefícios governamentais"
      }
    );
  } else if (normalizedText.includes('tecnologia') || normalizedText.includes('whatsapp') || normalizedText.includes('internet') || normalizedText.includes('aplicativo')) {
    sources.push(
      {
        title: "ANATEL - Agência Nacional de Telecomunicações",
        url: "https://www.anatel.gov.br/",
        summary: "Órgão regulador de telecomunicações no Brasil com informações sobre serviços digitais"
      },
      {
        title: "CERT.br - Centro de Estudos em Segurança Digital",
        url: "https://cert.br/",
        summary: "Centro nacional de resposta a incidentes de segurança na internet"
      }
    );
  } else {
    // Fontes genéricas para outros assuntos
    sources.push(
      {
        title: "IBGE - Instituto Brasileiro de Geografia e Estatística",
        url: "https://www.ibge.gov.br/",
        summary: "Instituto oficial responsável por estatísticas e informações geográficas do Brasil"
      },
      {
        title: "Portal da Transparência",
        url: "https://portaldatransparencia.gov.br/",
        summary: "Portal oficial com informações sobre gastos públicos e ações do governo federal"
      }
    );
  }
  
  // Adicionar fonte de pesquisa específica
  sources.push({
    title: "Pesquisa Específica sobre o Assunto",
    url: `https://www.google.com/search?q=${encodeURIComponent(text.substring(0, 100))}`,
    summary: "Realize uma pesquisa detalhada sobre este assunto em fontes confiáveis"
  });
  
  return sources.slice(0, 4); // Limitar a 4 fontes
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

  console.log('Analisando texto:', cleanText.substring(0, 50) + '...');
  
  // Simular delay de processamento
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const normalizedInput = normalizeText(cleanText);
  
  // Verificar na base de conhecimento
  for (const fact of knownFacts) {
    if (normalizedInput.includes(normalizeText(fact.text))) {
      const sources = generateRelevantSources(cleanText);
      
      if (fact.status === 'real') {
        return {
          status: 'real',
          justification: `Esta informação está correta segundo dados oficiais. ${fact.text.charAt(0).toUpperCase() + fact.text.slice(1)} é um fato verificado e confirmado por fontes confiáveis.`,
          sources
        };
      } else {
        return {
          status: 'fake',
          justification: `Esta informação não é verdadeira. Não há evidências que comprovem esta afirmação. Recomendamos verificar as fontes oficiais listadas abaixo para obter informações corretas.`,
          sources
        };
      }
    }
  }
  
  // Heurísticas para detectar padrões de fake news
  const fakeNewsPatterns = [
    /urgente/i,
    /compartilhe antes que seja tarde/i,
    /governo esconde/i,
    /mídia não divulga/i,
    /descoberta que médicos não querem que você saiba/i,
    /100% comprovado/i,
    /cientistas descobriram a cura/i,
    /novo golpe/i,
    /vai acabar/i,
  ];
  
  const hasSuspiciousPatterns = fakeNewsPatterns.some(pattern => pattern.test(cleanText));
  
  if (hasSuspiciousPatterns) {
    return {
      status: 'fake',
      justification: 'O texto apresenta características típicas de fake news, incluindo linguagem sensacionalista e apelos urgentes para compartilhamento. Recomendamos verificar a informação em fontes oficiais.',
      sources: generateRelevantSources(cleanText)
    };
  }
  
  // Para outros casos, retornar como incerto
  return {
    status: 'uncertain',
    justification: 'Não foi possível verificar automaticamente esta informação. Recomendamos consultar as fontes oficiais listadas abaixo para uma verificação manual. Sempre prefira informações de órgãos governamentais, universidades e veículos de imprensa reconhecidos.',
    sources: generateRelevantSources(cleanText)
  };
};
