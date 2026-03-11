document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    // Connection
    connected: false,
    connecting: false,
    connectionError: '',
    origin: '',
    apiKey: '',
    apiSecret: '',
    showKey: false,
    showSecret: false,
    tenantName: '',
    saveConnection: false,
    savedConnections: [],
    selectedConnectionIdx: -1,
    showSavedDropdown: false,

    // WebSocket
    ws: null,
    reconnectAttempts: 0,
    reconnecting: false,
    maxReconnectAttempts: 10,

    // Tailing
    tailing: false,
    paused: false,
    logs: [],
    _logIdCounter: 0,

    // Filters
    activeSources: ['am-everything', 'idm-everything'],
    availableSources: [
      { id: 'am-everything', label: 'AM Everything' },
      { id: 'am-access', label: 'AM Access' },
      { id: 'am-authentication', label: 'AM Authentication' },
      { id: 'am-config', label: 'AM Config' },
      { id: 'am-core', label: 'AM Core' },
      { id: 'am-activity', label: 'AM Activity' },
      { id: 'idm-everything', label: 'IDM Everything' },
      { id: 'idm-access', label: 'IDM Access' },
      { id: 'idm-activity', label: 'IDM Activity' },
      { id: 'idm-authentication', label: 'IDM Authentication' },
      { id: 'idm-config', label: 'IDM Config' },
      { id: 'idm-core', label: 'IDM Core' },
      { id: 'idm-sync', label: 'IDM Sync' }
    ],
    logLevelFilter: 'ALL',
    textSearch: '',
    transactionIdFilter: '',
    // Noise filter categories
    noiseCategories: [],
    enabledNoiseCategories: [],
    showNoiseDropdown: false,

    // Settings
    showSettings: false,
    pollFrequency: 10,
    maxLogBuffer: 5000,
    autoScroll: true,

    // Custom noise filters (user-added)
    customNoiseLoggers: [],

    // Custom headers (hidden feature)
    showCustomHeaders: false,
    customHeaders: [],
    _versionClicks: 0,
    _versionClickTimer: null,

    // Export
    showExport: false,
    exportFormat: 'json',
    exportScope: 'filtered',

    // History
    showHistory: false,
    historyStart: '',
    historyEnd: '',
    historyTxnId: '',
    historyQueryFilter: '',
    historyLoading: false,
    historyError: '',
    historyNextCookie: null,

    // Rate limit
    rateLimit: { limit: 0, remaining: 0, resetTime: 0 },

    async init() {
      // Load config defaults from server
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        this.origin = config.defaultOrigin || '';
        this.apiKey = config.defaultApiKey || '';
        this.apiSecret = config.defaultApiSecret || '';
        this.pollFrequency = config.pollFrequency || 10;
        this.maxLogBuffer = config.maxLogBuffer || 5000;
      } catch (e) {
        console.error('Failed to load config:', e);
      }

      // Load saved connections
      try {
        const saved = localStorage.getItem('aic-sentinel-connections');
        if (saved) this.savedConnections = JSON.parse(saved);
        // Migrate old single-connection format
        const legacy = localStorage.getItem('aic-sentinel-connection');
        if (legacy && this.savedConnections.length === 0) {
          const conn = JSON.parse(legacy);
          if (conn.origin) {
            this.savedConnections.push({
              name: conn.origin.replace(/^https?:\/\//, '').replace('.forgeblocks.com', '').replace('.id.forgerock.io', ''),
              origin: conn.origin,
              apiKey: conn.apiKey || '',
              apiSecret: conn.apiSecret || ''
            });
            localStorage.setItem('aic-sentinel-connections', JSON.stringify(this.savedConnections));
            localStorage.removeItem('aic-sentinel-connection');
          }
        }
      } catch {}

      // Load noise categories from server
      try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        if (data.noiseCategories) {
          this.noiseCategories = data.noiseCategories;
          // Initialize enabled categories from localStorage or defaults
          const saved = localStorage.getItem('aic-sentinel-noise-categories');
          if (saved) {
            this.enabledNoiseCategories = JSON.parse(saved);
          } else {
            this.enabledNoiseCategories = data.noiseCategories
              .filter(c => c.defaultEnabled)
              .map(c => c.id);
          }
        }
      } catch (e) {
        console.error('Failed to load categories:', e);
      }

      // Restore custom noise loggers from localStorage
      try {
        const saved = localStorage.getItem('aic-sentinel-custom-noise');
        if (saved) this.customNoiseLoggers = JSON.parse(saved);
      } catch {}

      // Restore custom headers from sessionStorage
      try {
        const saved = sessionStorage.getItem('aic-sentinel-custom-headers');
        if (saved) {
          this.customHeaders = JSON.parse(saved);
          this.showCustomHeaders = this.customHeaders.length > 0;
        }
      } catch {}

      // Watch poll frequency changes and restart tail
      this.$watch('pollFrequency', () => {
        if (this.tailing) this.restartTail();
      });

      // Auto-reconnect from saved session
      try {
        const session = sessionStorage.getItem('aic-sentinel-session');
        if (session) {
          const s = JSON.parse(session);
          this.origin = s.origin || this.origin;
          this.apiKey = s.apiKey || this.apiKey;
          this.apiSecret = s.apiSecret || this.apiSecret;
          if (s.activeSources) this.activeSources = s.activeSources;
          if (s.pollFrequency) this.pollFrequency = s.pollFrequency;
          if (s.maxLogBuffer) this.maxLogBuffer = s.maxLogBuffer;
          if (s.logLevelFilter) this.logLevelFilter = s.logLevelFilter;
          if (s.origin && s.apiKey && s.apiSecret) {
            this.connect();
          }
        }
      } catch {}
    },

    _saveSession() {
      try {
        sessionStorage.setItem('aic-sentinel-session', JSON.stringify({
          origin: this.origin,
          apiKey: this.apiKey,
          apiSecret: this.apiSecret,
          activeSources: this.activeSources,
          pollFrequency: this.pollFrequency,
          maxLogBuffer: this.maxLogBuffer,
          logLevelFilter: this.logLevelFilter
        }));
      } catch {}
    },

    _clearSession() {
      sessionStorage.removeItem('aic-sentinel-session');
    },

    // Noise category helpers
    get enabledNoiseCategoryCount() {
      return this.enabledNoiseCategories.length;
    },

    get totalNoiseCategoryCount() {
      return this.noiseCategories.length;
    },

    get noiseCategoriesByLevel() {
      const groups = { high: [], medium: [], low: [], idm: [] };
      for (const cat of this.noiseCategories) {
        if (cat.id.startsWith('idm-')) {
          groups.idm.push(cat);
        } else {
          groups[cat.noise || 'medium'].push(cat);
        }
      }
      return groups;
    },

    isNoiseCategoryEnabled(id) {
      return this.enabledNoiseCategories.includes(id);
    },

    toggleNoiseCategory(id) {
      const idx = this.enabledNoiseCategories.indexOf(id);
      if (idx >= 0) {
        this.enabledNoiseCategories.splice(idx, 1);
      } else {
        this.enabledNoiseCategories.push(id);
      }
      this._saveNoisePreferences();
      this._sendNoiseUpdate();
    },

    enableAllNoiseCategories() {
      this.enabledNoiseCategories = this.noiseCategories.map(c => c.id);
      this._saveNoisePreferences();
      this._sendNoiseUpdate();
    },

    disableAllNoiseCategories() {
      this.enabledNoiseCategories = [];
      this._saveNoisePreferences();
      this._sendNoiseUpdate();
    },

    _saveNoisePreferences() {
      localStorage.setItem('aic-sentinel-noise-categories', JSON.stringify(this.enabledNoiseCategories));
    },

    _sendNoiseUpdate() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.tailing) {
        this.ws.send(JSON.stringify({
          type: 'update_filters',
          enabledNoiseCategories: this.enabledNoiseCategories
        }));
      }
    },

    getCategoryLoggerCount(cat) {
      let count = (cat.loggers || []).length;
      if (cat.prefixes && cat.prefixes.length > 0) {
        count += cat.prefixes.length; // each prefix counts as 1 (covers many)
      }
      return count;
    },


    get filteredLogs() {
      let result = this.logs;

      // Custom noise loggers (always applied, independent of noise filter toggle)
      if (this.customNoiseLoggers.length > 0) {
        const muteSet = new Set(this.customNoiseLoggers);
        result = result.filter(l => !muteSet.has(l.logger));
      }

      // Level filter
      if (this.logLevelFilter !== 'ALL') {
        result = result.filter(l => l.level === this.logLevelFilter);
      }

      // Text search
      if (this.textSearch) {
        const q = this.textSearch.toLowerCase();
        result = result.filter(l =>
          (l.message && l.message.toLowerCase().includes(q)) ||
          (l.logger && l.logger.toLowerCase().includes(q)) ||
          (l._payloadStr && l._payloadStr.toLowerCase().includes(q))
        );
      }

      // Transaction ID filter
      if (this.transactionIdFilter) {
        const txn = this.transactionIdFilter.toLowerCase();
        result = result.filter(l => l.transactionId && l.transactionId.toLowerCase().includes(txn));
      }

      return result;
    },

    async connect() {
      this.connecting = true;
      this.connectionError = '';
      try {
        const headers = {};
        this.customHeaders.filter(h => h.name && h.value).forEach(h => { headers[h.name] = h.value; });

        const res = await fetch('/api/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: this.origin,
            apiKey: this.apiKey,
            apiSecret: this.apiSecret,
            customHeaders: headers
          })
        });
        const data = await res.json();
        if (!data.success) {
          this.connectionError = data.error || 'Connection failed';
          return;
        }
        this.connected = true;
        this.tenantName = this.origin.replace(/^https?:\/\//, '').replace('.forgeblocks.com', '').replace('.id.forgerock.io', '');

        // Save connection if checkbox is checked
        if (this.saveConnection) {
          this._saveCurrentConnection();
          this.saveConnection = false;
        }

        // Save custom headers to sessionStorage
        if (this.customHeaders.length > 0) {
          sessionStorage.setItem('aic-sentinel-custom-headers', JSON.stringify(this.customHeaders));
        }

        this._saveSession();
        this.connectWebSocket();
      } catch (e) {
        this.connectionError = 'Network error: ' + e.message;
      } finally {
        this.connecting = false;
      }
    },

    connectWebSocket() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${proto}//${window.location.host}/ws/tail`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        const customH = {};
        this.customHeaders.filter(h => h.name && h.value).forEach(h => { customH[h.name] = h.value; });
        this.ws.send(JSON.stringify({
          type: 'connect',
          origin: this.origin,
          apiKey: this.apiKey,
          apiSecret: this.apiSecret,
          customHeaders: customH
        }));
        this.startTail();
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        this.handleWsMessage(msg);
      };

      this.ws.onclose = () => {
        this.tailing = false;
        if (this.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnecting = true;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          this.reconnectAttempts++;
          setTimeout(() => this.connectWebSocket(), delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.reconnecting = false;
          this.connectionError = 'Connection lost after ' + this.maxReconnectAttempts + ' attempts';
        }
      };

      this.ws.onerror = () => {};
    },

    handleWsMessage(msg) {
      switch (msg.type) {
        case 'logs':
          if (!this.paused && msg.logs) {
            this.appendLogs(msg.logs);
          }
          if (msg.rateLimit) this.rateLimit = msg.rateLimit;
          break;
        case 'connected':
          break;
        case 'error':
          console.error('WS error:', msg.error);
          break;
      }
    },

    appendLogs(newLogs) {
      for (const log of newLogs) {
        log.id = ++this._logIdCounter;
        log.expanded = false;
        log._payloadStr = JSON.stringify(log.payload);
      }
      // Prepend newest first (reverse the chronological batch, then unshift)
      this.logs.unshift(...newLogs.reverse());
      // Trim old logs from the end
      if (this.logs.length > this.maxLogBuffer) {
        this.logs.length = this.maxLogBuffer;
      }
      this.$nextTick(() => {
        if (this.autoScroll && this.$refs.logContainer) {
          this.$refs.logContainer.scrollTop = 0;
        }
      });
    },

    startTail() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({
        type: 'start_tail',
        sources: this.activeSources,
        enabledNoiseCategories: this.enabledNoiseCategories,
        pollFrequency: this.pollFrequency
      }));
      this.tailing = true;
    },

    stopTail() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: 'stop_tail' }));
      this.tailing = false;
    },

    restartTail() {
      if (this.tailing) {
        this.stopTail();
        this._saveSession();
        setTimeout(() => this.startTail(), 100);
      }
    },

    togglePause() {
      this.paused = !this.paused;
    },

    clearLogs() {
      this.logs = [];
      this._logIdCounter = 0;
    },

    resumeAutoScroll() {
      this.autoScroll = true;
      if (this.$refs.logContainer) {
        this.$refs.logContainer.scrollTop = 0;
      }
    },

    handleScroll() {
      const el = this.$refs.logContainer;
      if (!el) return;
      const atTop = el.scrollTop < 50;
      if (!atTop && this.autoScroll) {
        this.autoScroll = false;
      }
    },

    disconnect() {
      this.stopTail();
      if (this.ws) { this.ws.close(); this.ws = null; }
      this.connected = false;
      this.tailing = false;
      this.reconnecting = false;
      this.logs = [];
      this._clearSession();
    },

    // Saved connections
    _saveCurrentConnection() {
      const name = this.origin.replace(/^https?:\/\//, '').replace('.forgeblocks.com', '').replace('.id.forgerock.io', '');
      const existing = this.savedConnections.findIndex(c => c.origin === this.origin);
      const conn = { name, origin: this.origin, apiKey: this.apiKey, apiSecret: this.apiSecret };
      if (existing >= 0) {
        this.savedConnections[existing] = conn;
      } else {
        this.savedConnections.push(conn);
      }
      localStorage.setItem('aic-sentinel-connections', JSON.stringify(this.savedConnections));
    },

    loadSavedConnection(idx) {
      const conn = this.savedConnections[idx];
      if (!conn) return;
      this.origin = conn.origin;
      this.apiKey = conn.apiKey;
      this.apiSecret = conn.apiSecret;
      this.selectedConnectionIdx = idx;
      this.showSavedDropdown = false;
    },

    deleteSavedConnection(idx) {
      this.savedConnections.splice(idx, 1);
      localStorage.setItem('aic-sentinel-connections', JSON.stringify(this.savedConnections));
      if (this.selectedConnectionIdx === idx) this.selectedConnectionIdx = -1;
    },

    // Category presets (filtering applied reactively in filteredLogs getter)

    // History
    setHistoryRange(minutes) {
      const end = new Date();
      const start = new Date(end.getTime() - minutes * 60000);
      this.historyEnd = toDatetimeLocal(end);
      this.historyStart = toDatetimeLocal(start);
    },

    async searchHistory() {
      if (!this.historyStart || !this.historyEnd) {
        this.historyError = 'Please set both start and end times';
        return;
      }
      this.historyError = '';
      this.historyLoading = true;
      this.historyNextCookie = null;

      // Stop live tailing during history search
      this.stopTail();
      this.clearLogs();

      try {
        await this._fetchHistoryPage(null);
      } catch (e) {
        this.historyError = 'Search failed: ' + e.message;
      } finally {
        this.historyLoading = false;
      }
    },

    async loadMoreHistory() {
      if (!this.historyNextCookie) return;
      this.historyLoading = true;
      try {
        await this._fetchHistoryPage(this.historyNextCookie);
      } catch (e) {
        this.historyError = 'Load more failed: ' + e.message;
      } finally {
        this.historyLoading = false;
      }
    },

    async _fetchHistoryPage(cookie) {
      const customH = {};
      this.customHeaders.filter(h => h.name && h.value).forEach(h => { customH[h.name] = h.value; });

      const res = await fetch('/api/logs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: this.origin,
          apiKey: this.apiKey,
          apiSecret: this.apiSecret,
          customHeaders: customH,
          source: this.activeSources.join(','),
          beginTime: datetimeLocalToISO(this.historyStart),
          endTime: datetimeLocalToISO(this.historyEnd),
          transactionId: this.historyTxnId || undefined,
          queryFilter: this.historyQueryFilter || undefined,
          cookie: cookie || undefined
        })
      });
      const data = await res.json();
      if (data.error) {
        this.historyError = data.error;
        return;
      }

      if (data.result) {
        const processed = data.result.map(log => this._processLog(log));
        this.appendLogs(processed);
      }
      this.historyNextCookie = data.pagedResultsCookie || null;
    },

    _processLog(raw) {
      const payload = raw.payload || raw;
      const p = typeof payload === 'string' ? { message: payload } : payload;
      return {
        timestamp: raw.timestamp || p.timestamp || '',
        source: raw.source || '',
        type: raw.type || '',
        level: p.level || p.severity || '',
        logger: p.logger || p.eventName || p.component || p.topic || raw.type || '',
        transactionId: p.transactionId || (p.trackingIds && p.trackingIds[0]) || '',
        message: extractMessage(p),
        payload: p
      };
    },

    resumeTailing() {
      this.startTail();
      this.showHistory = false;
    },

    // Export
    exportLogs() {
      const data = this.exportScope === 'filtered' ? this.filteredLogs : this.logs;
      let content, ext, mime;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');

      switch (this.exportFormat) {
        case 'json':
          content = JSON.stringify(data.map(l => l.payload), null, 2);
          ext = 'json';
          mime = 'application/json';
          break;
        case 'text':
          content = this._exportAsText(data);
          ext = 'txt';
          mime = 'text/plain';
          break;
        case 'csv':
          content = this._exportAsCsv(data);
          ext = 'csv';
          mime = 'text/csv';
          break;
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aic-sentinel-logs-${ts}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      this.showExport = false;
    },

    _exportAsText(data) {
      let lines = [
        '=== AIC Sentinel Log Export ===',
        'Tenant: ' + this.origin,
        'Exported: ' + new Date().toISOString(),
        'Source: ' + this.activeSources.join(', '),
        'Noise categories: ' + this.enabledNoiseCategoryCount + '/' + this.totalNoiseCategoryCount + ' enabled',
        'Filters: ' +
          (this.logLevelFilter !== 'ALL' ? 'Level=' + this.logLevelFilter + ', ' : '') +
          (this.textSearch ? 'Search="' + this.textSearch + '", ' : '') +
          (this.transactionIdFilter ? 'TxnID=' + this.transactionIdFilter + ', ' : '') +
          (this.customNoiseLoggers.length > 0 ? this.customNoiseLoggers.length + ' custom muted' : ''),
        'Total entries: ' + data.length,
        ''
      ];
      for (const log of data) {
        lines.push('---');
        lines.push(`[${log.timestamp}] [${log.level || '-'}] [${log.source}]`);
        if (log.logger) lines.push('Logger: ' + log.logger);
        if (log.transactionId) lines.push('Transaction: ' + log.transactionId);
        if (log.message) lines.push('Message: ' + log.message);
        lines.push('Payload:');
        lines.push(JSON.stringify(log.payload, null, 2));
        lines.push('');
      }
      return lines.join('\n');
    },

    _exportAsCsv(data) {
      const escape = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';
      let lines = ['timestamp,source,level,logger,transactionId,message,payloadJson'];
      for (const log of data) {
        lines.push([
          escape(log.timestamp), escape(log.source), escape(log.level),
          escape(log.logger), escape(log.transactionId), escape(log.message),
          escape(JSON.stringify(log.payload))
        ].join(','));
      }
      return lines.join('\n');
    },

    // Custom noise management
    muteLogger(loggerName) {
      if (!loggerName || this.customNoiseLoggers.includes(loggerName)) return;
      this.customNoiseLoggers.push(loggerName);
      localStorage.setItem('aic-sentinel-custom-noise', JSON.stringify(this.customNoiseLoggers));
    },

    unmuteLogger(loggerName) {
      this.customNoiseLoggers = this.customNoiseLoggers.filter(l => l !== loggerName);
      localStorage.setItem('aic-sentinel-custom-noise', JSON.stringify(this.customNoiseLoggers));
    },

    isLoggerMuted(loggerName) {
      return this.customNoiseLoggers.includes(loggerName);
    },

    // Hidden feature: custom headers
    handleVersionClick() {
      this._versionClicks++;
      clearTimeout(this._versionClickTimer);
      this._versionClickTimer = setTimeout(() => { this._versionClicks = 0; }, 3000);
      if (this._versionClicks >= 5) {
        this.showCustomHeaders = !this.showCustomHeaders;
        if (this.showCustomHeaders && this.customHeaders.length === 0) {
          this.customHeaders.push({ name: '', value: '' });
        }
        this._versionClicks = 0;
        this.showSettings = true;
      }
    },

    handleKeydown(event) {
      // Ctrl+Shift+H or Cmd+Shift+H - toggle custom headers
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'H') {
        event.preventDefault();
        this.showCustomHeaders = !this.showCustomHeaders;
        if (this.showCustomHeaders && this.customHeaders.length === 0) {
          this.customHeaders.push({ name: '', value: '' });
        }
        this.showSettings = true;
      }
      // Ctrl+H or Cmd+H - toggle history
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 'h') {
        event.preventDefault();
        this.showHistory = !this.showHistory;
      }
      // Escape - close panels
      if (event.key === 'Escape') {
        this.showSettings = false;
        this.showHistory = false;
        this.showExport = false;
        this.showNoiseDropdown = false;
      }
    },

    copyPayload(log) {
      navigator.clipboard.writeText(JSON.stringify(log.payload, null, 2));
    },

    // Re-export utility functions for Alpine template access
    formatTime,
    formatSource,
    syntaxHighlight,
    extractMessage,
    toDatetimeLocal,
    datetimeLocalToISO
  }));
});
