
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

async function searchWithGemini(text: string): Promise<FactCheckResult> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  const prompt = `
  You are a professional fact-checker. Analyze the following text and determine if it's real, fake, or uncertain.

  Text to analyze: "${text}"

  Please:
  1. Search for current information about this topic
  2. Verify claims against reliable sources
  3. Determine if the information is real, fake, or uncertain
  4. Provide a confidence level (0-100)
  5. Give a detailed justification
  6. List reliable sources that support your conclusion

  Respond in the following JSON format:
  {
    "status": "real|fake|uncertain",
    "confidence": number,
    "justification": "detailed explanation",
    "sources": [
      {
        "title": "source title",
        "url": "source url",
        "summary": "brief summary"
      }
    ]
  }
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
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
          topP: 1,
          maxOutputTokens: 2048,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const geminiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiResponse) {
      throw new Error('No response from Gemini');
    }

    console.log('Gemini response:', geminiResponse);

    // Try to parse JSON from response
    let result;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = geminiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', parseError);
      
      // Fallback: analyze response manually
      const responseText = geminiResponse.toLowerCase();
      let status: 'real' | 'fake' | 'uncertain' = 'uncertain';
      let confidence = 50;
      
      if (responseText.includes('fake') || responseText.includes('false') || responseText.includes('misinformation')) {
        status = 'fake';
        confidence = 75;
      } else if (responseText.includes('true') || responseText.includes('accurate') || responseText.includes('verified')) {
        status = 'real';
        confidence = 75;
      }

      result = {
        status,
        confidence,
        justification: geminiResponse,
        sources: [
          {
            title: "Análise por IA Gemini",
            url: "https://ai.google.dev/",
            summary: "Análise realizada pela inteligência artificial Gemini do Google"
          }
        ]
      };
    }

    // Ensure required fields exist
    if (!result.status || !['real', 'fake', 'uncertain'].includes(result.status)) {
      result.status = 'uncertain';
    }
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 100) {
      result.confidence = 50;
    }
    if (!result.justification) {
      result.justification = geminiResponse || 'Análise realizada pela IA';
    }
    if (!Array.isArray(result.sources)) {
      result.sources = [];
    }

    return {
      ...result,
      search_results: { gemini_response: geminiResponse }
    };

  } catch (error) {
    console.error('Error with Gemini API:', error);
    
    // Fallback analysis
    return {
      status: 'uncertain',
      confidence: 30,
      justification: `Não foi possível verificar completamente a informação devido a um erro técnico: ${error.message}. Recomenda-se consultar fontes oficiais para confirmação.`,
      sources: [
        {
          title: "Recomendação de verificação manual",
          url: "https://www.gov.br/",
          summary: "Consulte fontes oficiais e veículos de comunicação confiáveis para verificar esta informação."
        }
      ],
      search_results: { error: error.message }
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
        JSON.stringify({ error: 'Text is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const textHash = hashText(text.trim());
    
    console.log('Checking for existing analysis with hash:', textHash);

    // Check if we already have this analysis cached
    const { data: existingResult, error: fetchError } = await supabaseClient
      .from('fact_checks')
      .select('*')
      .eq('text_hash', textHash)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching existing result:', fetchError);
    }

    if (existingResult) {
      console.log('Found cached result');
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

    console.log('No cached result found, performing new analysis');

    // Perform new fact check
    const result = await searchWithGemini(text);

    // Store result in database
    const { error: insertError } = await supabaseClient
      .from('fact_checks')
      .insert({
        input_text: text,
        text_hash: textHash,
        status: result.status,
        confidence: result.confidence,
        justification: result.justification,
        sources: result.sources,
        search_results: result.search_results
      });

    if (insertError) {
      console.error('Error inserting result:', insertError);
    }

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
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
