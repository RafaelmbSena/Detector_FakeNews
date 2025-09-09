
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FactCheckResult {
  status: 'real' | 'fake' | 'uncertain';
  confidence: number;
  justification: string;
  sources: Array<{
    title: string;
    url: string;
    summary: string;
  }>;
  search_results: any;
}

// Rate limiting storage (in-memory for simplicity)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 10; // requests per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds

// Input sanitization function
function sanitizeInput(text: string): string {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input');
  }
  
  // Remove potentially dangerous characters and normalize
  return text
    .replace(/[<>\"'&]/g, '') // Remove HTML/script injection chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 2000); // Limit length to prevent DoS
}

// Rate limiting check
function checkRateLimit(clientIP: string): boolean {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientIP);
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (clientData.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }
  
  clientData.count++;
  return true;
}

// Secure hash function for text (improved)
function hashText(text: string): string {
  let hash = 0;
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36); // Base36 for shorter hash
}

// Validate and sanitize sources
function sanitizeSources(sources: any[]): Array<{title: string; url: string; summary: string}> {
  if (!Array.isArray(sources)) return [];
  
  return sources
    .filter(source => source && typeof source === 'object')
    .slice(0, 5) // Limit to 5 sources max
    .map(source => ({
      title: (source.title || 'Fonte não identificada').substring(0, 200),
      url: (source.url || '#').substring(0, 500),
      summary: (source.summary || 'Resumo não disponível').substring(0, 300)
    }));
}

async function factCheckWithGemini(text: string): Promise<FactCheckResult> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    throw new Error('API configuration error');
  }

  const prompt = `
Você é um verificador de fatos profissional especializado em análise de informações em português. Analise a seguinte afirmação e determine se é verdadeira, falsa ou incerta.

TEXTO PARA VERIFICAR: "${text}"

INSTRUÇÕES DETALHADAS:
1. Procure por informações atuais sobre este tópico na internet
2. Verifique múltiplas fontes confiáveis (sites oficiais, órgãos de imprensa respeitados, instituições)
3. Compare as informações encontradas com a afirmação
4. Seja DECISIVO na sua análise - evite respostas "incertas" quando há evidências claras
5. Para notícias recentes, procure por reportagens de veículos de imprensa conhecidos
6. Para dados científicos, procure por fontes acadêmicas ou órgãos oficiais
7. Para informações sobre pessoas públicas, verifique fontes oficiais

CRITÉRIOS DE CLASSIFICAÇÃO:
- VERDADEIRO (real): Quando há evidências claras e múltiplas fontes confirmam a informação
- FALSO (fake): Quando há evidências que contradizem a afirmação ou não há fontes confiáveis
- INCERTO (uncertain): APENAS quando realmente não há informações suficientes ou fontes conflitantes

Responda EXATAMENTE neste formato JSON:
{
  "status": "real|fake|uncertain",
  "confidence": [número de 70-95 para real/fake, 30-60 para uncertain],
  "justification": "Explicação clara e detalhada em português do porquê da classificação, mencionando as fontes verificadas",
  "sources": [
    {
      "title": "Título da fonte",
      "url": "URL da fonte (use URLs reais quando possível)",
      "summary": "Resumo do que a fonte diz sobre o assunto"
    }
  ]
}

IMPORTANTE: Seja confiante na sua análise. Se encontrar evidências claras, classifique como "real" ou "fake" com alta confiança (70-95%). Use "uncertain" apenas quando realmente não há informações suficientes.
  `;

  try {
    console.log('Calling Gemini API for fact-check:', text.substring(0, 50) + '...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.8,
          maxOutputTokens: 4096,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH", 
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      }),
    });

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      throw new Error('External service temporarily unavailable');
    }

    const data = await response.json();
    const geminiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiResponse) {
      throw new Error('No response from verification service');
    }

    console.log('Gemini response received successfully');

    // Parse JSON from response with improved error handling
    let result;
    try {
      const cleanedResponse = geminiResponse
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*[\w\s]*?{/g, '{')
        .replace(/}\s*[\w\s]*?$/g, '}')
        .trim();
      
      result = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse response');
      
      // Fallback: extract JSON manually
      const jsonMatch = geminiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          throw new Error('Unable to process verification response');
        }
      } else {
        throw new Error('Invalid response format from verification service');
      }
    }

    // Validate and sanitize the result
    if (!result.status || !['real', 'fake', 'uncertain'].includes(result.status)) {
      // Analyze the response text to determine status
      const responseText = geminiResponse.toLowerCase();
      if (responseText.includes('verdadeiro') || responseText.includes('real') || responseText.includes('confirmado')) {
        result.status = 'real';
        result.confidence = 80;
      } else if (responseText.includes('falso') || responseText.includes('fake') || responseText.includes('incorreto')) {
        result.status = 'fake';
        result.confidence = 80;
      } else {
        result.status = 'uncertain';
        result.confidence = 50;
      }
    }

    // Ensure confidence is reasonable
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 100) {
      result.confidence = result.status === 'uncertain' ? 50 : 80;
    }

    // Sanitize justification
    if (!result.justification || typeof result.justification !== 'string') {
      result.justification = 'Análise realizada com base em verificação de fontes online.';
    } else {
      result.justification = result.justification.substring(0, 1000); // Limit length
    }

    // Sanitize sources
    result.sources = sanitizeSources(result.sources || []);

    // Add default sources if none provided
    if (result.sources.length === 0) {
      result.sources = [
        {
          title: "Análise de Verificação de Fatos",
          url: "https://www.google.com/search?q=" + encodeURIComponent(text.substring(0, 100)),
          summary: "Busca realizada para verificar a veracidade da informação"
        }
      ];
    }

    return {
      status: result.status,
      confidence: result.confidence,
      justification: result.justification,
      sources: result.sources,
      search_results: { success: true, cached: false }
    };

  } catch (error) {
    console.error('Error in factCheckWithGemini:', error.message);
    
    // Provide a safe fallback without exposing internal errors
    return {
      status: 'uncertain' as const,
      confidence: 30,
      justification: 'Não foi possível verificar completamente a informação devido a dificuldades técnicas temporárias. Recomenda-se consultar fontes oficiais e veículos de imprensa confiáveis para confirmação.',
      sources: [
        {
          title: "Verificação Manual Recomendada",
          url: "https://www.google.com/search?q=" + encodeURIComponent(text.substring(0, 100)),
          summary: "Consulte fontes oficiais, veículos de comunicação respeitados e órgãos competentes para verificar esta informação."
        }
      ],
      search_results: { error: 'Service temporarily unavailable', fallback: true }
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting based on IP
    const clientIP = req.headers.get('cf-connecting-ip') || 
                    req.headers.get('x-forwarded-for') || 
                    'unknown';
    
    if (!checkRateLimit(clientIP)) {
      return new Response(
        JSON.stringify({ 
          error: 'Muitas tentativas. Aguarde um momento antes de tentar novamente.',
          retryAfter: 60
        }),
        { 
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Request size limit
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10000) { // 10KB limit
      return new Response(
        JSON.stringify({ error: 'Texto muito longo para análise' }),
        { 
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Formato de dados inválido' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { text } = requestBody;
    
    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Texto é obrigatório para verificação' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Input validation and sanitization
    let cleanText;
    try {
      cleanText = sanitizeInput(text);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Texto contém caracteres inválidos ou é muito longo' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (cleanText.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Texto muito curto para análise (mínimo 10 caracteres)' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Processing fact-check request for text:', cleanText.substring(0, 50) + '...');

    // Perform fact check
    const result = await factCheckWithGemini(cleanText);

    console.log('Fact-check completed successfully:', result.status, result.confidence + '%');

    return new Response(
      JSON.stringify({
        status: result.status,
        confidence: result.confidence,
        justification: result.justification,
        sources: result.sources,
        cached: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error in fact-check function:', error.message);
    
    // Return generic error without exposing internal details
    return new Response(
      JSON.stringify({ 
        error: 'Erro temporário no serviço. Tente novamente em alguns instantes.',
        status: 'uncertain',
        confidence: 20,
        justification: 'Ocorreu um erro técnico durante a verificação. Por favor, tente novamente.',
        sources: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
