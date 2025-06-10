
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
  try {
    console.log('Calling fact-check function with text:', text.substring(0, 100) + '...');
    
    const { data, error } = await supabase.functions.invoke('fact-check', {
      body: { text }
    });

    if (error) {
      console.error('Error calling fact-check function:', error);
      throw new Error(error.message || 'Failed to analyze text');
    }

    if (!data) {
      throw new Error('No data returned from fact-check function');
    }

    console.log('Received response from fact-check function:', data);

    return {
      status: data.status || 'uncertain',
      confidence: data.confidence || 50,
      justification: data.justification || 'Análise não disponível',
      sources: data.sources || [],
      cached: data.cached || false
    };

  } catch (error) {
    console.error('Error in analyzeText:', error);
    
    // Return a fallback response instead of throwing
    return {
      status: 'uncertain',
      confidence: 30,
      justification: `Erro ao analisar o texto: ${error.message}. Tente novamente ou consulte fontes confiáveis para verificar a informação.`,
      sources: [
        {
          title: "Erro na verificação",
          url: "https://www.gov.br/",
          summary: "Ocorreu um erro técnico durante a verificação. Consulte fontes oficiais."
        }
      ]
    };
  }
};
