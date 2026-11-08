const DEFAULT_MODEL = 'gemini-3.6-flash'
const MAX_HISTORY_MESSAGES = 20

export function createGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async reply(messages, portfolioContext = '') {
      if (!apiKey) {
        const error = new Error('AI chat is not configured. Set GEMINI_API_KEY in the root .env file or your hosting environment.')
        error.statusCode = 503
        throw error
      }

      const contents = messages.slice(-MAX_HISTORY_MESSAGES).map(({ role, text }) => ({
        role,
        parts: [{ text }],
      }))
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `You are PortfolioProof's helpful AI assistant. Answer clearly and conversationally, especially about building skills, projects, evidence-backed portfolios, and the portfolio context below. Never claim access to information not provided. If asked something unrelated, answer normally.\n\nPortfolio context:\n${portfolioContext || 'No portfolio records are currently available.'}`,
              }],
            },
            contents,
            generationConfig: { maxOutputTokens: 1200, temperature: 0.6 },
          }),
          signal: AbortSignal.timeout(30000),
        },
      )

      if (!response.ok) {
        const error = new Error(response.status === 429
          ? 'Gemini is rate limited right now. Please try again shortly.'
          : 'Gemini could not complete the request. Check the API key and try again.')
        error.statusCode = response.status === 429 ? 429 : 502
        throw error
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim()
      if (!text) {
        const error = new Error('Gemini returned no text for this message. Please try rephrasing it.')
        error.statusCode = 502
        throw error
      }
      return text
    },
  }
}

export { DEFAULT_MODEL, MAX_HISTORY_MESSAGES }
