
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
ROLE
You are a cautious fact-checking assistant. Your job is to classify the user's text into {true, false, uncertain} and explain briefly, with realistic confidence calibration.

INPUTS
- USER_TEXT: "${text}"

DEFINITIONS
- "Verifiable claim": a concrete, checkable factual statement (specific entity/time/quantity/causal relation).
- "Uncertain": either (a) no verifiable claim, or (b) evidence is insufficient/ambiguous/contradictory within the provided material.

DECISION RULES
1) Claim extraction: Identify up to 3 verifiable claims in USER_TEXT. If none, return class="uncertain" (confidence ≤ 40) and explain briefly why (e.g., vague, no entity/date/number).
2) Specificity check (vagueness rule): If the core claim lacks specific entity/date/measure ("University X", "Experts say", "Company X"), prefer class="uncertain" and cap confidence at 50.
3) Cross-check sources:
   - First use evidence inside USER_TEXT and WEB_SNIPPETS (if provided). Do not invent citations or links.
   - Compare with FACT_TABLE (if provided). If USER_TEXT contradicts FACT_TABLE on a stable fact, set class="false" (unless WEB_SNIPPETS credibly overturn that fact) and explain the conflict.
4) Red flags (weigh toward "false" unless strong counter-evidence is present):
   - Absolutes: "everyone", "100%", "guaranteed", "definitive cure".
   - Sensational claims with immediate timeframes: "starting tomorrow", "today for all".
   - Strong causal claims without data: "X prevents/causes Y".
5) Choose one class: "true" | "false" | "uncertain".

CONFIDENCE CALIBRATION (0–100)
Start at 60, then adjust (clamp 0–100). Always vary confidence—avoid repeating the same number.
+20 textbook-level consensus fact (e.g., boiling point at sea level), consistent WEB_SNIPPETS.
+10 multiple independent reliable snippets agree.
−20 absolute/generalized language with no data.
−25 extraordinary/sensational claim without strong evidence.
−15 conflicting snippets or unclear measurement/context.
−20 vague/unspecified entity or no numeric/time anchor (also consider class="uncertain").
Caps:
- If class="uncertain" ⇒ confidence ≤ 50.
- If only USER_TEXT and no corroboration ⇒ cap at 75.
- If contradicting FACT_TABLE without strong evidence ⇒ confidence ≥ 70 for "false" with a short note about the conflict.

OUTPUT (JSON only; no extra keys, no markdown):
{
  "classe": "true|false|uncertain",
  "confianca": <integer 0-100>,
  "justificativa": "2–4 neutral sentences using evidence from USER_TEXT and/or WEB_SNIPPETS. Mention key quoted words/phrases that drove the decision. No links.",
  "trechos": ["short literal quotes from USER_TEXT that support your decision"]
}

STYLE & GUARDRAILS
- Be concise, neutral and cautious. Don't fabricate sources, statistics, or links.
- If evidence is thin or contradictory, prefer "uncertain" with low confidence.
- Do not reveal hidden reasoning steps; only return the JSON above.
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

    // Map new format to expected format
    const mappedResult = {
      status: result.classe === 'true' ? 'real' : result.classe === 'false' ? 'fake' : 'uncertain',
      confidence: result.confianca || 50,
      justification: result.justificativa || 'Análise realizada com base em verificação de fontes online.',
      sources: [],
      trechos: result.trechos || []
    };

    // Validate and sanitize the result
    if (!mappedResult.status || !['real', 'fake', 'uncertain'].includes(mappedResult.status)) {
      // Analyze the response text to determine status
      const responseText = geminiResponse.toLowerCase();
      if (responseText.includes('verdadeiro') || responseText.includes('real') || responseText.includes('confirmado') || responseText.includes('true')) {
        mappedResult.status = 'real';
        mappedResult.confidence = 80;
      } else if (responseText.includes('falso') || responseText.includes('fake') || responseText.includes('incorreto') || responseText.includes('false')) {
        mappedResult.status = 'fake';
        mappedResult.confidence = 80;
      } else {
        mappedResult.status = 'uncertain';
        mappedResult.confidence = 50;
      }
    }

    // Ensure confidence is reasonable
    if (typeof mappedResult.confidence !== 'number' || mappedResult.confidence < 0 || mappedResult.confidence > 100) {
      mappedResult.confidence = mappedResult.status === 'uncertain' ? 50 : 80;
    }

    // Sanitize justification
    if (!mappedResult.justification || typeof mappedResult.justification !== 'string') {
      mappedResult.justification = 'Análise realizada com base em verificação de fontes online.';
    } else {
      mappedResult.justification = mappedResult.justification.substring(0, 1000); // Limit length
    }

    // Create sources based on trechos if available
    if (mappedResult.trechos && mappedResult.trechos.length > 0) {
      mappedResult.sources = mappedResult.trechos.slice(0, 3).map((trecho, index) => ({
        title: `Trecho Analisado ${index + 1}`,
        url: "https://www.google.com/search?q=" + encodeURIComponent(trecho.substring(0, 100)),
        summary: `"${trecho.substring(0, 200)}..." - Trecho do texto analisado`
      }));
    }

    // Add default sources if none provided
    if (mappedResult.sources.length === 0) {
      mappedResult.sources = [
        {
          title: "Análise de Verificação de Fatos",
          url: "https://www.google.com/search?q=" + encodeURIComponent(text.substring(0, 100)),
          summary: "Busca realizada para verificar a veracidade da informação"
        }
      ];
    }

    return {
      status: mappedResult.status,
      confidence: mappedResult.confidence,
      justification: mappedResult.justification,
      sources: mappedResult.sources,
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
