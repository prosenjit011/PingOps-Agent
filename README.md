# AIC Sentinel

**Version:** 1.0.0
**Author:** Mark Nienaber

A web-based log viewer for PingOne Advanced Identity Cloud (AIC) with live tailing, historical search, unified AM/IDM views, and intelligent noise filtering.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey)
![License](https://img.shields.io/badge/License-MIT-blue)

## Overview

AIC Sentinel provides a browser-based dashboard for monitoring and searching PingOne Advanced Identity Cloud logs. Unlike CLI-based tools that separate AM and IDM log streams, this tool presents a unified, filterable view of all log sources in a single interface.

Key capabilities:
- **Real-time log streaming** via WebSocket with configurable poll frequency
- **Unified AM + IDM view** - see all logs interleaved, newest first
- **14 noise filter categories** - suppress known noisy loggers by category (Session, Config, REST, Health, LDAP, etc.) with per-category toggle
- **Smart log messages** - contextual message extraction showing event name, principal, journey/tree name, outcome, HTTP method/path, and more
- **Transaction tracing** - hover any transaction ID to reveal a trace badge; click to instantly filter all logs for that transaction
- **Historical search** - query logs by time range with pagination, with a clear banner to resume live tailing
- **Saved connections** - save and manage multiple tenant connections with masked credentials
- **Session persistence** - connection state and filters persist across page refresh
- **Export** - download logs as JSON, human-readable text, or CSV

## Design Philosophy & Related Tools

This tool intentionally uses **pure REST API calls** against the [PingOne AIC Monitoring API](https://docs.pingidentity.com/pingoneaic/latest/tenants/audit-debug-logs-pull.html) with only 3 production dependencies (Express, ws, dotenv). This keeps the codebase small, transparent, and easy to audit - the entire HTTP client is under 170 lines. There is no SDK dependency, no build pipeline, and no framework beyond what's needed for real-time log streaming.

That said, the outstanding [**Frodo CLI**](https://github.com/rockcarver/frodo-cli) and [**Frodo Library (frodo-lib)**](https://github.com/rockcarver/frodo-lib) by the Frodo team deserve special mention. Frodo is a comprehensive, battle-tested toolkit for managing PingOne AIC / ForgeRock environments - covering journeys, scripts, OAuth2 clients, IDM configuration, secrets, variables, and much more - including log tailing and search capabilities. If you're working with AIC environments, Frodo should be in your toolkit:

- **[Frodo CLI](https://github.com/rockcarver/frodo-cli)** - Command-line interface for managing AIC environments, including log access. Excellent for automation, CI/CD pipelines, and power users who prefer the terminal.
- **[Frodo Library (frodo-lib)](https://github.com/rockcarver/frodo-lib)** - The underlying Node.js library that powers Frodo CLI. Provides a comprehensive, typed API for all AIC operations including authentication, configuration management, and log access.
- **[Frodo CLI Documentation](https://github.com/rockcarver/frodo-cli/blob/main/README.md)** - Full usage guide, command reference, and examples.

A future version of AIC Sentinel may integrate with frodo-lib to unlock capabilities beyond log monitoring - such as inspecting journeys, scripts, and OAuth2 clients referenced in log entries, or supporting service account authentication alongside API keys. For now, the pure REST approach keeps the tool focused on what it does best: fast, visual log debugging.

Also worth noting is [**fidc-debug-tools**](https://github.com/vscheuber/fidc-debug-tools) by Volker Scheuber, which was the original inspiration for this project. It provides CLI-based log tailing with configurable filters and is great when you want to pipe output to `jq` or integrate with other shell tools.

## Prerequisites

Before you begin, ensure you have the following:

### 1. Node.js (v18 or higher)

Check your version:

```bash
node --version   # Should be v18.x or higher
npm --version    # Comes bundled with Node.js
```

If you need to install Node.js, download it from [nodejs.org](https://nodejs.org/) or use a version manager like [nvm](https://github.com/nvm-sh/nvm):

```bash
# Using nvm (macOS/Linux)
nvm install 18
nvm use 18
```

### 2. PingOne Advanced Identity Cloud Tenant Access

You need access to a PingOne AIC tenant with permission to create monitoring API keys.

### 3. Log API Key and Secret

You must create a Log API key/secret pair in your AIC tenant:

1. Log in to your PingOne AIC admin console
2. Navigate to **Tenant Settings** > **Log API Keys**
3. Click **New Log API Key**
4. Copy both the **Key ID** and **Secret** - the secret is only shown once

> **Note:** The Log API provides read-only access to audit and debug logs. It does not grant access to modify tenant configuration.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/mark-nienaber/aic-sentinel.git
cd aic-sentinel
```

### 2. Install Dependencies

```bash
npm install
```

This installs only 3 production dependencies:
- `express` - HTTP server and static file serving
- `ws` - WebSocket support for real-time streaming
- `dotenv` - Environment variable loading

### 3. Configure Environment (Optional)

```bash
cp .env.example .env
```

> **Note:** The `.env` file is optional. You can enter all connection details directly in the browser UI instead. See [Connecting to Your Tenant](#connecting-to-your-tenant) below.

If you prefer to pre-configure credentials, edit `.env` with your values:

```env
PORT=3000
TENANT_URL=https://your-tenant.forgeblocks.com
API_KEY_ID=your-api-key-id
API_KEY_SECRET=your-api-key-secret
POLL_FREQUENCY=10
MAX_LOG_BUFFER=5000
```

## Running the Application

### Standard Mode

```bash
npm start
```

### Stop the Server

```bash
npm stop
```

### Development Mode (auto-restart on file changes)

```bash
npm run dev
```

Once started, you will see:

```
AIC Sentinel running at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.



## Connecting to Your Tenant

There are two ways to provide your tenant credentials:

### Option 1: Enter Credentials in the UI

1. Open [http://localhost:3000](http://localhost:3000)
2. Enter your **Tenant URL**, **API Key**, and **API Secret** directly in the connection form
3. Optionally check **Remember connection** to save credentials in your browser's local storage so they persist across sessions
4. Click **Connect**

### Option 2: Pre-configure via `.env` File

1. Copy `.env.example` to `.env` and fill in your credentials (see [Configure Environment](#3-configure-environment-optional))
2. Start the server - the connection form will be pre-filled with your `.env` values
3. Click **Connect**

> **Tip:** You can mix both approaches - pre-fill defaults in `.env` and override them in the UI as needed.

Once connected, live log tailing begins automatically.


### Saved Connections

If you manage multiple tenants, you can save and switch between connections:

1. Enter your tenant credentials and check **Remember connection**
2. The connection is saved to your browser's local storage with the API secret masked
3. Open the **Saved Connections** dropdown to switch between saved tenants
4. Delete saved connections you no longer need

> **Note:** Your connection state (tenant URL, credentials, filters) also persists across page refreshes via session storage, so you won't lose your place if you accidentally close the tab.

## Usage Guide

### Live Log Tailing

- Logs stream in real-time from your tenant via WebSocket
- By default, both AM and IDM logs are shown in a unified view
- **Newest logs appear at the top** - no need to scroll down to see what just happened
- Logs are color-coded by source: **amber** for AM, **cyan** for IDM
- Log levels are color-coded: **red** = ERROR, **yellow** = WARNING, **blue** = INFO, **gray** = DEBUG
- The message column shows contextual summaries: event name, principal, journey/tree name, node outcome, HTTP request path, and more - making it easy to find relevant logs before expanding
- Click any log row to expand it and see the full JSON payload with syntax highlighting
- Auto-scroll keeps you at the top (newest logs); scroll down to browse history, then click **Latest logs** to return

### Filtering

Use the filter bar to narrow down logs:

| Filter | Description |
|--------|-------------|
| **Sources** | Select which log sources to include (AM, IDM, or specific sub-sources) |
| **Level** | Filter by log level (ERROR, WARNING, INFO, DEBUG) |
| **Search** | Free-text search across log messages, loggers, and full payloads |
| **Transaction ID** | Filter by a specific transaction ID - hover any transaction ID in the log viewer to see a trace badge, then click to auto-filter |
| **Noise Filter** | Dropdown with 14 categories of noisy loggers grouped by severity (High/Medium/Low/IDM). Toggle individual categories on/off. Defaults: High + Medium + IDM enabled, Low disabled |



### Transaction Tracing

Transaction IDs link related log entries across AM and IDM. To trace a transaction:

1. **Hover** over any transaction ID in the log viewer - it transforms into an orange **Trace** badge
2. **Click** the badge to filter all logs to that transaction ID
3. The Transaction ID filter input highlights orange when active
4. Click the **×** button on the filter input to clear and return to the full log view

This is especially useful for following authentication flows, OAuth token exchanges, or IDM sync operations that span multiple log entries.



### Historical Search

Click the clock icon to open the historical search panel:

1. Select a quick time range (Last 15 min, 1 hour, 6 hours, 24 hours) or set custom start/end times
2. Optionally filter by Transaction ID or add a custom query filter
3. Click **Search** to fetch results
4. Use **Load More** for paginated results (the API returns up to 1000 logs per page)
5. A prominent banner shows you are viewing historical results - click **Resume Live Tailing** to switch back
6. The status bar shows a **Historical** indicator (amber) when live tailing is paused

> **Note:** The AIC Monitoring API limits historical queries to 24-hour windows. For longer ranges, the tool automatically splits the request into sequential 24-hour chunks.
> 


### Exporting Logs

Click the export icon in the toolbar to download logs:

| Format | Description |
|--------|-------------|
| **JSON** | Pretty-printed JSON array of all log entries |
| **Text** | Human-readable formatted text with timestamps, sources, levels, and messages |
| **CSV** | Comma-separated values with columns: timestamp, source, level, logger, transactionId, message |

You can export either all logs in the buffer or only the currently filtered/visible logs.



### Settings

Click the gear icon to access settings:

| Setting | Description | Default |
|---------|-------------|---------|
| **Poll Frequency** | Seconds between API polls (2–30) | 10 |
| **Max Buffer Size** | Maximum logs held in browser memory (1,000–10,000) | 5000 |
| **Auto-scroll** | Automatically scroll to newest logs | On |
| **Noise Categories** | View and toggle all 14 noise categories with expandable logger lists for each | - |
| **Muted Loggers** | Manually mute individual loggers - you can also hover any logger name in the log viewer and click the mute icon to quickly silence it | - |



## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server listen port | `3000` |
| `TENANT_URL` | Full URL of your AIC tenant (e.g., `https://tenant.forgeblocks.com`) | - |
| `API_KEY_ID` | Log API key ID from tenant settings | - |
| `API_KEY_SECRET` | Log API secret from tenant settings | - |
| `POLL_FREQUENCY` | Default seconds between tail polls | `10` |
| `MAX_LOG_BUFFER` | Default max logs in browser memory | `5000` |
| `TEST_USER` | Username for E2E tests (required for `npm run test:e2e`) | - |
| `TEST_PASS` | Password for E2E tests (required for `npm run test:e2e`) | - |

### Available Log Sources

| Source | Description |
|--------|-------------|
| `am-everything` | All AM logs combined |
| `am-authentication` | Authentication events |
| `am-access` | Access audit logs |
| `am-core` | Core AM debug logs |
| `am-config` | Configuration change logs |
| `idm-everything` | All IDM logs combined |
| `idm-sync` | Synchronization operations |
| `idm-activity` | Identity object changes |
| `idm-access` | IDM access events |
| `idm-core` | Core IDM debug logs |



## Testing - Really only useful for development of this app

### End-to-End Tests

The E2E test suite makes real API calls against your PingOne AIC tenant to verify the full stack - REST API, WebSocket tailing, monitoring API, noise filtering, and message extraction.

**Prerequisites:**
- The server must be running (`npm start`)
- Set `TEST_USER` and `TEST_PASS` in your `.env` file (a valid PingOne AIC user in the alpha realm)
- `TENANT_URL`, `API_KEY_ID`, and `API_KEY_SECRET` must also be set

**Run the tests:**

```bash
npm run test:e2e
```

The suite runs 48 tests across 6 groups:

| Group | What it tests |
|-------|---------------|
| **REST API** | Server health, config endpoint, sources endpoint, connection/disconnection |
| **Tenant Activity** | AM authentication (success + failure), IDM user queries, OAuth well-known |
| **Monitoring API** | Direct log tail/query against AIC Monitoring API, rate limit headers |
| **WebSocket Tailing** | Connect, authenticate, start/stop tailing, receive logs via WebSocket |
| **Noise Filters** | All 14 noise categories filter the correct loggers (exact + prefix matching) |
| **Message Extraction** | Contextual message summaries for authentication, access, activity, and other log types |

> **Note:** Tests require a live tenant with real activity. Some tests generate activity (authentication attempts, IDM queries) to ensure logs are available for verification.

## Architecture

```
aic-sentinel/
├── server.js                 # Express + WebSocket entry point
├── package.json
├── .env.example              # Configuration template
├── .env                      # Your config (gitignored)
├── src/
│   ├── api/
│   │   ├── logClient.js      # AIC Monitoring API client (tail + query)
│   │   └── rateLimiter.js    # Rate limit tracking (X-RateLimit headers)
│   ├── ws/
│   │   └── tailManager.js    # Per-client WebSocket polling manager
│   ├── routes/
│   │   ├── connection.js     # POST /api/connect
│   │   └── logs.js           # Search, config, sources endpoints
│   └── data/
│       ├── categories.json   # 14 noise filter category definitions
│       └── sources.json      # Log source metadata
├── tests/
│   └── e2e.test.js           # End-to-end test suite (48 tests)
└── public/
    ├── index.html            # Single-page application
    ├── css/app.css           # Custom styles
    └── js/
        ├── app.js            # Alpine.js store + WebSocket client
        └── utils/
            ├── formatter.js  # Log formatting + JSON highlighting
            └── timeUtils.js  # Date/time utilities
```

- **Backend:** Node.js with Express for HTTP + ws library for WebSocket streaming
- **Frontend:** Tailwind CSS + Alpine.js loaded via CDN - no build step required
- **API Integration:** Uses the [PingOne AIC Monitoring API](https://docs.pingidentity.com/pingoneaic/tenants/audit-debug-logs-pull.html) with rate limit awareness (60 requests/minute)
- **Only 3 production dependencies** - lightweight and easy to audit

## Troubleshooting

### Port already in use

If you see `EADDRINUSE: address already in use :::3000`:

```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm start
```

### Connection fails

- Verify your tenant URL includes `https://` and does not have a trailing slash
- Confirm your API Key ID and Secret are correct (secrets cannot be retrieved after creation - generate a new one if lost)
- Ensure your network can reach the tenant (check firewalls, VPN, proxies)

### No logs appearing

- Ensure there is activity on your tenant generating logs
- Check that the selected log sources are correct
- Open the Noise Filter dropdown and try disabling some categories to see if logs are being filtered out
- Check the rate limit indicator in the status bar - if at 0 remaining, wait for the reset

### Rate limiting

The AIC Monitoring API allows 60 requests per minute. The status bar shows current usage. If you hit the limit, the tool automatically backs off and resumes when the limit resets.

## License

MIT
