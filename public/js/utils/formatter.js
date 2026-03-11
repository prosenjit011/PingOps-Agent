/**
 * Syntax highlight a JSON object for display in HTML
 */
function syntaxHighlight(obj) {
  let json;
  if (typeof obj === 'string') {
    try { json = JSON.stringify(JSON.parse(obj), null, 2); }
    catch { json = obj; }
  } else {
    json = JSON.stringify(obj, null, 2);
  }
  if (!json) return '';
  return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)"(?=\s*:)/g, '<span class="json-key">"$1"</span>')
    .replace(/:\s*"([^"]*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
}

/**
 * Clean LDAP DN to just the username (e.g. id=mark.nienaber,ou=user,... -> mark.nienaber)
 */
function cleanPrincipal(dn) {
  if (!dn) return dn;
  const idMatch = dn.match(/^id=([^,]+),/);
  if (idMatch) return idMatch[1];
  const uidMatch = dn.match(/^uid=([^,]+),/);
  if (uidMatch) return uidMatch[1];
  return dn;
}

/**
 * Extract a human-readable message from a log payload (client-side fallback)
 */
function extractMessage(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.substring(0, 200);
  if (payload.message && !payload.entries && !payload.http) {
    return String(payload.message).substring(0, 200);
  }

  const parts = [];

  if (payload.eventName) parts.push(payload.eventName);
  if (payload.result) parts.push(payload.result);

  const principal = payload.principal || payload.userId || payload.runAs;
  if (principal) {
    const who = Array.isArray(principal) ? principal[0] : principal;
    if (who) parts.push(cleanPrincipal(who));
  }

  if (payload.component) parts.push(payload.component);

  if (payload.entries && Array.isArray(payload.entries)) {
    const entry = payload.entries[0];
    if (entry && entry.info) {
      const i = entry.info;
      const nodeParts = [];
      if (i.treeName) nodeParts.push(i.treeName);
      if (i.displayName) nodeParts.push(i.displayName);
      else if (i.nodeType) nodeParts.push(i.nodeType);
      if (i.nodeOutcome) nodeParts.push('-> ' + i.nodeOutcome);
      if (nodeParts.length > 0) parts.push(nodeParts.join(' > '));
    }
  }

  if (payload.http && payload.http.request) {
    const req = payload.http.request;
    parts.push((req.method || '') + ' ' + (req.path || ''));
    if (payload.response && (payload.response.statusCode || payload.response.status)) {
      parts.push('-> ' + (payload.response.statusCode || payload.response.status));
    }
  }

  if (payload.operation) parts.push(payload.operation);
  if (payload.objectId) parts.push(payload.objectId);
  if (payload.status && typeof payload.status === 'string') parts.push(payload.status);

  if (parts.length === 0 && payload.message) {
    return String(payload.message).substring(0, 200);
  }

  if (parts.length === 0) {
    return JSON.stringify(payload).substring(0, 120) + '...';
  }

  return parts.join(' | ').substring(0, 500);
}

/**
 * Format source badge text
 */
function formatSource(source) {
  if (!source) return '?';
  return source.replace('am-', 'AM ').replace('idm-', 'IDM ').replace('ctsstore', 'CTS').replace('userstore', 'USR');
}
