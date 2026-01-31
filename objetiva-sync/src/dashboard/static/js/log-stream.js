/**
 * Real-time log streaming via Server-Sent Events
 */
(function() {
  'use strict';

  let eventSource = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  // Get current filter values from URL or form
  function getFilters() {
    const params = new URLSearchParams(window.location.search);
    return {
      entityType: params.get('entityType') || '',
      status: params.get('status') || ''
    };
  }

  // Build SSE URL with filters
  function buildStreamUrl() {
    const filters = getFilters();
    const params = new URLSearchParams();
    if (filters.entityType) params.set('entityType', filters.entityType);
    if (filters.status) params.set('status', filters.status);
    const queryString = params.toString();
    return '/api/logs/stream' + (queryString ? '?' + queryString : '');
  }

  // Format log entry as table row
  function formatLogRow(log) {
    const statusClass = {
      'success': 'badge badge-success',
      'failed': 'badge badge-error',
      'partial': 'badge badge-warning',
      'running': 'badge badge-info'
    }[log.status] || 'badge badge-ghost';

    const date = new Date(log.createdAt).toLocaleString('es-AR');

    return `
      <tr class="hover:bg-base-200 new-log-animation" data-log-id="${log.id}">
        <td class="px-4 py-3 text-sm">${date}</td>
        <td class="px-4 py-3 text-sm">
          <span class="badge badge-primary">
            ${log.entityType}
          </span>
        </td>
        <td class="px-4 py-3 text-sm">${log.queryName || '-'}</td>
        <td class="px-4 py-3 text-sm">
          <span class="${statusClass}">
            ${log.status}
          </span>
        </td>
        <td class="px-4 py-3 text-sm">${log.recordsFetched || 0}</td>
        <td class="px-4 py-3 text-sm">${log.recordsSent || 0}</td>
        <td class="px-4 py-3 text-sm">${log.recordsFailed || 0}</td>
        <td class="px-4 py-3 text-sm">${log.durationMs ? log.durationMs + 'ms' : '-'}</td>
      </tr>
    `;
  }

  // Insert new log at top of table
  function insertLog(log) {
    const tbody = document.querySelector('#logs-table tbody');
    if (!tbody) return;

    // Check if log already exists (avoid duplicates)
    if (tbody.querySelector(`[data-log-id="${log.id}"]`)) return;

    // Insert at top
    tbody.insertAdjacentHTML('afterbegin', formatLogRow(log));

    // Remove oldest if > 100 rows
    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 100) {
      rows[rows.length - 1].remove();
    }

    // Update stats counter
    updateLiveStats(log);
  }

  // Update live statistics
  function updateLiveStats(log) {
    const totalEl = document.querySelector('#stat-total');
    const successEl = document.querySelector('#stat-success');
    const failedEl = document.querySelector('#stat-failed');

    if (totalEl) {
      const current = parseInt(totalEl.textContent || '0');
      totalEl.textContent = current + 1;
    }
    if (log.status === 'success' && successEl) {
      const current = parseInt(successEl.textContent || '0');
      successEl.textContent = current + 1;
    }
    if (log.status === 'failed' && failedEl) {
      const current = parseInt(failedEl.textContent || '0');
      failedEl.textContent = current + 1;
    }
  }

  // Update connection status indicator
  function updateConnectionStatus(connected) {
    const indicator = document.querySelector('#stream-status');
    if (indicator) {
      if (connected) {
        indicator.className = 'w-2 h-2 rounded-full bg-success';
        indicator.title = 'Connected';
      } else {
        indicator.className = 'w-2 h-2 rounded-full bg-error';
        indicator.title = 'Disconnected';
      }
    }
  }

  // Connect to SSE stream
  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    const url = buildStreamUrl();
    eventSource = new EventSource(url);

    eventSource.addEventListener('connected', function(e) {
      console.log('Log stream connected:', JSON.parse(e.data));
      reconnectAttempts = 0;
      updateConnectionStatus(true);
    });

    eventSource.addEventListener('log', function(e) {
      const log = JSON.parse(e.data);
      insertLog(log);
    });

    eventSource.onerror = function(e) {
      console.error('Log stream error:', e);
      updateConnectionStatus(false);

      eventSource.close();

      // Reconnect with backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(connect, RECONNECT_DELAY * reconnectAttempts);
      }
    };
  }

  // Disconnect from stream
  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      updateConnectionStatus(false);
    }
  }

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', function() {
    // Only connect on logs page
    if (document.querySelector('#logs-table')) {
      connect();
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', disconnect);

  // Export for manual control if needed
  window.LogStream = { connect, disconnect };
})();
