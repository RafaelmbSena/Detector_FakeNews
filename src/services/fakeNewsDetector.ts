


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
    console.log('Enviando texto para verificação (primeiros 50 chars):', cleanText.substring(0, 50) + '...');
    
    const response = await fetch('https://qcffnueckcyhgmzosooy.supabase.co/functions/v1/fact-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZmZudWVja2N5aGdtem9zb295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0OTgxODAsImV4cCI6MjA2NTA3NDE4MH0.03-pDWzivWR6hUVy-WqEba5iFvNRTNQOXlBP9EWaZ9U'
      },
      body: JSON.stringify({ text: cleanText })
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Muitas tentativas. Aguarde um momento antes de tentar novamente.');
      }
      if (response.status === 413) {
        throw new Error('Texto muito longo para análise.');
      }
      throw new Error('Falha temporária na verificação. Tente novamente em alguns instantes.');
    }

    const data = await response.json();

    if (!data) {
      throw new Error('Nenhum dado retornado da verificação');
    }

    console.log('Resposta recebida da verificação');

    // Validate and sanitize response
    const result: AnalysisResult = {
      status: ['real', 'fake', 'uncertain'].includes(data.status) ? data.status : 'uncertain',
      confidence: typeof data.confidence === 'number' && data.confidence >= 0 && data.confidence <= 100 
        ? data.confidence : 50,
      justification: typeof data.justification === 'string' 
        ? data.justification.substring(0, 1000) 
        : 'Análise não disponível',
      sources: Array.isArray(data.sources) ? data.sources.slice(0, 5) : [],
      cached: false
    };

    return result;

  } catch (error) {
    console.error('Erro em analyzeText:', error);
    
    // Return a user-friendly error response without exposing internal details
    const errorMessage = error.message || 'Erro desconhecido';
    
    return {
      status: 'uncertain',
      confidence: 20,
      justification: `Não foi possível verificar a informação: ${errorMessage}. Verifique sua conexão com a internet e tente novamente. Se o problema persistir, consulte fontes confiáveis como veículos de imprensa respeitados e órgãos oficiais.`,
      sources: [
        {
          title: "Google - Pesquisa sobre o assunto",
          url: `https://www.google.com/search?q=${encodeURIComponent(cleanText.substring(0, 100))}`,
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
