const express = require('express');
const router = express.Router();
const path = require('path');
const LogClient = require('../api/logClient');

// Serve default config (pre-fills connection form)
router.get('/config', (req, res) => {
  res.json({
    defaultOrigin: process.env.TENANT_URL || '',
    defaultApiKey: process.env.API_KEY_ID || '',
    defaultApiSecret: process.env.API_KEY_SECRET || '',
    pollFrequency: parseInt(process.env.POLL_FREQUENCY) || 10,
    maxLogBuffer: parseInt(process.env.MAX_LOG_BUFFER) || 5000
  });
});

// Serve available sources
router.get('/sources', (req, res) => {
  res.json(require('../data/sources.json'));
});

// Serve categories/noise filter data
router.get('/categories', (req, res) => {
  res.json(require('../data/categories.json'));
});

// Historical log search
router.post('/logs/search', async (req, res) => {
  const { origin, apiKey, apiSecret, customHeaders, source, beginTime, endTime, transactionId, queryFilter, cookie } = req.body;

  if (!origin || !apiKey || !apiSecret) {
    return res.json({ error: 'Missing credentials' });
  }

  try {
    const client = new LogClient({ origin, apiKey, apiSecret, customHeaders: customHeaders || {} });
    const result = await client.query({ source, beginTime, endTime, transactionId, queryFilter, cookie });
    res.json(result.data);
  } catch (e) {
    const error = e.data ? `API error ${e.statusCode}: ${JSON.stringify(e.data)}` : (e.error || 'Search failed');
    res.json({ error });
  }
});

module.exports = router;
