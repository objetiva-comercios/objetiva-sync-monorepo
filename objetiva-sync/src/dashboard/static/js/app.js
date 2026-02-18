/**
 * Custom JavaScript for Objetiva Sync Dashboard
 * Funcionalidad adicional y utilidades
 */

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', function () {
  console.log('Objetiva Sync Dashboard initialized');

  // Inicializar tooltips si hay elementos con data-tooltip
  initTooltips();

  // Inicializar confirmaciones
  initConfirmations();

  // Inicializar copiar al portapapeles
  initCopyToClipboard();
});

/**
 * Inicializa tooltips básicos
 */
function initTooltips() {
  const tooltipElements = document.querySelectorAll('[data-tooltip]');

  tooltipElements.forEach((element) => {
    element.addEventListener('mouseenter', function () {
      const tooltipText = this.getAttribute('data-tooltip');
      showTooltip(this, tooltipText);
    });

    element.addEventListener('mouseleave', function () {
      hideTooltip();
    });
  });
}

/**
 * Muestra un tooltip
 */
function showTooltip(element, text) {
  const tooltip = document.createElement('div');
  tooltip.id = 'custom-tooltip';
  tooltip.className =
    'absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg';
  tooltip.textContent = text;

  document.body.appendChild(tooltip);

  const rect = element.getBoundingClientRect();
  tooltip.style.top = rect.top - tooltip.offsetHeight - 5 + 'px';
  tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
}

/**
 * Oculta el tooltip
 */
function hideTooltip() {
  const tooltip = document.getElementById('custom-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

/**
 * Inicializa confirmaciones para acciones destructivas
 */
function initConfirmations() {
  const confirmButtons = document.querySelectorAll('[data-confirm]');

  confirmButtons.forEach((button) => {
    button.addEventListener('click', function (event) {
      const message = this.getAttribute('data-confirm');
      if (!confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  });
}

/**
 * Inicializa funcionalidad de copiar al portapapeles
 */
function initCopyToClipboard() {
  const copyButtons = document.querySelectorAll('[data-copy]');

  copyButtons.forEach((button) => {
    button.addEventListener('click', function () {
      const text = this.getAttribute('data-copy');
      copyToClipboard(text);

      // Feedback visual
      const originalText = this.innerHTML;
      this.innerHTML = '<i data-lucide="check"></i> Copiado';
      lucide.createIcons();

      setTimeout(() => {
        this.innerHTML = originalText;
        lucide.createIcons();
      }, 2000);
    });
  });
}

/**
 * Copia texto al portapapeles
 */
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error('Error al copiar:', err);
      fallbackCopyToClipboard(text);
    });
  } else {
    fallbackCopyToClipboard(text);
  }
}

/**
 * Fallback para copiar al portapapeles en navegadores antiguos
 */
function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Error al copiar:', err);
  }

  document.body.removeChild(textArea);
}

/**
 * Muestra una notificación temporal
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg alert-enter ${
    type === 'success'
      ? 'bg-green-50 text-green-800 border border-green-200'
      : type === 'error'
      ? 'bg-red-50 text-red-800 border border-red-200'
      : type === 'warning'
      ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
      : 'bg-blue-50 text-blue-800 border border-blue-200'
  }`;

  notification.innerHTML = `
    <div class="flex items-center">
      <i data-lucide="${
        type === 'success'
          ? 'check-circle'
          : type === 'error'
          ? 'alert-circle'
          : type === 'warning'
          ? 'alert-triangle'
          : 'info'
      }" class="w-5 h-5 mr-2"></i>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);
  lucide.createIcons();

  // Auto-remove después de 5 segundos
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 5000);
}

/**
 * Formatea una fecha a formato local
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formatea un número con separadores de miles
 */
function formatNumber(number) {
  return new Intl.NumberFormat('es-ES').format(number);
}

/**
 * Valida un formulario antes de enviar
 */
function validateForm(formElement) {
  const inputs = formElement.querySelectorAll('input[required], textarea[required]');
  let isValid = true;

  inputs.forEach((input) => {
    if (!input.value.trim()) {
      isValid = false;
      input.classList.add('border-red-500');
    } else {
      input.classList.remove('border-red-500');
    }
  });

  return isValid;
}

/**
 * Escapa HTML para prevenir XSS
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

// Exponer funciones útiles globalmente
window.ObjetivaSync = {
  showNotification,
  formatDate,
  formatNumber,
  validateForm,
  copyToClipboard,
  escapeHtml,
};

// Hacer escapeHtml disponible globalmente también
window.escapeHtml = escapeHtml;
