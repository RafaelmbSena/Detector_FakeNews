
import React, { useState } from 'react';
import { Search, Shield, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { analyzeText } from '@/services/fakeNewsDetector';

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

const Index = () => {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira um texto para análise.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const analysisResult = await analyzeText(inputText);
      setResult(analysisResult);
      
      if (analysisResult.cached) {
        toast({
          title: "Resultado encontrado",
          description: "Esta análise foi recuperada do cache para resposta mais rápida.",
        });
      }
    } catch (error) {
      console.error('Error analyzing text:', error);
      toast({
        title: "Erro",
        description: "Erro ao analisar o texto. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'real':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'fake':
        return <XCircle className="w-6 h-6 text-red-600" />;
      case 'uncertain':
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'real':
        return 'bg-green-50 border-green-200';
      case 'fake':
        return 'bg-red-50 border-red-200';
      case 'uncertain':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'real':
        return 'Informação Verdadeira';
      case 'fake':
        return 'Possível Fake News';
      case 'uncertain':
        return 'Incerto';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Shield className="w-12 h-12 text-blue-600 mr-3" />
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
              Detector de Fake News
            </h1>
          </div>
          <p className="text-xl text-gray-600 mb-2">
            com Inteligência Artificial e Busca na Internet
          </p>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Cole um texto, clique em Detectar e veja a verdade por trás da informação com verificação em tempo real
          </p>
        </div>

        {/* Search Section */}
        <div className="max-w-4xl mx-auto mb-8">
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="space-y-4">
                <Textarea
                  placeholder="Cole aqui o texto, notícia ou informação que você deseja verificar..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="min-h-[120px] text-lg border-gray-200 focus:border-blue-500 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-center">
                  <Button
                    onClick={handleAnalyze}
                    disabled={isLoading || !inputText.trim()}
                    className="px-8 py-3 text-lg font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                        Verificando na Internet...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Detectar com IA
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Section */}
        {result && (
          <div className="max-w-4xl mx-auto animate-fade-in">
            <Card className={`shadow-lg border-2 ${getStatusColor(result.status)}`}>
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  {getStatusIcon(result.status)}
                  <h2 className="text-2xl font-bold ml-3 text-gray-900">
                    {getStatusText(result.status)}
                  </h2>
                  <div className="ml-auto flex items-center space-x-2">
                    <Badge variant="outline" className="text-lg py-1 px-3">
                      {result.confidence}% de confiança
                    </Badge>
                    {result.cached && (
                      <Badge variant="secondary" className="text-sm py-1 px-2">
                        <Clock className="w-3 h-3 mr-1" />
                        Cache
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2 text-gray-800">Análise da IA:</h3>
                  <p className="text-gray-700 leading-relaxed">{result.justification}</p>
                </div>

                {result.sources && result.sources.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">Fontes de Verificação:</h3>
                    <div className="space-y-3">
                      {result.sources.map((source, index) => (
                        <Card key={index} className="border border-gray-200">
                          <CardContent className="p-4">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-medium text-lg mb-2 block"
                            >
                              {source.title}
                            </a>
                            <p className="text-gray-600">{source.summary}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center mt-16 text-gray-500">
          <p>Desenvolvido com IA Gemini e verificação em tempo real na internet</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
