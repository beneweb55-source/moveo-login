'use client';

import { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Loader2, Bot, CheckCircle, XCircle } from 'lucide-react';

export default function AITestPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');

  const testAI = async () => {
    setStatus('loading');
    setError('');
    setResponse('');

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API Key not found. Please check your environment variables.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Hello! Please confirm you are working by saying 'AI System Online'.",
      });

      setResponse(response.text || "No response text");
      setStatus('success');
    } catch (err: any) {
      console.error("AI Error:", err);
      setError(err.message || "An unexpected error occurred");
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#141414] border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-[#E50914] to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
            <Bot className="w-8 h-8 text-white" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-2">AI System Check</h1>
        <p className="text-white/60 text-center mb-8 text-sm">
          Verifying integration with Gemini API for future features.
        </p>

        <div className="space-y-4">
          <button
            onClick={testAI}
            disabled={status === 'loading'}
            className="w-full py-3 px-4 bg-white text-black font-medium rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Run Diagnostics'
            )}
          </button>

          {status === 'success' && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 text-emerald-400 font-medium mb-2">
                <CheckCircle className="w-4 h-4" />
                System Operational
              </div>
              <p className="text-emerald-100/80 text-sm font-mono bg-black/20 p-2 rounded">
                {">"} {response}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                <XCircle className="w-4 h-4" />
                System Failure
              </div>
              <p className="text-red-100/80 text-sm">
                {error}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
