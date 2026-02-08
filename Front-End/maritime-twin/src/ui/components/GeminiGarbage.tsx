import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { requestGeminiFast } from '../../utils/gemini';

export function GeminiGarbage() {
    const [open, setOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [answer, setAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            inputRef.current?.focus();
        }
    }, [open]);

    const submitPrompt = async () => {
        const trimmed = prompt.trim();
        if (!trimmed || loading) return;

        setLoading(true);
        setError(null);
        setAnswer('');

        try {
            const result = await requestGeminiFast(trimmed);
            setAnswer(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gemini request failed.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitPrompt();
        }
    };

    return (
        <div className="absolute bottom-4 right-4 z-20">
            {open && (
                <div className="mb-3 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-700">Gemini Fast</div>
                        <button
                            onClick={() => setOpen(false)}
                            className="rounded-full px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
                            aria-label="Close Gemini panel"
                        >
                            Close
                        </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                        <input
                            ref={inputRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask Gemini..."
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none"
                            disabled={loading}
                        />
                        <button
                            onClick={submitPrompt}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={loading}
                        >
                            {loading ? '...' : 'Send'}
                        </button>
                    </div>

                    <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                        {error && <div className="text-red-500">{error}</div>}
                        {!error && !answer && !loading && <div className="text-slate-400">Awaiting response...</div>}
                        {loading && <div className="text-slate-500">Thinking...</div>}
                        {!loading && answer && (
                            <ReactMarkdown className="space-y-2 whitespace-pre-wrap">
                                {answer}
                            </ReactMarkdown>
                        )}
                    </div>
                </div>
            )}

            <button
                onClick={() => setOpen((prev) => !prev)}
                className="group flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-sky-200 via-blue-300 to-indigo-300 shadow-xl transition-transform hover:scale-105"
                aria-label="Toggle Gemini assistant"
                title="Gemini"
            >
                <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-slate-700"
                    aria-hidden="true"
                >
                    <path
                        d="M12 3.5L13.9 8.1L18.5 10L13.9 11.9L12 16.5L10.1 11.9L5.5 10L10.1 8.1L12 3.5Z"
                        fill="currentColor"
                    />
                    <path
                        d="M18.7 13.2L19.6 15.4L21.8 16.3L19.6 17.2L18.7 19.4L17.8 17.2L15.6 16.3L17.8 15.4L18.7 13.2Z"
                        fill="currentColor"
                    />
                </svg>
            </button>
        </div>
    );
}
