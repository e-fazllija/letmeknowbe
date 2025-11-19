import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Databases
  PUBLIC_DATABASE_URL: Joi.string().uri().required(),
  TENANT_DATABASE_URL: Joi.string().uri().required(),

  // Tenant JWT & Refresh
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  ACCESS_TTL: Joi.string().default('900s'),
  REFRESH_TTL: Joi.string().default('30d'),
  TENANT_JWT_ISS: Joi.string().optional(),
  TENANT_JWT_AUD: Joi.string().optional(),

  // Tenant MFA
  JWT_MFA_SECRET: Joi.string().min(16).required(),
  MFA_TOKEN_TTL: Joi.string().default('300s'),
  MFA_ENC_KEY: Joi.string().min(16).required(),
  MFA_ISSUER: Joi.string().default('LetMeKnow'),
  RECOVERY_CODE_PEPPER: Joi.string().min(16).required(),

  // Dev / Frontend
  FRONTEND_BASE_URL: Joi.string().uri().allow('', null),
  EXPOSE_ACTIVATION_URLS: Joi.boolean().truthy('true').falsy('false').default(true),
  API_BASE_URL: Joi.string().uri().allow('', null),

  // Cookie
  COOKIE_DOMAIN: Joi.string().allow('', null),

  // Platform superuser (ENV-based)
  // Consenti TLD interni (es. .local) in dev
  PLATFORM_SUPER_EMAIL: Joi.string().email({ tlds: { allow: false } }).required(),
  PLATFORM_SUPER_HASH: Joi.string().min(20).required(),
  PLATFORM_MFA_SECRET: Joi.string().min(16).required(),
  JWT_PLATFORM_ACCESS_SECRET: Joi.string().min(16).required(),
  PLATFORM_ACCESS_TTL: Joi.string().default('14400s'),
  PLATFORM_JWT_ISS: Joi.string().optional(),
  PLATFORM_JWT_AUD: Joi.string().default('platform'),
  PLATFORM_IP_ALLOWLIST: Joi.string().optional(),
  PLATFORM_PROTECT_PUBLIC_ADMIN: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),

  // Storage (S3/MinIO)
  STORAGE_PROVIDER: Joi.string().valid('S3').allow('', null),
  S3_ENDPOINT: Joi.string().uri().allow('', null),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().allow('', null),
  S3_SECRET_KEY: Joi.string().allow('', null),
  S3_BUCKET_TMP: Joi.string().allow('', null),
  S3_BUCKET_ATTACH: Joi.string().allow('', null),
  S3_SSE_MODE: Joi.string().valid('NONE', 'S3', 'KMS').default('S3'),
  S3_KMS_KEY_ID: Joi.string().allow('', null),
  UPLOAD_FINALIZE_SECRET: Joi.string().allow('', null),

  // Antivirus / Scansione allegati
  ATTACH_SCAN_ENABLED: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
  ATTACH_SCAN_TIMER_MS: Joi.string().allow('', null),
  CLAMAV_HOST: Joi.string().allow('', null),
  CLAMAV_PORT: Joi.number().integer().min(1).max(65535).default(3310),
  DELETE_INFECTED: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),

  // Public auto-ack (ricevuta al segnalante)
  PUBLIC_AUTO_ACK: Joi.boolean().truthy('true', '1').falsy('false', '0').default(true),
  PUBLIC_ACK_TTL_DAYS: Joi.number().integer().min(1).default(7),

  // Export PDF
  EXPORT_PDF_ENABLED: Joi.boolean().truthy('true', '1').falsy('false', '0').default(true),
  PDF_ENGINE: Joi.string().valid('MOCK', 'PDFKIT').default('MOCK'),

  // Stripe (opzionale - se vuoti l'integrazione reale è disabilitata)
  STRIPE_SECRET_KEY: Joi.string().allow('', null),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('', null),
  STRIPE_API_VERSION: Joi.string().allow('', null),
});
