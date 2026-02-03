/**
 * Error classification utility for gateway API calls
 * Maps error types to structured codes and Spanish messages
 */

export interface ClassifiedError {
  code: string;
  message: string;
  isRetryable: boolean;
  rootCause: string;
}

/**
 * Classifies errors from gateway API calls into structured error types
 * with specific error codes, Spanish messages, and root cause descriptions
 */
export function classifyError(error: unknown): ClassifiedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : '';

  // 1. User cancellation (AbortError without timeout)
  if (errorName === 'AbortError' && !errorMessage.toLowerCase().includes('timeout')) {
    return {
      code: 'SYNC_CANCELED',
      message: 'Sincronización cancelada por el usuario',
      isRetryable: false,
      rootCause: 'El usuario canceló la operación.',
    };
  }

  // 2. Explicit timeout (AbortSignal.timeout)
  if (errorName === 'TimeoutError' || (errorName === 'AbortError' && errorMessage.toLowerCase().includes('timeout'))) {
    return {
      code: 'TIMEOUT_GATEWAY_REQUEST',
      message: 'Timeout al enviar batch al gateway (límite: 2 minutos)',
      isRetryable: true,
      rootCause: 'El gateway tardó más de 2 minutos en procesar el batch. Puede estar sobrecargado o el batch es muy grande.',
    };
  }

  // 3. undici headers timeout
  if (errorName === 'HeadersTimeoutError' || errorMessage.includes('UND_ERR_HEADERS_TIMEOUT')) {
    return {
      code: 'TIMEOUT_GATEWAY_HEADERS',
      message: 'Gateway no respondió a tiempo (headersTimeout)',
      isRetryable: true,
      rootCause: 'El gateway tardó demasiado en responder. Puede estar sobrecargado.',
    };
  }

  // 4. undici body timeout
  if (errorName === 'BodyTimeoutError' || errorMessage.includes('UND_ERR_BODY_TIMEOUT')) {
    return {
      code: 'TIMEOUT_GATEWAY_BODY',
      message: 'Timeout al recibir respuesta del gateway',
      isRetryable: true,
      rootCause: 'El gateway está procesando un batch muy grande. Intenta con batch size menor.',
    };
  }

  // 5. SQL Server timeout
  if (errorMessage.includes('Request failed to complete') ||
      errorMessage.includes('ETIMEOUT') ||
      errorMessage.includes('requestTimeout')) {
    return {
      code: 'TIMEOUT_ERP_QUERY',
      message: `Timeout al consultar ERP: ${errorMessage}`,
      isRetryable: true,
      rootCause: 'La consulta SQL al ERP tardó demasiado. Verifica la query o el estado del servidor ERP.',
    };
  }

  // 6. Connection refused
  if (errorMessage.includes('ECONNREFUSED')) {
    return {
      code: 'GATEWAY_UNREACHABLE',
      message: `Gateway no disponible: ${errorMessage}`,
      isRetryable: true,
      rootCause: 'El servicio gateway no está ejecutándose o no es accesible.',
    };
  }

  // 7. Connection reset
  if (errorMessage.includes('ECONNRESET')) {
    return {
      code: 'GATEWAY_CONNECTION_RESET',
      message: 'Conexión con gateway interrumpida',
      isRetryable: true,
      rootCause: 'La conexión fue cerrada inesperadamente. Puede ser un problema de red o el gateway se reinició.',
    };
  }

  // 8. DNS resolution
  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('EAI_AGAIN')) {
    return {
      code: 'GATEWAY_DNS_ERROR',
      message: 'No se puede resolver la dirección del gateway',
      isRetryable: false,
      rootCause: 'Verifica que la URL del gateway es correcta y que hay conectividad de red.',
    };
  }

  // 9. HTTP 401/403
  if (errorMessage.includes('HTTP 401') || errorMessage.includes('HTTP 403')) {
    return {
      code: 'GATEWAY_AUTH_ERROR',
      message: 'Error de autenticación con el gateway',
      isRetryable: false,
      rootCause: 'Las credenciales del gateway son inválidas o expiraron. Verifica usuario y contraseña en Configuración.',
    };
  }

  // 10. HTTP 5xx
  if (/HTTP 5\d\d/.test(errorMessage)) {
    return {
      code: 'GATEWAY_SERVER_ERROR',
      message: `Error interno del gateway: ${errorMessage}`,
      isRetryable: true,
      rootCause: 'El gateway tuvo un error interno. Revisa los logs del gateway.',
    };
  }

  // 11. Default/unknown
  return {
    code: 'UNKNOWN_ERROR',
    message: errorMessage,
    isRetryable: false,
    rootCause: 'Error no clasificado. Revisa los logs para más detalles.',
  };
}
