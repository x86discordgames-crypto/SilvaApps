const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const { rateLimit } = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 10000;
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Você enviou muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.' }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/chat', chatLimiter, async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const history = Array.isArray(req.body.history) ? req.body.history : [];
  if (!message) return res.status(400).json({ error: 'Digite uma pergunta.' });
  if (message.length > 1500) return res.status(400).json({ error: 'Sua mensagem é muito longa. Envie até 1500 caracteres.' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'O suporte IA ainda não foi configurado pelo administrador.' });

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const safeHistory = history
      .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
      .slice(-10)
      .map(item => ({ role: item.role, content: item.content.slice(0, 1500) }));
    if (!safeHistory.length || safeHistory[safeHistory.length - 1].role !== 'user' || safeHistory[safeHistory.length - 1].content !== message) {
      safeHistory.push({ role: 'user', content: message });
    }
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions: 'Você é o assistente oficial de suporte da SilvaApps, uma loja de bots para Discord. Responda em português brasileiro, com clareza e cordialidade. Ajude com dúvidas sobre os produtos e o site, mas não invente preços, recursos, prazos, políticas ou confirmações de pagamento. Se não souber algo específico da loja, diga que a equipe humana pode ajudar pelo Discord: https://discord.gg/zC5RbHxjHA. Nunca peça senhas, tokens, chaves de API ou dados bancários. Não afirme que realizou compras, pagamentos ou ações externas.',
      input: safeHistory,
      max_output_tokens: 450
    });
    const reply = (response.output_text || '').trim();
    if (!reply) return res.status(502).json({ error: 'A IA não retornou uma resposta. Tente novamente.' });
    res.json({ reply });
  } catch (error) {
    console.error('OpenAI API request failed:', error.status || error.name || 'UnknownError');
    if (error.status === 401) return res.status(502).json({ error: 'A chave da API não foi aceita. O administrador precisa conferir a configuração no painel de hospedagem.' });
    if (error.status === 429) return res.status(429).json({ error: 'A API está no limite de uso ou sem saldo disponível. Tente mais tarde.' });
    res.status(502).json({ error: 'Não consegui falar com a IA neste momento. Tente novamente mais tarde.' });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`SilvaApps rodando na porta ${port}`));
