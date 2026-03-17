import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { logger } from '../lib/logger.js'
import { systemState } from '../lib/system-state.js'
import fs from 'fs/promises'
import path from 'path'
import { writeEnvVar } from '../utils/env-writer.js'

const TestDbSchema = z.object({
  databaseUrl: z.string().url('URL de base de datos inválida')
})

const SaveDomainSchema = z.object({
  url: z.string().min(1, 'URL is required')
})

/**
 * Normalizes a gateway URL input.
 * - Adds http:// if no protocol is provided
 * - Strips trailing slashes
 * - Removes default ports (80 for http, 443 for https)
 */
export function normalizeGatewayUrl(input: string): string {
  let url = input.trim()

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }

  const parsed = new URL(url)

  // Remove default ports
  const defaultPorts: Record<string, string> = { 'http:': '80', 'https:': '443' }
  if (parsed.port === defaultPorts[parsed.protocol]) {
    parsed.port = ''
  }

  // Return clean URL without trailing slash
  return parsed.origin
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
      padding: 16px 32px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .header h1 { font-size: 20px; }
    .header .sep { opacity: 0.5; font-size: 18px; font-weight: 300; }
    .header p { opacity: 0.85; font-size: 14px; }

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

    /* Persistent nav bar below stepper */
    .wizard-nav {
      padding: 10px 32px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    .wizard-nav .nav-step { display: none; }
    .wizard-nav .nav-step.active { display: flex; justify-content: space-between; align-items: center; }
    .wizard-nav .btn { padding: 8px 16px; font-size: 13px; }

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
      <span class="sep">/</span>
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
        <div class="stepper-label">Apply</div>
      </div>
      <div class="stepper-item upcoming" id="step-indicator-4">
        <div class="stepper-dot">5</div>
        <div class="stepper-label">Link Sync</div>
      </div>
    </div>

    <!-- Persistent navigation below stepper -->
    <div class="wizard-nav" id="wizard-nav">
      <div class="nav-step active" id="nav-step-0">
        <span></span>
        <button class="btn btn-primary" onclick="testDbAndNext()" id="test-db-btn">Test Connection &amp; Next &rarr;</button>
      </div>
      <div class="nav-step" id="nav-step-1">
        <button class="btn btn-secondary" onclick="goBack()" id="domain-back-btn">&larr; Back</button>
        <button class="btn btn-primary" onclick="saveDomainAndNext()" id="save-domain-btn">Save &amp; Next &rarr;</button>
      </div>
      <div class="nav-step" id="nav-step-2">
        <button class="btn btn-secondary" onclick="goBack()">&larr; Back</button>
        <button class="btn btn-primary" onclick="saveJwtAndNext()" id="save-jwt-btn">Save &amp; Next &rarr;</button>
      </div>
      <div class="nav-step" id="nav-step-3">
        <button class="btn btn-secondary" onclick="goBack()">&larr; Back</button>
        <button class="btn btn-primary" onclick="applyConfig()" id="apply-btn">Apply &amp; Continue &rarr;</button>
      </div>
      <div class="nav-step" id="nav-step-4">
        <button class="btn btn-secondary" onclick="goBack()">&larr; Back</button>
        <span></span>
      </div>
    </div>

    <div class="content">

      <!-- Step 0: Database -->
      <div class="wizard-step active" id="wizard-step-0">
        <div class="step-title">Step 1 of 5 — Database</div>
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

      </div>

      <!-- Step 1: Domain -->
      <div class="wizard-step" id="wizard-step-1">
        <div class="step-title">Step 2 of 5 — Domain</div>
        <p class="step-subtitle">Configure the public URL where this gateway will be reachable. This is required for pairing with the sync client.</p>

        <div class="form-group">
          <label for="domain-url">Gateway URL</label>
          <input type="text" id="domain-url" placeholder="http://sync-gateway.example.com">
          <div class="input-hint">If you omit http:// or https://, http:// will be added automatically.</div>
        </div>

        <div id="domain-alert" class="alert"></div>

      </div>

      <!-- Step 2: JWT Secret -->
      <div class="wizard-step" id="wizard-step-2">
        <div class="step-title">Step 3 of 5 — JWT Secret</div>
        <p class="step-subtitle">Set the JWT signing secret. It must match the value configured in your Objetiva Sync client for tokens to be valid.</p>

        <div class="form-group">
          <label for="jwt-secret">JWT Secret</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="jwt-secret" placeholder="64-character hex string" style="flex:1;">
            <button class="btn btn-secondary" onclick="generateJwtSecret()" style="white-space:nowrap;flex-shrink:0;">Generate</button>
          </div>
          <div id="jwt-configured" class="configured-indicator"></div>
          <div class="input-hint">Minimum 32 characters. Use "Generate" to create a secure random value.</div>
        </div>

        <div id="jwt-alert" class="alert"></div>

      </div>

      <!-- Step 3: Apply Configuration -->
      <div class="wizard-step" id="wizard-step-3">
        <div class="step-title">Step 4 of 5 — Apply Configuration</div>
        <p class="step-subtitle">Review your configuration and apply changes. Settings will activate immediately without restarting the gateway.</p>

        <div id="download-alert" class="alert"></div>
        <div id="summary-loading" style="color: #9ca3af; font-size: 13px; margin-bottom: 16px;">Loading summary...</div>

        <div id="summary-container" style="display: none;">
          <div class="summary-grid" id="summary-grid"></div>
          <div style="text-align:right;margin-top:12px;">
            <button class="btn btn-secondary" onclick="copyEnvToClipboard()" id="copy-env-btn" style="font-size:12px;padding:6px 12px;">Copy .env</button>
          </div>
        </div>

        <!-- Apply status indicator (hidden by default) -->
        <div id="apply-status" style="display: none; text-align: center; margin: 20px 0;">
          <div id="apply-spinner" style="display: none;">
            <div class="spinner" style="width: 24px; height: 24px; border-width: 3px; margin: 0 auto 12px;"></div>
            <div style="color: #6b7280; font-size: 14px;">Applying configuration...</div>
          </div>
          <div id="apply-success" style="display: none;">
            <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
            <div style="color: #065f46; font-size: 15px; font-weight: 600;">Configuration applied successfully</div>
            <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">Previous config backed up as <code>.env.bak</code></div>
          </div>
        </div>

      </div>

      <!-- Step 4: Link Sync Client -->
      <div class="wizard-step" id="wizard-step-4">
        <h2 class="step-title">Step 5 of 5 — Link Sync Client</h2>
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
            <div id="pairing-code-display" style="font-family:monospace;font-size:2.5rem;font-weight:700;letter-spacing:0.3em;background:#fde5be;border:3px solid #f59e0b;border-radius:12px;padding:20px 32px;display:inline-block;user-select:all;color:#067b54;"></div>
          </div>
          <div style="text-align:center;margin:12px 0;">
            <button type="button" id="pairing-copy-btn" class="btn btn-secondary" onclick="copyPairingCode()" style="margin-right:12px;">Copy Code</button>
            <button type="button" id="pairing-regenerate-btn" class="btn btn-primary" onclick="regeneratePairingCode()">Generate New Code</button>
          </div>
          <div id="pairing-countdown" style="text-align:center;color:#64748b;font-size:0.9rem;margin:8px 0;"></div>
          <div id="pairing-error" style="display:none;color:#ef4444;text-align:center;margin:8px 0;"></div>
        </div>

        <!-- Success message (hidden until pairing is claimed) -->
        <div id="pairing-success" style="display:none;">
          <div style="text-align:center;margin:32px 0 24px;">
            <div style="width:64px;height:64px;border-radius:50%;background:#d1fae5;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style="font-size:18px;font-weight:700;color:#065f46;margin-bottom:8px;">Enlace completado exitosamente</h3>
            <p style="font-size:14px;color:#6b7280;max-width:360px;margin:0 auto;">La contraparte se ha enlazado correctamente. El sincronizador ya tiene las credenciales para conectarse al gateway.</p>
          </div>
          <div style="text-align:center;">
            <a href="/" class="btn btn-primary" style="text-decoration:none;padding:12px 32px;font-size:15px;">Ir al Dashboard</a>
          </div>
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

    const TOTAL_STEPS = 5;

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
      document.querySelectorAll('.nav-step').forEach(function(el) {
        el.classList.remove('active');
      });
      const target = document.getElementById('wizard-step-' + index);
      if (target) target.classList.add('active');
      const nav = document.getElementById('nav-step-' + index);
      if (nav) nav.classList.add('active');
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
      if (next === 3) {
        loadDownloadSummary();
      }
      if (next === 4) {
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

      var controller = new AbortController();
      var clientTimeout = setTimeout(function() { controller.abort(); }, 20000);

      try {
        const res = await fetch('/api/setup/test-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ databaseUrl: dbUrl }),
          signal: controller.signal
        });
        clearTimeout(clientTimeout);
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
        clearTimeout(clientTimeout);
        var msg = err.name === 'AbortError'
          ? 'Connection timed out. Check that the database host is reachable and PostgreSQL is running.'
          : 'Connection failed: ' + err.message;
        showAlert('db-alert', 'error', msg);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection & Next';
      }
    }

    // ── Step 1: Domain ────────────────────────────────────────────────────────
    async function saveDomainAndNext() {
      var urlInput = document.getElementById('domain-url');
      var raw = urlInput.value.trim();

      if (!raw) {
        showAlert('domain-alert', 'error', 'Please enter the gateway URL.');
        return;
      }

      // Auto-add http:// if no protocol
      if (!new RegExp('^https?://', 'i').test(raw)) {
        raw = 'http://' + raw;
        urlInput.value = raw;
      }

      // Basic URL validation
      try {
        new URL(raw);
      } catch (_) {
        showAlert('domain-alert', 'error', 'Invalid URL format. Example: http://sync-gateway.example.com');
        return;
      }

      const btn = document.getElementById('save-domain-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving...';
      hideAlert('domain-alert');

      try {
        const res = await fetch('/api/setup/save-domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: raw })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          state.stepData.gatewayUrl = data.url;
          urlInput.value = data.url;
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

    // ── Step 3: Apply / Summary ─────────────────────────────────────────────
    async function loadDownloadSummary() {
      const loadingEl = document.getElementById('summary-loading');
      const containerEl = document.getElementById('summary-container');
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
        } else {
          addSummaryItem('Gateway URL', 'Not configured', true);
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

    // ── Step 3: Apply Configuration ────────────────────────────────────────────
    async function applyConfig() {
      const btn = document.getElementById('apply-btn');
      const btnGroup = document.getElementById('nav-step-3');
      const statusEl = document.getElementById('apply-status');
      const spinnerEl = document.getElementById('apply-spinner');
      const successEl = document.getElementById('apply-success');

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Applying...';
      statusEl.style.display = 'block';
      spinnerEl.style.display = 'block';
      successEl.style.display = 'none';
      hideAlert('download-alert');

      try {
        const res = await fetch('/api/setup/apply-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to apply configuration');
        }

        spinnerEl.style.display = 'none';
        successEl.style.display = 'block';
        btnGroup.style.display = 'none';

        // Auto-advance to step 6 after a brief pause
        setTimeout(function() { advanceStep(); }, 1500);
      } catch (err) {
        spinnerEl.style.display = 'none';
        statusEl.style.display = 'none';
        showAlert('download-alert', 'error', 'Failed to apply: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Apply Configuration & Continue';
      }
    }

    // ── Step 4: Link Sync Client ──────────────────────────────────────────────
    let countdownInterval = null;
    let pairingPollInterval = null;

    async function enterPairingStep() {
      const warningEl = document.getElementById('pairing-no-domain-warning');
      const codeEl = document.getElementById('pairing-code-container');
      const errorEl = document.getElementById('pairing-error');
      const successEl = document.getElementById('pairing-success');

      // Check if domain was configured
      const hasDomain = !!state.stepData.gatewayUrl;

      if (!hasDomain) {
        warningEl.style.display = 'block';
        codeEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';
        return;
      }

      warningEl.style.display = 'none';
      codeEl.style.display = 'block';
      if (successEl) successEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';

      // Obtain a JWT token via the setup-only token endpoint
      // (available only during setup-only mode, after apply-config sets JWT_SECRET)
      if (!state.token) {
        try {
          const tokenRes = await fetch('/api/setup/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const tokenData = await tokenRes.json();
          if (tokenData.success && tokenData.token) {
            state.token = tokenData.token;
          } else {
            console.error('Setup token failed:', tokenData);
            var errorEl = document.getElementById('pairing-error');
            if (errorEl) {
              errorEl.textContent = 'Could not obtain setup token: ' + (tokenData.error || 'Unknown error') + '. Try restarting the gateway.';
              errorEl.style.display = 'block';
            }
            return;
          }
        } catch (err) {
          console.error('Setup token fetch error:', err);
          var errorEl = document.getElementById('pairing-error');
          if (errorEl) {
            errorEl.textContent = 'Could not connect to setup token endpoint. Try restarting the gateway.';
            errorEl.style.display = 'block';
          }
          return;
        }
      }

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
            'Authorization': 'Bearer ' + state.token
          }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to generate code');

        displayEl.textContent = data.code;
        if (errorEl) errorEl.style.display = 'none';
        startCountdown(data.expiresAt);
        startPairingPoll();
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
        if (remaining === 0) {
          clearInterval(countdownInterval);
          stopPairingPoll();
        }
      }
      tick();
      countdownInterval = setInterval(tick, 1000);
    }

    function startPairingPoll() {
      stopPairingPoll();
      pairingPollInterval = setInterval(async function() {
        try {
          const res = await fetch('/api/pairing/status', {
            headers: { 'Authorization': 'Bearer ' + state.token }
          });
          const data = await res.json();
          if (data.claimed) {
            showPairingSuccess();
          }
        } catch (e) {
          // Ignore poll errors — will retry next interval
        }
      }, 3000);
    }

    function stopPairingPoll() {
      if (pairingPollInterval) {
        clearInterval(pairingPollInterval);
        pairingPollInterval = null;
      }
    }

    function showPairingSuccess() {
      stopPairingPoll();
      if (countdownInterval) clearInterval(countdownInterval);

      var codeContainer = document.getElementById('pairing-code-container');
      var successEl = document.getElementById('pairing-success');
      if (codeContainer) codeContainer.style.display = 'none';
      if (successEl) successEl.style.display = 'block';
    }

    function copyPairingCode() {
      const code = document.getElementById('pairing-code-display').textContent;
      if (code && code !== '------') {
        navigator.clipboard.writeText(code).then(function() {
          const btn = document.getElementById('pairing-copy-btn');
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy Code'; }, 1000);
        });
      }
    }

    async function regeneratePairingCode() {
      var successEl = document.getElementById('pairing-success');
      var codeContainer = document.getElementById('pairing-code-container');
      if (successEl) successEl.style.display = 'none';
      if (codeContainer) codeContainer.style.display = 'block';
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
          if (status.database.password) {
            document.getElementById('db-password').value = status.database.password;
          }
          // Show configured placeholder for password
          document.getElementById('db-password-configured').style.display = 'block';
        }

        // Pre-fill domain: use saved value, or auto-detect from current browser URL
        if (status.gatewayUrl) {
          document.getElementById('domain-url').value = status.gatewayUrl;
        } else if (!document.getElementById('domain-url').value) {
          document.getElementById('domain-url').value = window.location.origin;
        }

        // JWT configured indicator + pre-fill
        if (status.jwt) {
          const jwtIndicator = document.getElementById('jwt-configured');
          jwtIndicator.style.display = 'block';
          jwtIndicator.textContent = 'Currently configured (' + status.jwt.length + ' chars): ' + status.jwt.preview;
          if (status.jwt.value) {
            document.getElementById('jwt-secret').value = status.jwt.value;
          }
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

      // Append connect_timeout to the URL if not already present
      const urlWithTimeout = databaseUrl.includes('connect_timeout')
        ? databaseUrl
        : databaseUrl + (databaseUrl.includes('?') ? '&' : '?') + 'connect_timeout=10'

      // Crear cliente temporal de Prisma
      const tempPrisma = new PrismaClient({
        datasources: {
          db: {
            url: urlWithTimeout
          }
        }
      })

      try {
        // Intentar conectar con timeout de 15s como fallback
        const connectPromise = (async () => {
          await tempPrisma.$connect()
          await tempPrisma.$queryRaw`SELECT 1`
        })()

        const timeoutPromise = new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('Connection timed out after 15 seconds. Check that the database host is reachable and PostgreSQL is running.')), 15000)
        })

        await Promise.race([connectPromise, timeoutPromise])

        // Persist DATABASE_URL (without the connect_timeout param we added)
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
      const url = normalizeGatewayUrl(parsed.data.url)
      await writeEnvVar('GATEWAY_PUBLIC_URL', url)
      logger.info({ url }, 'GATEWAY_PUBLIC_URL guardado en .env')
      return reply.send({ success: true, url })
    } catch (error) {
      logger.error({ error }, 'Error al guardar domain')
      const message = error instanceof Error ? error.message : 'Error al guardar domain'
      return reply.status(400).send({
        success: false,
        error: message.includes('Invalid URL') ? 'Invalid URL format. Example: http://sync-gateway.example.com' : message
      })
    }
  })

  // POST /api/setup/apply-config - Apply configuration (backup .env and confirm all vars are live)
  app.post('/api/setup/apply-config', async (_request, reply) => {
    try {
      const cwd = process.cwd()
      const envPath = path.join(cwd, '.env')
      const bakPath = path.join(cwd, '.env.bak')

      // Backup current .env to .env.bak
      try {
        await fs.access(envPath)
        await fs.copyFile(envPath, bakPath)
        logger.info('Backed up .env to .env.bak')
      } catch {
        // No .env to back up — that's fine, wizard writes created it
      }

      // Confirm key env vars are present in process.env
      const required = ['DATABASE_URL', 'JWT_SECRET']
      const missing = required.filter(k => !process.env[k])

      if (missing.length > 0) {
        return reply.send({
          success: false,
          error: `Missing configuration: ${missing.join(', ')}. Go back and complete those steps.`
        })
      }

      // Run Prisma migrations now that DATABASE_URL is available
      try {
        const { execSync } = await import('child_process')
        const execOpts = { cwd: process.cwd(), stdio: 'pipe' as const, timeout: 60000, env: { ...process.env } }

        try {
          const output = execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', execOpts)
          logger.info({ output: output.toString() }, 'Prisma migrations applied successfully')
        } catch (deployErr: any) {
          const errOutput = (deployErr?.stderr?.toString?.() || '') + (deployErr?.stdout?.toString?.() || '')

          // P3005: database schema is not empty — needs baselining
          if (errOutput.includes('P3005')) {
            logger.info('Database has existing schema without migration history — baselining all migrations')

            // Read migration directories and resolve each one as already applied
            const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations')
            const entries = await fs.readdir(migrationsDir, { withFileTypes: true })
            const migrationDirs = entries
              .filter((e) => e.isDirectory() && e.name !== '_migration_lock.toml')
              .map((e) => e.name)
              .sort()

            for (const migration of migrationDirs) {
              execSync(`npx prisma migrate resolve --applied "${migration}" --schema=./prisma/schema.prisma`, execOpts)
              logger.info({ migration }, 'Marked migration as applied (baseline)')
            }

            logger.info('Baseline complete — all migrations marked as applied')
          } else {
            throw deployErr
          }
        }
      } catch (migrationErr: any) {
        const stderr = migrationErr?.stderr?.toString?.() || ''
        const stdout = migrationErr?.stdout?.toString?.() || ''
        const detail = stderr || stdout || migrationErr?.message || 'Unknown error'
        logger.error({ stderr, stdout, err: migrationErr }, 'Prisma migration failed during apply')
        return reply.send({
          success: false,
          error: 'Database migrations failed: ' + detail.slice(0, 500)
        })
      }

      // Transition out of setup-only mode — all config is now live
      if (systemState.startupMode === 'setup-only') {
        systemState.startupMode = 'normal'
        systemState.dbConnected = true
        logger.info('Transitioned from setup-only to normal mode')
      }

      logger.info('Configuration applied — all env vars are live in process.env')
      return reply.send({ success: true, backup: '.env.bak' })
    } catch (error) {
      logger.error({ error }, 'Error applying configuration')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Error applying configuration'
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
      // Parsear DATABASE_URL con password incluido para pre-fill
      let dbInfo = null
      if (DATABASE_URL && DATABASE_URL !== 'postgresql://user:password@localhost:5432/objetiva_db') {
        try {
          const url = new URL(DATABASE_URL)
          dbInfo = {
            host: url.hostname,
            port: url.port || '5432',
            database: url.pathname.substring(1),
            username: url.username,
            password: decodeURIComponent(url.password)
          }
        } catch {
          // URL inválida, ignorar
        }
      }

      // JWT_SECRET completo para pre-fill
      let jwtInfo = null
      if (JWT_SECRET && JWT_SECRET !== 'change-this-secret-in-production-debe-ser-el-mismo-que-en-objetiva-sync') {
        jwtInfo = {
          length: JWT_SECRET.length,
          preview: JWT_SECRET.substring(0, 8) + '...' + JWT_SECRET.substring(JWT_SECRET.length - 8),
          value: JWT_SECRET
        }
      }

      return reply.send({
        database: dbInfo,
        jwt: jwtInfo,
        auth: null,
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

  // POST /api/setup/token - Issue a JWT during setup wizard
  // This endpoint replaces /auth/login for the setup wizard.
  // Allow token during setup-only mode OR normal mode before first claim
  // (fixes 403 bug when apply-config transitions mode mid-wizard).
  // After restart with valid config, wizard UI is not served so this path is not exposed.
  //
  // IMPORTANT: We sign with process.env.JWT_SECRET (which may have been updated
  // by the wizard mid-session) using fast-jwt directly, instead of app.jwt.sign()
  // which uses the secret captured at plugin registration time. This ensures the
  // token can be verified by @fastify/jwt after a restart when the new secret is
  // loaded from .env.
  app.post('/api/setup/token', async (_request, reply) => {
    const canIssueToken = systemState.startupMode === 'setup-only'
      || (systemState.startupMode === 'normal' && !systemState.setupComplete)
    if (!canIssueToken) {
      return reply.status(403).send({
        success: false,
        error: 'Only available during setup'
      })
    }

    try {
      // Use reply.jwtSign so the dynamic secret function receives request/token
      const token = await reply.jwtSign({
        source: 'setup-wizard',
        authenticated: true
      })

      logger.info({ tokenLength: token.length, mode: systemState.startupMode }, 'Setup token issued')

      return reply.send({
        success: true,
        token
      })
    } catch (error) {
      logger.error({ error }, 'Error signing setup token')
      return reply.status(500).send({
        success: false,
        error: 'Failed to sign token'
      })
    }
  })
}
