const express = require('express');
const router = express.Router();
const LogClient = require('../api/logClient');

router.post('/connect', async (req, res) => {
  const { origin, apiKey, apiSecret, customHeaders } = req.body;

  if (!origin || !apiKey || !apiSecret) {
    return res.json({ success: false, error: 'Missing required fields: origin, apiKey, apiSecret' });
  }

  try {
    const client = new LogClient({ origin, apiKey, apiSecret, customHeaders: customHeaders || {} });
    await client.testConnection();
    res.json({ success: true });
  } catch (e) {
    const status = e.statusCode || 0;
    let error = 'Connection failed';
    if (status === 401) error = 'Invalid API key or secret (401 Unauthorized)';
    else if (status === 403) error = 'Access denied (403 Forbidden)';
    else if (status === 404) error = 'Endpoint not found — check tenant URL (should be https://your-tenant.forgeblocks.com)';
    else if (status === 502) error = 'Tenant returned 502 Bad Gateway — the tenant may be temporarily unavailable or the URL may be incorrect';
    else if (status === 503) error = 'Tenant returned 503 Service Unavailable — try again in a few seconds';
    else if (status >= 500) error = `Tenant returned ${status} Server Error — the tenant may be temporarily unavailable`;
    else if (e.error) error = e.error;
    else if (e.data?.error === 'Invalid JSON response') error = `Unexpected response from tenant (got HTML instead of JSON) — check the tenant URL is correct`;
    else if (e.data) error = JSON.stringify(e.data);
    res.json({ success: false, error });
  }
});

module.exports = router;
