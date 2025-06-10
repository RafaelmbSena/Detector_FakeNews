
import { supabase } from '@/integrations/supabase/client';

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

export const analyzeText = async (text: string): Promise<AnalysisResult> => {
  if (!text || text.trim().length === 0) {
    throw new Error('Texto não pode estar vazio');
  }

  try {
    console.log('Enviando texto para verificação:', text.substring(0, 100) + '...');
    
    const { data, error } = await supabase.functions.invoke('fact-check', {
      body: { text: text.trim() }
    });

    if (error) {
      console.error('Erro na função fact-check:', error);
      throw new Error(error.message || 'Falha ao analisar o texto');
    }

    if (!data) {
      throw new Error('Nenhum dado retornado da verificação');
    }

    console.log('Resposta recebida da verificação:', data);

    // Validate response structure
    const result: AnalysisResult = {
      status: data.status || 'uncertain',
      confidence: typeof data.confidence === 'number' ? data.confidence : 50,
      justification: data.justification || 'Análise não disponível',
      sources: Array.isArray(data.sources) ? data.sources : [],
      cached: data.cached || false
    };

    // Ensure status is valid
    if (!['real', 'fake', 'uncertain'].includes(result.status)) {
      result.status = 'uncertain';
    }

    // Ensure confidence is within valid range
    if (result.confidence < 0 || result.confidence > 100) {
      result.confidence = 50;
    }

    return result;

  } catch (error) {
    console.error('Erro em analyzeText:', error);
    
    // Return a user-friendly error response
    return {
      status: 'uncertain',
      confidence: 30,
      justification: `Erro ao verificar a informação: ${error.message}. Verifique sua conexão com a internet e tente novamente. Se o problema persistir, consulte fontes confiáveis como veículos de imprensa respeitados e órgãos oficiais.`,
      sources: [
        {
          title: "Google - Pesquisa sobre o assunto",
          url: `https://www.google.com/search?q=${encodeURIComponent(text.substring(0, 100))}`,
          summary: "Faça uma pesquisa no Google para encontrar informações atualizadas sobre este assunto"
        },
        {
          title: "Verificação Manual Recomendada",
          url: "https://www.gov.br/",
          summary: "Consulte sites oficiais do governo, universidades e veículos de imprensa confiáveis para verificar a informação"
        }
      ]
    };
  }
};
