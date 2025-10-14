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
});
