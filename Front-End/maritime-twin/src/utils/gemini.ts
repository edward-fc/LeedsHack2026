export async function requestGeminiFast(prompt: string): Promise<string> {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
    });

    const data = await response
        .json()
        .catch(() => ({} as { answer?: string; error?: string }));

    if (!response.ok) {
        const message = data.error || `Gemini request failed (${response.status})`;
        throw new Error(message);
    }

    const text = data.answer || '';

    if (!text.trim()) {
        throw new Error('Gemini returned an empty response.');
    }

    return text.trim();
}
