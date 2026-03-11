const LogClient = require('../api/logClient');
const RateLimiter = require('../api/rateLimiter');
const noiseData = require('../data/categories.json');

class TailManager {
  constructor(ws) {
    this.ws = ws;
    this.logClient = null;
    this.rateLimiter = new RateLimiter();
    this.polling = false;
    this.cookie = null;
    this.pollFrequency = 10000;
    this._noiseSet = new Set();
    this._noisePrefixes = [];
    this._pollTimer = null;
    this._abortController = null;

    // Index categories for quick lookup
    this._categoryMap = new Map();
    for (const cat of (noiseData.noiseCategories || [])) {
      this._categoryMap.set(cat.id, cat);
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        this.handleMessage(msg);
      } catch (e) {
        this._send({ type: 'error', error: 'Invalid message format' });
      }
    });

    ws.on('close', () => this.stop());
    ws.on('error', () => this.stop());
  }

  _buildNoiseSet(enabledCategoryIds) {
    const set = new Set();
    const prefixes = [];
    for (const id of enabledCategoryIds) {
      const cat = this._categoryMap.get(id);
      if (!cat) continue;
      for (const logger of (cat.loggers || [])) {
        set.add(logger);
      }
      if (cat.prefixes) {
        prefixes.push(...cat.prefixes);
      }
    }
    this._noiseSet = set;
    this._noisePrefixes = prefixes;
  }

  _isNoise(logger) {
    if (this._noiseSet.has(logger)) return true;
    for (const prefix of this._noisePrefixes) {
      if (logger.startsWith(prefix)) return true;
    }
    return false;
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'connect':
        this.logClient = new LogClient({
          origin: msg.origin,
          apiKey: msg.apiKey,
          apiSecret: msg.apiSecret,
          customHeaders: msg.customHeaders || {}
        });
        this._send({ type: 'connected' });
        break;

      case 'start_tail':
        if (msg.enabledNoiseCategories) {
          this._buildNoiseSet(msg.enabledNoiseCategories);
        }
        this.pollFrequency = (msg.pollFrequency || 10) * 1000;
        this.cookie = null;
        this.sources = (msg.sources || ['am-everything', 'idm-everything']).join(',');
        this.start();
        break;

      case 'stop_tail':
        this.stop();
        break;

      case 'update_filters':
        if (msg.enabledNoiseCategories) {
          this._buildNoiseSet(msg.enabledNoiseCategories);
        }
        break;
    }
  }

  start() {
    if (!this.logClient) {
      this._send({ type: 'error', error: 'Not connected' });
      return;
    }
    this.polling = true;
    this.poll();
  }

  stop() {
    this.polling = false;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    // Abort any in-flight HTTP request
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    // Clean up HTTP agent / connections
    if (this.logClient?.destroy) {
      this.logClient.destroy();
    }
  }

  async poll() {
    if (!this.polling || this.ws.readyState !== 1) return;

    try {
      this._abortController = new AbortController();
      const result = await this.logClient.tail(this.sources, this.cookie, this._abortController.signal);
      this._abortController = null;
      this.rateLimiter.update(result.rateLimit);

      if (result.data.pagedResultsCookie) {
        this.cookie = result.data.pagedResultsCookie;
      }

      const logs = this._processLogs(result.data.result || []);

      this._send({
        type: 'logs',
        logs,
        rateLimit: this.rateLimiter.getStatus(),
        resultCount: result.data.resultCount
      });

    } catch (e) {
      // Don't report errors for aborted requests (normal on stop/disconnect)
      if (e.error === 'aborted' || !this.polling) return;

      // Handle 429 rate limiting with explicit backoff
      if (e.statusCode === 429) {
        const backoff = (e.retryAfter || 60) * 1000;
        this.rateLimiter.update(e.rateLimit || {});
        try { this._send({ type: 'error', error: `Rate limited — retrying in ${e.retryAfter || 60}s` }); } catch {}
        if (this.polling) {
          this._pollTimer = setTimeout(() => this.poll(), backoff);
        }
        return;
      }

      const errMsg = e.data ? `API error ${e.statusCode}: ${JSON.stringify(e.data)}` : (e.error || 'Unknown error');
      try { this._send({ type: 'error', error: errMsg }); } catch {}
    } finally {
      // Self-healing: always schedule the next poll unless stopped
      if (this.polling && !this._pollTimer) {
        const delay = this.rateLimiter.getDelay(this.pollFrequency);
        this._pollTimer = setTimeout(() => this.poll(), delay);
      }
    }
  }

  _processLogs(rawLogs) {
    const processed = [];
    const hasNoise = this._noiseSet.size > 0 || this._noisePrefixes.length > 0;

    for (const raw of rawLogs) {
      const payload = raw.payload;
      if (!payload) continue;

      // Handle both JSON and plaintext payloads
      const p = typeof payload === 'string' ? { message: payload } : payload;

      // Apply noise filter (Set lookup O(1) + prefix matching)
      if (hasNoise && p.logger && this._isNoise(p.logger)) {
        continue;
      }
      if (hasNoise && raw.type === 'text/plain' && this._noiseSet.has('text/plain')) {
        continue;
      }

      processed.push({
        timestamp: raw.timestamp || p.timestamp || '',
        source: raw.source || '',
        type: raw.type || '',
        level: p.level || p.severity || '',
        logger: p.logger || p.eventName || p.component || p.topic || raw.type || '',
        transactionId: p.transactionId || p.trackingIds?.[0] || '',
        message: this._extractMessage(p),
        payload: p
      });
    }
    return processed;
  }

  _extractMessage(payload) {
    if (typeof payload === 'string') return payload.substring(0, 500);
    if (payload.message && !payload.entries && !payload.http) {
      return String(payload.message).substring(0, 500);
    }

    const parts = [];

    // Event name (e.g. AM-NODE-LOGIN-COMPLETED, AM-ACCESS-OUTCOME)
    if (payload.eventName) parts.push(payload.eventName);

    // Result / status - show early so failures are immediately visible
    if (payload.result) parts.push(payload.result);

    // Principal / who - clean up LDAP DNs to just the username
    const principal = payload.principal || payload.userId || payload.runAs;
    if (principal) {
      const who = Array.isArray(principal) ? principal[0] : principal;
      if (who) parts.push(this._cleanPrincipal(who));
    }

    // Component context (OAuth, SAML2, Session, ID Repo, etc.)
    if (payload.component) parts.push(payload.component);

    // Realm
    if (payload.realm && payload.realm !== '/') {
      parts.push(payload.realm);
    }

    // Authentication entries (journey nodes, tree info)
    if (payload.entries && Array.isArray(payload.entries) && payload.entries.length > 0) {
      const entry = payload.entries[0];
      if (entry.info) {
        const i = entry.info;
        const nodeParts = [];
        if (i.treeName) nodeParts.push(i.treeName);
        if (i.displayName) nodeParts.push(i.displayName);
        else if (i.nodeType) nodeParts.push(i.nodeType);
        if (i.nodeOutcome) nodeParts.push('-> ' + i.nodeOutcome);
        if (i.authLevel && i.authLevel !== '0') nodeParts.push('level=' + i.authLevel);
        if (nodeParts.length > 0) parts.push(nodeParts.join(' > '));
      }
    }

    // HTTP access logs
    if (payload.http && payload.http.request) {
      const req = payload.http.request;
      const httpMsg = (req.method || '') + ' ' + (req.path || '');
      parts.push(httpMsg);
      if (payload.response) {
        if (payload.response.statusCode) {
          parts.push('-> ' + payload.response.statusCode);
        } else if (payload.response.status) {
          parts.push('-> ' + payload.response.status);
        }
      }
    }

    // IDM activity/sync - operation + object + details
    if (payload.operation) parts.push(payload.operation);
    if (payload.objectId) parts.push(payload.objectId);
    if (payload.status && typeof payload.status === 'string') parts.push(payload.status);
    if (payload.passwordChanged) parts.push('passwordChanged');
    if (payload.changedFields && Array.isArray(payload.changedFields) && payload.changedFields.length > 0) {
      parts.push('[' + payload.changedFields.slice(0, 5).join(', ') +
        (payload.changedFields.length > 5 ? ', ...' : '') + ']');
    }

    // Fallback to message if we have it as supplement
    if (parts.length === 0 && payload.message) {
      return String(payload.message).substring(0, 500);
    }

    return parts.join(' | ').substring(0, 500);
  }

  _cleanPrincipal(dn) {
    if (!dn) return dn;
    // Extract username from LDAP DN format: id=mark.nienaber,ou=user,dc=openam,...
    const idMatch = dn.match(/^id=([^,]+),/);
    if (idMatch) return idMatch[1];
    // Extract uid from uid=mark.nienaber,ou=...
    const uidMatch = dn.match(/^uid=([^,]+),/);
    if (uidMatch) return uidMatch[1];
    return dn;
  }

  _send(data) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

module.exports = TailManager;
