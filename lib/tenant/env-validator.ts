import { validateCriticalEnvVars } from './defaults';

export function validateEnvironment(): void {
  const { valid, missingRequired, missingRecommended } = validateCriticalEnvVars();

  if (!valid) {
    console.error(
      `[MarketOS] Variables de entorno obligatorias faltantes: ${missingRequired.join(', ')}`
    );
  }

  if (process.env.NODE_ENV === 'production' && missingRecommended.length > 0) {
    console.warn(
      `[MarketOS] Variables recomendadas para producción no configuradas: ${missingRecommended.join(', ')}`
    );
  }
}
