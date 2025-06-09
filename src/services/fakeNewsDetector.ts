
interface AnalysisResult {
  status: 'real' | 'fake' | 'uncertain';
  confidence: number;
  justification: string;
  sources?: Array<{
    title: string;
    url: string;
    summary: string;
  }>;
}

// Simulação de análise de IA para fake news
export const analyzeText = async (text: string): Promise<AnalysisResult> => {
  // Simula tempo de processamento
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

  // Lista de palavras-chave suspeitas comumente encontradas em fake news
  const suspiciousKeywords = [
    'urgente', 'queimado', 'médicos odeiam', 'descoberta revolucionária',
    'governo esconde', 'mídia não mostra', 'compartilhe antes que deletem',
    'verdade que eles não querem', 'cientistas comprovam', 'estudo secreto',
    'exclusivo', 'bomba', 'revelação chocante', 'conspiração'
  ];

  // Lista de fontes confiáveis
  const reliableSources = [
    'g1.globo.com', 'folha.uol.com.br', 'estadao.com.br', 'bbc.com',
    'reuters.com', 'agenciabrasil.ebc.com.br', 'cnn.com.br'
  ];

  const textLower = text.toLowerCase();
  
  // Verifica presença de palavras suspeitas
  const suspiciousCount = suspiciousKeywords.filter(keyword => 
    textLower.includes(keyword)
  ).length;

  // Simula verificação de fontes
  const hasReliableSource = reliableSources.some(source => 
    textLower.includes(source)
  );

  // Análise básica de padrões
  const hasExcessiveEmojis = (text.match(/[😀-🙏]/g) || []).length > 5;
  const hasExcessiveCaps = (text.match(/[A-Z]/g) || []).length / text.length > 0.3;
  const hasMultipleExclamations = (text.match(/!/g) || []).length > 3;

  // Simula diferentes cenários de resultado
  const scenarios = [
    // Cenário 1: Texto com muitas palavras suspeitas
    {
      condition: suspiciousCount >= 2,
      result: {
        status: 'fake' as const,
        confidence: 85,
        justification: `O texto contém ${suspiciousCount} termo(s) frequentemente associados a desinformação, como linguagem sensacionalista e apelos emocionais típicos de fake news. Não foram encontradas fontes confiáveis confirmando as informações.`,
        sources: [
          {
            title: "Aos Fatos - Como identificar fake news",
            url: "https://aosfatos.org/",
            summary: "Guia completo sobre como identificar notícias falsas e verificar informações."
          },
          {
            title: "Agência Lupa - Verificação de fatos",
            url: "https://lupa.news/",
            summary: "Serviço de fact-checking que verifica a veracidade de informações em circulação."
          }
        ]
      }
    },
    // Cenário 2: Texto com fonte confiável
    {
      condition: hasReliableSource,
      result: {
        status: 'real' as const,
        confidence: 90,
        justification: "O texto faz referência a fontes jornalísticas estabelecidas e confiáveis. A linguagem é factual e não apresenta características típicas de desinformação.",
        sources: [
          {
            title: "Verificação em veículo confiável",
            url: "https://g1.globo.com/",
            summary: "Informação confirmada por veículo de comunicação com histórico de credibilidade."
          }
        ]
      }
    },
    // Cenário 3: Texto com padrões suspeitos
    {
      condition: hasExcessiveEmojis || hasExcessiveCaps || hasMultipleExclamations,
      result: {
        status: 'uncertain' as const,
        confidence: 65,
        justification: "O texto apresenta características de formatação (uso excessivo de maiúsculas, emojis ou exclamações) que são comuns em desinformação, mas o conteúdo não pode ser definitivamente classificado sem verificação adicional.",
        sources: [
          {
            title: "Como identificar fake news - Ministério da Saúde",
            url: "https://www.gov.br/",
            summary: "Orientações oficiais sobre como identificar e combater a desinformação."
          }
        ]
      }
    },
    // Cenário padrão
    {
      condition: true,
      result: {
        status: 'uncertain' as const,
        confidence: Math.floor(Math.random() * 40) + 50, // 50-90%
        justification: "Não foi possível verificar completamente a veracidade da informação. Recomenda-se consultar fontes oficiais e veículos de comunicação confiáveis para confirmação.",
        sources: [
          {
            title: "Fato ou Fake - G1",
            url: "https://g1.globo.com/fato-ou-fake/",
            summary: "Serviço de checagem de fatos que verifica informações que circulam nas redes sociais."
          },
          {
            title: "Projeto Comprova",
            url: "https://projetocomprova.com.br/",
            summary: "Iniciativa colaborativa de fact-checking entre veículos de comunicação brasileiros."
          }
        ]
      }
    }
  ];

  // Retorna o primeiro cenário que se aplica
  for (const scenario of scenarios) {
    if (scenario.condition) {
      return scenario.result;
    }
  }

  // Fallback (nunca deve chegar aqui devido ao cenário padrão)
  return scenarios[scenarios.length - 1].result;
};
