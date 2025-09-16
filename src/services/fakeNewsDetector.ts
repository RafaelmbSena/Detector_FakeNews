


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

    // Regras simples (análise local, 100% em português)
    const absolutos = [
      /100%/, /\bsempre\b/, /\bnunca\b/, /garant(e|ia|em)/,
      /cura(r|s|mos|m|do|da)?/, /previne( totalmente)?/, /definitiv(o|a)/,
    ];
    const causalMedica = /(cura|previne|trata|elimina)\s+(\w+\s+){0,3}(doen[cç]a|v[íi]rus|virus|gripe|c[aá]ncer|covid)/;

    // Pequena base de fatos estáveis (exemplos)
    const fatosConhecidos: Array<{ pattern: RegExp; justificativa: string }> = [
      {
        pattern: /(\bo\s+)?amazonas\b.*(maior\s+estado).*brasil|maior\s+estado\s+do\s+brasil.*amazonas/,
        justificativa: 'O Amazonas é reconhecido como o maior estado brasileiro por área.'
      },
      {
        pattern: /bras[íi]lia.*(utc[−-]3|gmt[−-]3|utc\s*-\s*3)/,
        justificativa: 'Brasília adota o fuso horário UTC−3 (horário de Brasília).'
      }
    ];

    let status: 'real' | 'fake' | 'uncertain' = 'uncertain';
    let confidence = 45;
    let justification = 'Análise local: não há evidências suficientes no texto para confirmação.';

    // Verifica fatos conhecidos
    for (const f of fatosConhecidos) {
      if (f.pattern.test(lower)) {
        status = 'real';
        confidence = 80;
        justification = f.justificativa;
        break;
      }
    }

    // Sinais de desinformação (absolutos + causal médica)
    if (status === 'uncertain') {
      const temAbsoluto = absolutos.some((r) => r.test(lower));
      const temCausalMedica = causalMedica.test(lower);

      if (temAbsoluto && temCausalMedica) {
        status = 'fake';
        confidence = 85;
        justification = 'Afirmação absoluta de cura/prevenção sem evidências verificáveis é típica de desinformação.';
      } else if (temAbsoluto) {
        status = 'uncertain';
        confidence = 40;
        justification = 'Uso de termos absolutos (“100%”, “sempre”, “nunca”, “cura/previne totalmente”) sem dados verificáveis.';
      }
    }

    const result: AnalysisResult = {
      status,
      confidence,
      justification,
      sources: [
        {
          title: 'Pesquisa no Google (assunto)',
          url: `https://www.google.com/search?q=${encodeURIComponent(cleanText.substring(0, 100))}`,
          summary: 'Resultados para verificação independente do tema.'
        },
        {
          title: 'Verificação Manual Recomendada',
          url: 'https://www.gov.br/',
          summary: 'Consulte órgãos oficiais e veículos de imprensa confiáveis.'
        }
      ],
      cached: false
    };

    return result;
  } catch (error) {
    // Fallback seguro caso a análise local gere alguma exceção
    return {
      status: 'uncertain',
      confidence: 20,
      justification: 'Ocorreu um erro na análise local. Tente novamente.',
      sources: []
    };
  }
};
