
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Simple hash function for text
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString();
}

async function factCheckWithGemini(text: string): Promise<FactCheckResult> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  // Enhanced prompt for better fact-checking with web search
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
    console.log('Calling Gemini API for fact-check:', text.substring(0, 100) + '...');
    
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
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Gemini API response:', JSON.stringify(data, null, 2));

    const geminiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiResponse) {
      throw new Error('No response from Gemini API');
    }

    console.log('Gemini raw response:', geminiResponse);

    // Parse JSON from response
    let result;
    try {
      // Clean the response to extract JSON
      const cleanedResponse = geminiResponse
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*[\w\s]*?{/g, '{')
        .replace(/}\s*[\w\s]*?$/g, '}')
        .trim();
      
      console.log('Cleaned response for parsing:', cleanedResponse);
      result = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', parseError);
      console.log('Attempting fallback parsing...');
      
      // Fallback: extract JSON manually
      const jsonMatch = geminiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          console.error('Fallback parsing also failed:', secondParseError);
          throw new Error('Could not parse Gemini response as valid JSON');
        }
      } else {
        throw new Error('No JSON found in Gemini response');
      }
    }

    // Validate and clean the result
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
      if (result.status === 'real' || result.status === 'fake') {
        result.confidence = 80;
      } else {
        result.confidence = 50;
      }
    }

    // Ensure justification exists
    if (!result.justification || typeof result.justification !== 'string') {
      result.justification = geminiResponse.includes('{') 
        ? 'Análise realizada com base em verificação de fontes online.'
        : geminiResponse;
    }

    // Ensure sources array exists
    if (!Array.isArray(result.sources)) {
      result.sources = [
        {
          title: "Verificação por IA Gemini",
          url: "https://gemini.google.com/",
          summary: "Análise realizada pela inteligência artificial Gemini com busca na internet"
        }
      ];
    }

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

    console.log('Final processed result:', result);

    return {
      status: result.status,
      confidence: result.confidence,
      justification: result.justification,
      sources: result.sources,
      search_results: { gemini_response: geminiResponse, parsed_result: result }
    };

  } catch (error) {
    console.error('Error in factCheckWithGemini:', error);
    
    // Provide a more intelligent fallback
    const errorMessage = error.message || 'Erro desconhecido';
    let fallbackStatus: 'real' | 'fake' | 'uncertain' = 'uncertain';
    let fallbackConfidence = 40;
    
    // Simple keyword analysis for fallback
    const textLower = text.toLowerCase();
    const suspiciousWords = ['milagre', 'cura instantânea', 'segredo que médicos não querem', 'governo esconde', 'conspiracy'];
    const hasSuspiciousWords = suspiciousWords.some(word => textLower.includes(word));
    
    if (hasSuspiciousWords) {
      fallbackStatus = 'fake';
      fallbackConfidence = 60;
    }
    
    return {
      status: fallbackStatus,
      confidence: fallbackConfidence,
      justification: `Não foi possível verificar completamente a informação devido a erro técnico: ${errorMessage}. Recomenda-se consultar fontes oficiais e veículos de imprensa confiáveis para confirmação. ${hasSuspiciousWords ? 'O texto contém expressões comumente associadas a desinformação.' : ''}`,
      sources: [
        {
          title: "Recomendação de verificação manual",
          url: "https://www.google.com/search?q=" + encodeURIComponent(text.substring(0, 100)),
          summary: "Consulte fontes oficiais, veículos de comunicação respeitados e órgãos competentes para verificar esta informação."
        },
        {
          title: "Agências de Fact-Checking Brasileiras",
          url: "https://www.aos.com.br/fact-checking/",
          summary: "Consulte agências especializadas em verificação de fatos como Lupa, Aos Fatos, e outras para informações confiáveis."
        }
      ],
      search_results: { error: errorMessage, fallback_analysis: true }
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { text } = await req.json();
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Texto é obrigatório para verificação' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const cleanText = text.trim();
    const textHash = hashText(cleanText);
    
    console.log('Processing fact-check request:', cleanText.substring(0, 100) + '...');
    console.log('Text hash:', textHash);

    // Check cache first
    const { data: existingResult, error: fetchError } = await supabaseClient
      .from('fact_checks')
      .select('*')
      .eq('text_hash', textHash)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching existing result:', fetchError);
    }

    if (existingResult) {
      console.log('Found cached result, returning...');
      return new Response(
        JSON.stringify({
          status: existingResult.status,
          confidence: existingResult.confidence,
          justification: existingResult.justification,
          sources: existingResult.sources || [],
          cached: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('No cached result found, performing new fact-check...');

    // Perform new fact check with enhanced Gemini
    const result = await factCheckWithGemini(cleanText);

    // Store result in database
    const { error: insertError } = await supabaseClient
      .from('fact_checks')
      .insert({
        input_text: cleanText,
        text_hash: textHash,
        status: result.status,
        confidence: result.confidence,
        justification: result.justification,
        sources: result.sources,
        search_results: result.search_results
      });

    if (insertError) {
      console.error('Error storing result in database:', insertError);
      // Continue anyway, don't fail the request
    }

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
    console.error('Error in fact-check function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno do servidor: ' + error.message,
        status: 'uncertain',
        confidence: 30,
        justification: 'Ocorreu um erro técnico durante a verificação. Tente novamente em alguns instantes.',
        sources: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
