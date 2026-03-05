import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { logger } from '../lib/logger.js'
import fs from 'fs/promises'
import path from 'path'
import { writeEnvVar } from '../utils/env-writer.js'

const TestDbSchema = z.object({
  databaseUrl: z.string().url('URL de base de datos inválida')
})

const SetPasswordSchema = z.object({
  password: z.string().min(6, 'Password debe tener al menos 6 caracteres')
})

const SaveDomainSchema = z.object({
  protocol: z.enum(['http', 'https']),
  domain: z.string().min(1, 'Domain is required').regex(/^[a-zA-Z0-9.-]+$/, 'Domain must be a valid hostname'),
  port: z.string().regex(/^\d+$/, 'Port must be numeric').optional().or(z.literal(''))
})

/**
 * Assembles a gateway public URL from its parts.
 * Default ports (80 for http, 443 for https) are omitted from the URL.
 */
export function assembleGatewayUrl(protocol: string, domain: string, port?: string): string {
  const defaultPorts: Record<string, string> = { http: '80', https: '443' }
  const includePort = port && port !== '' && port !== defaultPorts[protocol]
  return includePort ? `${protocol}://${domain}:${port}` : `${protocol}://${domain}`
}

export async function registerSetupRoutes(app: FastifyInstance) {
  // GET /setup - Interfaz web de configuración (5-step gated wizard)
  app.get('/setup', async (_request, reply) => {
    return reply.type('text/html').send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${process.env.APP_NAME || 'Objetiva Sync Gateway'} - Setup Wizard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }

    .container {
      max-width: 640px;
      width: 100%;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
      margin-top: 20px;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 28px 32px 20px;
      text-align: center;
    }

    .header h1 { font-size: 24px; margin-bottom: 6px; }
    .header p { opacity: 0.85; font-size: 13px; }

    /* Progress stepper */
    .stepper {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      padding: 20px 32px 16px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    .stepper-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex: 1;
      position: relative;
    }

    .stepper-item:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 16px;
      left: calc(50% + 16px);
      right: calc(-50% + 16px);
      height: 2px;
      background: #e5e7eb;
      z-index: 0;
    }

    .stepper-item.completed:not(:last-child)::after { background: #10b981; }

    .stepper-dot {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      z-index: 1;
      transition: all 0.2s;
    }

    .stepper-item.upcoming .stepper-dot {
      background: #e5e7eb;
      color: #9ca3af;
      border: 2px solid #e5e7eb;
    }

    .stepper-item.current .stepper-dot {
      background: white;
      color: #667eea;
      border: 2px solid #667eea;
    }

    .stepper-item.completed .stepper-dot {
      background: #10b981;
      color: white;
      border: 2px solid #10b981;
    }

    .stepper-label {
      font-size: 10px;
      color: #9ca3af;
      text-align: center;
      font-weight: 500;
      line-height: 1.2;
    }

    .stepper-item.current .stepper-label { color: #667eea; font-weight: 600; }
    .stepper-item.completed .stepper-label { color: #10b981; }

    /* Wizard steps */
    .content { padding: 32px; }

    .wizard-step { display: none; }
    .wizard-step.active { display: block; }

    .step-title {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 6px;
    }

    .step-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .form-group { margin-bottom: 18px; }

    .form-row {
      display: flex;
      gap: 12px;
    }

    .form-row .form-group { flex: 1; }
    .form-row .form-group.port-field { flex: 0 0 100px; }

    label {
      display: block;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
      font-size: 13px;
    }

    input, select {
      width: 100%;
      padding: 10px 12px;
      border: 1.5px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
      background: white;
      color: #111827;
    }

    input:focus, select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .input-hint { font-size: 12px; color: #9ca3af; margin-top: 4px; }

    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5568d3; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102,126,234,0.4); }

    .btn-secondary { background: #f3f4f6; color: #374151; }
    .btn-secondary:hover { background: #e5e7eb; }

    .btn-warning { background: #f59e0b; color: white; }
    .btn-warning:hover { background: #d97706; }

    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 24px; align-items: center; }

    .alert {
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      display: none;
      line-height: 1.5;
    }

    .alert.show { display: block; }

    .alert-success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .alert-info { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .alert-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

    .spinner {
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.5);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .advanced-toggle {
      font-size: 12px;
      color: #667eea;
      cursor: pointer;
      text-decoration: underline;
      background: none;
      border: none;
      padding: 0;
      margin-bottom: 12px;
    }

    .advanced-section { display: none; }
    .advanced-section.show { display: block; }

    /* Summary (download step) */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }

    .summary-item {
      background: #f9fafb;
      border-radius: 8px;
      padding: 12px 14px;
    }

    .summary-label {
      font-size: 11px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 13px;
      color: #111827;
      font-weight: 500;
      word-break: break-all;
    }

    .summary-value.not-configured { color: #ef4444; font-style: italic; }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-warning { background: #fef3c7; color: #92400e; }

    code {
      background: #f3f4f6;
      padding: 1px 5px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }

    .configured-indicator {
      display: none;
      font-size: 12px;
      color: #10b981;
      margin-top: 4px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${process.env.APP_NAME || 'Objetiva Sync Gateway'}</h1>
      <p>Setup Wizard</p>
    </div>

    <!-- Progress Stepper -->
    <div class="stepper" id="stepper">
      <div class="stepper-item current" id="step-indicator-0">
        <div class="stepper-dot">1</div>
        <div class="stepper-label">Database</div>
      </div>
      <div class="stepper-item upcoming" id="step-indicator-1">
        <div class="stepper-dot">2</div>
        <div class="stepper-label">Domain</div>
      </div>
      <div class="stepper-item upcoming" id="step-indicator-2">
        <div class="stepper-dot">3</div>
        <div class="stepper-label">JWT</div>
      </div>
      <div class="stepper-item upcoming" id="step-indicator-3">
        <div class="stepper-dot">4</div>
        <div class="stepper-label">Password</div>
      </div>
      <div class="stepper-item upcoming" id="step-indicator-4">
        <div class="stepper-dot">5</div>
        <div class="stepper-label">Download</div>
      </div>
      <div class="stepper-item upcoming" id="step-indicator-5">
        <div class="stepper-dot">6</div>
        <div class="stepper-label">Link Sync</div>
      </div>
    </div>

    <div class="content">

      <!-- Step 0: Database -->
      <div class="wizard-step active" id="wizard-step-0">
        <div class="step-title">Step 1 of 6 — Database</div>
        <p class="step-subtitle">Configure the connection to your PostgreSQL database. The system will test the connection before proceeding.</p>

        <div class="form-row">
          <div class="form-group">
            <label for="db-host">Host</label>
            <input type="text" id="db-host" placeholder="localhost">
          </div>
          <div class="form-group port-field">
            <label for="db-port">Port</label>
            <input type="text" id="db-port" placeholder="5432" value="5432">
          </div>
        </div>

        <div class="form-group">
          <label for="db-user">Username</label>
          <input type="text" id="db-user" placeholder="postgres">
        </div>

        <div class="form-group">
          <label for="db-password">Password</label>
          <input type="password" id="db-password" placeholder="••••••••">
          <div id="db-password-configured" class="configured-indicator">[configured — leave empty to keep current]</div>
        </div>

        <div class="form-group">
          <label for="db-name">Database Name</label>
          <input type="text" id="db-name" placeholder="objetiva_db">
        </div>

        <div id="db-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-primary" onclick="testDbAndNext()" id="test-db-btn">
            Test Connection &amp; Next
          </button>
        </div>
      </div>

      <!-- Step 1: Domain -->
      <div class="wizard-step" id="wizard-step-1">
        <div class="step-title">Step 2 of 6 — Domain</div>
        <p class="step-subtitle">Configure the public URL where this gateway will be reachable. This is required for pairing with the sync client.</p>

        <div class="form-row">
          <div class="form-group" style="flex: 0 0 110px;">
            <label for="domain-protocol">Protocol</label>
            <select id="domain-protocol">
              <option value="https" selected>https</option>
              <option value="http">http</option>
            </select>
          </div>
          <div class="form-group">
            <label for="domain-input">Domain</label>
            <input type="text" id="domain-input" placeholder="gateway.example.com">
          </div>
        </div>

        <button class="advanced-toggle" onclick="toggleAdvanced()" id="advanced-toggle-btn">+ Advanced (custom port)</button>
        <div class="advanced-section" id="advanced-section">
          <div class="form-group" style="max-width: 160px;">
            <label for="domain-port">Port</label>
            <input type="text" id="domain-port" placeholder="leave empty for default">
          </div>
        </div>

        <div id="domain-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-secondary" onclick="goBack()" id="domain-back-btn">Back</button>
          <button class="btn btn-primary" onclick="saveDomainAndNext()" id="save-domain-btn">Save &amp; Next</button>
          <button class="btn btn-warning" onclick="skipDomain()" id="skip-domain-btn">Skip (not recommended)</button>
        </div>
      </div>

      <!-- Step 2: JWT Secret -->
      <div class="wizard-step" id="wizard-step-2">
        <div class="step-title">Step 3 of 6 — JWT Secret</div>
        <p class="step-subtitle">Set the JWT signing secret. It must match the value configured in your Objetiva Sync client for tokens to be valid.</p>

        <div class="form-group">
          <label for="jwt-secret">JWT Secret</label>
          <input type="text" id="jwt-secret" placeholder="64-character hex string">
          <div id="jwt-configured" class="configured-indicator"></div>
          <div class="input-hint">Minimum 32 characters. Use "Generate" to create a secure random value.</div>
        </div>

        <div id="jwt-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-secondary" onclick="goBack()">Back</button>
          <button class="btn btn-secondary" onclick="generateJwtSecret()">Generate JWT Secret</button>
          <button class="btn btn-primary" onclick="saveJwtAndNext()" id="save-jwt-btn">Save &amp; Next</button>
        </div>
      </div>

      <!-- Step 3: Password -->
      <div class="wizard-step" id="wizard-step-3">
        <div class="step-title">Step 4 of 6 — Admin Password</div>
        <p class="step-subtitle">Configure the password for the <strong>admin</strong> user. This will be used to authenticate from the sync client.</p>

        <div class="alert alert-info show" style="margin-bottom: 18px;">
          Username: <strong>admin</strong> (fixed)
        </div>

        <div class="form-group">
          <label for="admin-password">Password</label>
          <input type="password" id="admin-password" placeholder="At least 6 characters">
          <div class="input-hint">Minimum 6 characters.</div>
        </div>

        <div id="password-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-secondary" onclick="goBack()">Back</button>
          <button class="btn btn-primary" onclick="savePasswordAndNext()" id="save-password-btn">Save &amp; Next</button>
        </div>
      </div>

      <!-- Step 4: Download -->
      <div class="wizard-step" id="wizard-step-4">
        <div class="step-title">Step 5 of 6 — Download Configuration</div>
        <p class="step-subtitle">Review your configuration and download the <code>.env</code> file. Restart the server to apply all changes.</p>

        <div id="download-alert" class="alert"></div>
        <div id="summary-loading" style="color: #9ca3af; font-size: 13px; margin-bottom: 16px;">Loading summary...</div>

        <div id="summary-container" style="display: none;">
          <div class="summary-grid" id="summary-grid"></div>
        </div>

        <div id="domain-skip-warning" class="alert alert-warning" style="display: none;">
          Warning: Gateway public URL is not configured. Pairing with the sync client will not work until a domain is set.
        </div>

        <div class="btn-group">
          <button class="btn btn-secondary" onclick="goBack()">Back</button>
          <button class="btn btn-primary" onclick="downloadEnv()" id="download-btn">Download .env</button>
          <button class="btn btn-secondary" onclick="copyEnvToClipboard()" id="copy-env-btn">Copy .env</button>
          <button class="btn btn-primary" onclick="advanceStep()" id="next-to-link-btn">Next &rarr;</button>
        </div>

        <p style="margin-top: 20px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px;">
          After downloading, replace the <code>.env</code> file on your server and restart the process to apply all changes.
        </p>
      </div>

      <!-- Step 5: Link Sync Client -->
      <div class="wizard-step" id="wizard-step-5">
        <h2 class="step-title">Step 6 of 6 — Link Sync Client</h2>
        <p class="step-subtitle">Enter this code in your Objetiva Sync dashboard to automatically configure the connection.</p>

        <!-- Domain gating warning (hidden by default) -->
        <div id="pairing-no-domain-warning" style="display:none;">
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0;">
            <strong>Domain Required</strong>
            <p style="margin-top:8px;">GATEWAY_PUBLIC_URL must be configured before generating a pairing code. Go back to Step 2 (Domain) to set it.</p>
          </div>
        </div>

        <!-- Code display (hidden until generated) -->
        <div id="pairing-code-container" style="display:none;">
          <div style="text-align:center;margin:24px 0;">
            <div id="pairing-code-display" style="font-family:monospace;font-size:2.5rem;font-weight:700;letter-spacing:0.3em;background:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;padding:20px 32px;display:inline-block;user-select:all;"></div>
          </div>
          <div style="text-align:center;margin:12px 0;">
            <button type="button" id="pairing-copy-btn" class="btn btn-secondary" onclick="copyPairingCode()" style="margin-right:12px;">Copy Code</button>
            <button type="button" id="pairing-regenerate-btn" class="btn btn-primary" onclick="regeneratePairingCode()">Generate New Code</button>
          </div>
          <div id="pairing-countdown" style="text-align:center;color:#64748b;font-size:0.9rem;margin:8px 0;"></div>
          <div id="pairing-error" style="display:none;color:#ef4444;text-align:center;margin:8px 0;"></div>
        </div>

        <div class="btn-group" style="margin-top:24px;">
          <button class="btn btn-secondary" onclick="goBack()">Back</button>
        </div>
      </div>

    </div>
  </div>

  <script>
    const state = {
      currentStep: 0,
      completedSteps: new Set(),
      stepData: {}
    };

    const TOTAL_STEPS = 6;

    // ── Stepper UI ──────────────────────────────────────────────────────────
    function updateStepper() {
      for (let i = 0; i < TOTAL_STEPS; i++) {
        const indicator = document.getElementById('step-indicator-' + i);
        if (!indicator) continue;
        if (state.completedSteps.has(i)) {
          indicator.className = 'stepper-item completed';
          indicator.querySelector('.stepper-dot').textContent = '✓';
        } else if (i === state.currentStep) {
          indicator.className = 'stepper-item current';
          indicator.querySelector('.stepper-dot').textContent = String(i + 1);
        } else {
          indicator.className = 'stepper-item upcoming';
          indicator.querySelector('.stepper-dot').textContent = String(i + 1);
        }
      }
    }

    function showStep(index) {
      document.querySelectorAll('.wizard-step').forEach(function(el) {
        el.classList.remove('active');
      });
      const target = document.getElementById('wizard-step-' + index);
      if (target) target.classList.add('active');
      state.currentStep = index;
      updateStepper();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goBack() {
      if (state.currentStep > 0) {
        showStep(state.currentStep - 1);
      }
    }

    function advanceStep() {
      state.completedSteps.add(state.currentStep);
      const next = state.currentStep + 1;
      showStep(next);
      if (next === 4) {
        loadDownloadSummary();
      }
      if (next === 5) {
        enterPairingStep();
      }
    }

    // ── Alert helpers ────────────────────────────────────────────────────────
    function showAlert(id, type, message) {
      const el = document.getElementById(id);
      el.className = 'alert alert-' + type + ' show';
      el.textContent = message;
    }

    function showAlertHtml(id, type, html) {
      const el = document.getElementById(id);
      el.className = 'alert alert-' + type + ' show';
      el.innerHTML = html;
    }

    function hideAlert(id) {
      const el = document.getElementById(id);
      el.className = 'alert';
      el.textContent = '';
    }

    // ── Step 0: Database ─────────────────────────────────────────────────────
    function assembleDbUrl() {
      const host = document.getElementById('db-host').value.trim();
      const port = document.getElementById('db-port').value.trim() || '5432';
      const user = document.getElementById('db-user').value.trim();
      const pass = document.getElementById('db-password').value;
      const dbName = document.getElementById('db-name').value.trim();
      return 'postgresql://' + encodeURIComponent(user) + ':' + encodeURIComponent(pass) + '@' + host + ':' + port + '/' + dbName;
    }

    async function testDbAndNext() {
      const host = document.getElementById('db-host').value.trim();
      const user = document.getElementById('db-user').value.trim();
      const dbName = document.getElementById('db-name').value.trim();

      if (!host || !user || !dbName) {
        showAlert('db-alert', 'error', 'Please fill in host, username, and database name.');
        return;
      }

      const btn = document.getElementById('test-db-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Testing connection...';
      hideAlert('db-alert');

      const dbUrl = assembleDbUrl();

      try {
        const res = await fetch('/api/setup/test-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ databaseUrl: dbUrl })
        });
        const data = await res.json();

        if (data.success) {
          // Store connection info (no password)
          state.stepData.db = {
            host: document.getElementById('db-host').value.trim(),
            port: document.getElementById('db-port').value.trim() || '5432',
            user: document.getElementById('db-user').value.trim(),
            dbName: document.getElementById('db-name').value.trim()
          };
          let infoMsg = 'Connection successful.';
          if (data.tables && data.tables.length > 0) {
            infoMsg += ' Tables found: ' + data.tables.join(', ') + '.';
          }
          showAlert('db-alert', 'success', infoMsg);
          setTimeout(function() { advanceStep(); }, 800);
        } else {
          showAlert('db-alert', 'error', 'Connection failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        showAlert('db-alert', 'error', 'Connection failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection & Next';
      }
    }

    // ── Step 1: Domain ────────────────────────────────────────────────────────
    function toggleAdvanced() {
      const section = document.getElementById('advanced-section');
      const btn = document.getElementById('advanced-toggle-btn');
      if (section.classList.contains('show')) {
        section.classList.remove('show');
        btn.textContent = '+ Advanced (custom port)';
      } else {
        section.classList.add('show');
        btn.textContent = '- Advanced (custom port)';
      }
    }

    async function saveDomainAndNext() {
      const protocol = document.getElementById('domain-protocol').value;
      const domain = document.getElementById('domain-input').value.trim();
      const portRaw = document.getElementById('domain-port').value.trim();

      if (!domain) {
        showAlert('domain-alert', 'error', 'Please enter a domain name.');
        return;
      }

      // Omit port if it matches the protocol default
      const defaultPorts = { http: '80', https: '443' };
      const port = (portRaw && portRaw !== defaultPorts[protocol]) ? portRaw : undefined;

      const btn = document.getElementById('save-domain-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving...';
      hideAlert('domain-alert');

      try {
        const payload = { protocol, domain };
        if (port) payload.port = port;

        const res = await fetch('/api/setup/save-domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          state.stepData.domainSkipped = false;
          state.stepData.gatewayUrl = data.url;
          advanceStep();
        } else {
          showAlert('domain-alert', 'error', data.error || 'Failed to save domain. Check the format.');
        }
      } catch (err) {
        showAlert('domain-alert', 'error', 'Request failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save & Next';
      }
    }

    function skipDomain() {
      showAlert('domain-alert', 'warning', 'Without a public URL, pairing will not work. You can configure this later by re-running the wizard.');
      state.stepData.domainSkipped = true;
      setTimeout(function() { advanceStep(); }, 1200);
    }

    // ── Step 2: JWT Secret ────────────────────────────────────────────────────
    function generateJwtSecret() {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const hex = Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      document.getElementById('jwt-secret').value = hex;
      hideAlert('jwt-alert');
    }

    async function saveJwtAndNext() {
      const secret = document.getElementById('jwt-secret').value.trim();

      if (secret.length < 32) {
        showAlert('jwt-alert', 'error', 'JWT secret must be at least 32 characters.');
        return;
      }

      const btn = document.getElementById('save-jwt-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving...';
      hideAlert('jwt-alert');

      try {
        const res = await fetch('/api/setup/save-jwt-secret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jwtSecret: secret })
        });
        const data = await res.json();

        if (data.success) {
          advanceStep();
        } else {
          showAlert('jwt-alert', 'error', data.error || 'Failed to save JWT secret.');
        }
      } catch (err) {
        showAlert('jwt-alert', 'error', 'Request failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save & Next';
      }
    }

    // ── Step 3: Password ──────────────────────────────────────────────────────
    async function savePasswordAndNext() {
      const password = document.getElementById('admin-password').value;

      if (password.length < 6) {
        showAlert('password-alert', 'error', 'Password must be at least 6 characters.');
        return;
      }

      const btn = document.getElementById('save-password-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving...';
      hideAlert('password-alert');

      try {
        const res = await fetch('/api/setup/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (data.success) {
          // Obtain a JWT token now while we still have the password value.
          // The token is needed by step 6 to call POST /api/pairing/generate.
          try {
            const loginRes = await fetch('/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: 'admin', password: password })
            });
            const loginData = await loginRes.json();
            if (loginData.success && loginData.token) {
              state.token = loginData.token;
            }
          } catch (_) {
            // Token fetch is best-effort; step 6 will show an error if it fails
          }
          // Clear password from DOM (security — never store in stepData)
          document.getElementById('admin-password').value = '';
          advanceStep();
        } else {
          showAlert('password-alert', 'error', data.error || 'Failed to set password.');
        }
      } catch (err) {
        showAlert('password-alert', 'error', 'Request failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save & Next';
      }
    }

    // ── Step 4: Download ──────────────────────────────────────────────────────
    async function loadDownloadSummary() {
      const loadingEl = document.getElementById('summary-loading');
      const containerEl = document.getElementById('summary-container');
      const skipWarningEl = document.getElementById('domain-skip-warning');

      loadingEl.style.display = 'block';
      containerEl.style.display = 'none';

      try {
        const res = await fetch('/api/setup/status');
        const data = await res.json();

        const grid = document.getElementById('summary-grid');
        grid.innerHTML = '';

        function addSummaryItem(label, value, isWarning) {
          const item = document.createElement('div');
          item.className = 'summary-item';
          const labelEl = document.createElement('div');
          labelEl.className = 'summary-label';
          labelEl.textContent = label;
          const valueEl = document.createElement('div');
          valueEl.className = 'summary-value' + (isWarning ? ' not-configured' : '');
          valueEl.textContent = value;
          item.appendChild(labelEl);
          item.appendChild(valueEl);
          grid.appendChild(item);
        }

        // Database
        if (data.database) {
          addSummaryItem('Database Host', data.database.host + ':' + data.database.port, false);
          addSummaryItem('Database Name', data.database.database, false);
          addSummaryItem('DB Username', data.database.username, false);
        } else {
          addSummaryItem('Database', 'Not configured', true);
        }

        // Gateway URL
        if (data.gatewayUrl) {
          addSummaryItem('Gateway URL', data.gatewayUrl, false);
          skipWarningEl.style.display = 'none';
        } else {
          addSummaryItem('Gateway URL', 'Not configured', true);
          if (state.stepData.domainSkipped) {
            skipWarningEl.style.display = 'block';
          }
        }

        // JWT
        if (data.jwt) {
          addSummaryItem('JWT Secret', data.jwt.length + ' chars: ' + data.jwt.preview, false);
        } else {
          addSummaryItem('JWT Secret', 'Not configured', true);
        }

        // Auth
        if (data.auth) {
          const badge = document.createElement('div');
          badge.className = 'summary-item';
          const labelEl = document.createElement('div');
          labelEl.className = 'summary-label';
          labelEl.textContent = 'Auth Username';
          const valueEl = document.createElement('div');
          valueEl.className = 'summary-value';
          const nameSpan = document.createElement('span');
          nameSpan.textContent = data.auth.username + ' ';
          const configuredBadge = document.createElement('span');
          configuredBadge.className = 'badge badge-success';
          configuredBadge.textContent = 'configured';
          valueEl.appendChild(nameSpan);
          valueEl.appendChild(configuredBadge);
          badge.appendChild(labelEl);
          badge.appendChild(valueEl);
          grid.appendChild(badge);
        } else {
          addSummaryItem('Auth', 'Not configured', true);
        }

        loadingEl.style.display = 'none';
        containerEl.style.display = 'block';
      } catch (err) {
        loadingEl.textContent = 'Could not load configuration summary.';
      }
    }

    function downloadEnv() {
      window.location.href = '/api/setup/generate-env';
    }

    async function copyEnvToClipboard() {
      var btn = document.getElementById('copy-env-btn');
      btn.disabled = true;
      btn.textContent = 'Copying...';
      try {
        var res = await fetch('/api/setup/generate-env');
        var text = await res.text();
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy .env'; btn.disabled = false; }, 2000);
      } catch (err) {
        showAlert('download-alert', 'error', 'Could not copy to clipboard: ' + err.message);
        btn.textContent = 'Copy .env';
        btn.disabled = false;
      }
    }

    // ── Step 5: Link Sync Client ──────────────────────────────────────────────
    let countdownInterval = null;

    async function enterPairingStep() {
      const warningEl = document.getElementById('pairing-no-domain-warning');
      const codeEl = document.getElementById('pairing-code-container');
      const errorEl = document.getElementById('pairing-error');

      // Check if domain was configured
      const hasDomain = state.stepData.gatewayUrl && !state.stepData.domainSkipped;

      if (!hasDomain) {
        warningEl.style.display = 'block';
        codeEl.style.display = 'none';
        return;
      }

      warningEl.style.display = 'none';
      codeEl.style.display = 'block';
      if (errorEl) errorEl.style.display = 'none';

      // Auto-generate on step enter
      await fetchPairingCode();
    }

    async function fetchPairingCode() {
      const displayEl = document.getElementById('pairing-code-display');
      const errorEl = document.getElementById('pairing-error');
      const countdownEl = document.getElementById('pairing-countdown');
      const regenBtn = document.getElementById('pairing-regenerate-btn');

      if (regenBtn) regenBtn.disabled = true;

      try {
        const res = await fetch('/api/pairing/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + state.token
          }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to generate code');

        displayEl.textContent = data.code;
        if (errorEl) errorEl.style.display = 'none';
        startCountdown(data.expiresAt);
      } catch (err) {
        displayEl.textContent = '------';
        if (errorEl) {
          errorEl.textContent = 'Error generating code: ' + err.message;
          errorEl.style.display = 'block';
        }
        if (countdownEl) countdownEl.textContent = '';
      } finally {
        if (regenBtn) regenBtn.disabled = false;
      }
    }

    function startCountdown(expiresAt) {
      if (countdownInterval) clearInterval(countdownInterval);
      function tick() {
        const remaining = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        const el = document.getElementById('pairing-countdown');
        if (el) {
          el.textContent = remaining > 0
            ? 'Expires in ' + mins + ':' + secs.toString().padStart(2, '0')
            : 'Code expired \u2014 click Generate New Code';
        }
        if (remaining === 0) clearInterval(countdownInterval);
      }
      tick();
      countdownInterval = setInterval(tick, 1000);
    }

    function copyPairingCode() {
      const code = document.getElementById('pairing-code-display').textContent;
      if (code && code !== '------') {
        navigator.clipboard.writeText(code).then(function() {
          const btn = document.getElementById('pairing-copy-btn');
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = orig; }, 2000);
        });
      }
    }

    async function regeneratePairingCode() {
      await fetchPairingCode();
    }

    // ── Pre-fill on load ──────────────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', async function() {
      try {
        const [preflight, status] = await Promise.all([
          fetch('/api/setup/preflight').then(function(r) { return r.json(); }),
          fetch('/api/setup/status').then(function(r) { return r.json(); })
        ]);

        // Pre-fill DB fields
        if (status.database) {
          document.getElementById('db-host').value = status.database.host;
          document.getElementById('db-port').value = status.database.port;
          document.getElementById('db-user').value = status.database.username;
          document.getElementById('db-name').value = status.database.database;
          // Show configured placeholder for password
          document.getElementById('db-password-configured').style.display = 'block';
        }

        // Pre-fill domain
        if (status.gatewayUrl) {
          try {
            const url = new URL(status.gatewayUrl);
            document.getElementById('domain-protocol').value = url.protocol.replace(':', '');
            document.getElementById('domain-input').value = url.hostname;
            if (url.port) {
              document.getElementById('domain-port').value = url.port;
              document.getElementById('advanced-section').classList.add('show');
              document.getElementById('advanced-toggle-btn').textContent = '- Advanced (custom port)';
            }
          } catch (_) {}
        }

        // JWT configured indicator
        if (status.jwt) {
          const jwtIndicator = document.getElementById('jwt-configured');
          jwtIndicator.style.display = 'block';
          jwtIndicator.textContent = 'Currently configured (' + status.jwt.length + ' chars): ' + status.jwt.preview;
        }

        // Suppress unused preflight variable warning
        void preflight;
      } catch (_) {
        // Silently continue — pre-fill is best-effort
      }
    });
  </script>
</body>
</html>
    `)
  })

  // POST /api/setup/test-db - Probar conexión a PostgreSQL
  app.post('/api/setup/test-db', async (request, reply) => {
    try {
      const { databaseUrl } = TestDbSchema.parse(request.body)

      // Crear cliente temporal de Prisma
      const tempPrisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl
          }
        }
      })

      try {
        // Intentar conectar
        await tempPrisma.$connect()
        await tempPrisma.$queryRaw`SELECT 1`

        // Persist DATABASE_URL so the summary step reads the current value
        await writeEnvVar('DATABASE_URL', databaseUrl)
        logger.info({ databaseUrl: databaseUrl.replace(/:[^:@]+@/, ':***@') }, 'Conexión a DB exitosa')

        return reply.send({ success: true })
      } finally {
        await tempPrisma.$disconnect()
      }
    } catch (error) {
      logger.error({ error }, 'Error al probar conexión a DB')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al conectar a la base de datos'
      })
    }
  })

  // POST /api/setup/save-jwt-secret - Guardar JWT secret en .env
  app.post('/api/setup/save-jwt-secret', async (request, reply) => {
    try {
      const { jwtSecret } = z.object({ jwtSecret: z.string().min(32) }).parse(request.body)

      await writeEnvVar('JWT_SECRET', jwtSecret)

      logger.info('JWT Secret guardado en .env')

      return reply.send({ success: true })
    } catch (error) {
      logger.error({ error }, 'Error al guardar JWT secret')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al guardar JWT secret'
      })
    }
  })

  // POST /api/setup/verify-tables - Verificar que las tablas existan
  app.post('/api/setup/verify-tables', async (request, reply) => {
    try {
      const { databaseUrl } = TestDbSchema.parse(request.body)

      // Actualizar DATABASE_URL en .env
      await writeEnvVar('DATABASE_URL', databaseUrl)

      // Crear cliente temporal de Prisma
      const tempPrisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl
          }
        }
      })

      try {
        await tempPrisma.$connect()

        // Verificar que las tablas necesarias existan
        const requiredTables = [
          'articulos',
          'comprobantes_cabecera',
          'comprobantes_detalle',
          'comprobantes_pagos'
        ]

        const result = await tempPrisma.$queryRaw<Array<{ tablename: string }>>`
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename = ANY(ARRAY['articulos', 'comprobantes_cabecera', 'comprobantes_detalle', 'comprobantes_pagos'])
        `

        const existingTables = result.map(r => r.tablename)
        const missingTables = requiredTables.filter(t => !existingTables.includes(t))

        if (missingTables.length > 0) {
          logger.warn({ missingTables }, 'Faltan tablas requeridas')
          return reply.send({
            success: false,
            missing: missingTables
          })
        }

        logger.info({ tables: existingTables }, 'Todas las tablas existen')

        return reply.send({
          success: true,
          tables: existingTables
        })
      } finally {
        await tempPrisma.$disconnect()
      }
    } catch (error) {
      logger.error({ error }, 'Error al verificar tablas')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al verificar tablas'
      })
    }
  })

  // POST /api/setup/set-password - Configurar password de admin
  app.post('/api/setup/set-password', async (request, reply) => {
    try {
      const { password } = SetPasswordSchema.parse(request.body)

      // Guardar en .env usando env-writer centralizado (serializado y con escape correcto)
      await writeEnvVar('SYNC_USERNAME', 'admin')
      await writeEnvVar('SYNC_PASSWORD', password)

      logger.info('Credenciales de autenticación configuradas')

      return reply.send({ success: true })
    } catch (error) {
      logger.error({ error }, 'Error al configurar password')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al configurar password'
      })
    }
  })

  // POST /api/setup/save-domain - Guardar URL pública del gateway en .env
  app.post('/api/setup/save-domain', async (request, reply) => {
    try {
      const parsed = SaveDomainSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.issues.map(i => i.message).join(', ')
        })
      }
      const { protocol, domain, port } = parsed.data
      const url = assembleGatewayUrl(protocol, domain, port)
      await writeEnvVar('GATEWAY_PUBLIC_URL', url)
      logger.info({ url }, 'GATEWAY_PUBLIC_URL guardado en .env')
      return reply.send({ success: true, url })
    } catch (error) {
      logger.error({ error }, 'Error al guardar domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al guardar domain'
      })
    }
  })

  // GET /api/setup/generate-env - Descargar .env actual como archivo
  app.get('/api/setup/generate-env', async (_request, reply) => {
    try {
      const cwd = process.cwd()
      const envPath = path.join(cwd, '.env')
      const examplePath = path.join(cwd, '.env.example')

      // Read .env.example as template
      let exampleContent = ''
      try {
        exampleContent = await fs.readFile(examplePath, 'utf-8')
      } catch {
        // No .env.example — fall back to raw .env
      }

      // Read current .env values
      let envContent = ''
      try {
        envContent = await fs.readFile(envPath, 'utf-8')
      } catch {
        // No .env file yet — return example as-is
      }

      // Build a map of current .env values
      const envMap: Record<string, string> = {}
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (match) {
          envMap[match[1]] = match[2]
        }
      }

      // Merge: replace KEY= lines in example with current values where they exist
      let merged: string
      if (exampleContent) {
        merged = exampleContent
          .split('\n')
          .map(line => {
            const match = line.match(/^([A-Z0-9_]+)=/)
            if (match && envMap[match[1]] !== undefined) {
              return `${match[1]}=${envMap[match[1]]}`
            }
            return line
          })
          .join('\n')
      } else {
        merged = envContent
      }

      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename=".env"')
        .send(merged)
    } catch (error) {
      logger.error({ error }, 'Error al generar .env para descarga')
      return reply.status(500).send('Error generating .env file')
    }
  })

  // GET /api/setup/status - Obtener estado actual de configuración
  app.get('/api/setup/status', async (_request, reply) => {
    try {
      const DATABASE_URL = process.env.DATABASE_URL || ''
      const JWT_SECRET = process.env.JWT_SECRET || ''
      const SYNC_USERNAME = process.env.SYNC_USERNAME || ''
      const SYNC_PASSWORD = process.env.SYNC_PASSWORD || ''

      // Parsear DATABASE_URL para mostrar info segura
      let dbInfo = null
      if (DATABASE_URL && DATABASE_URL !== 'postgresql://user:password@localhost:5432/objetiva_db') {
        try {
          const url = new URL(DATABASE_URL)
          dbInfo = {
            host: url.hostname,
            port: url.port || '5432',
            database: url.pathname.substring(1),
            username: url.username
          }
        } catch {
          // URL inválida, ignorar
        }
      }

      // Mostrar JWT_SECRET parcialmente
      let jwtInfo = null
      if (JWT_SECRET && JWT_SECRET !== 'change-this-secret-in-production-debe-ser-el-mismo-que-en-objetiva-sync') {
        jwtInfo = {
          length: JWT_SECRET.length,
          preview: JWT_SECRET.substring(0, 8) + '...' + JWT_SECRET.substring(JWT_SECRET.length - 8)
        }
      }

      // Info de credenciales
      let authInfo = null
      if (SYNC_USERNAME && SYNC_USERNAME !== 'admin' || SYNC_PASSWORD && SYNC_PASSWORD !== 'change-me') {
        authInfo = {
          username: SYNC_USERNAME || 'admin',
          passwordConfigured: SYNC_PASSWORD && SYNC_PASSWORD !== 'change-me'
        }
      }

      return reply.send({
        database: dbInfo,
        jwt: jwtInfo,
        auth: authInfo,
        gatewayUrl: process.env.GATEWAY_PUBLIC_URL || null
      })
    } catch (error) {
      logger.error({ error }, 'Error al obtener estado de setup')
      return reply.send({
        database: null,
        jwt: null,
        auth: null,
        gatewayUrl: null
      })
    }
  })
}
