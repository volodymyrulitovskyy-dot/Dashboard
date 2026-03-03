import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  WORKFLOW_API_SECRET: z.string().min(20).optional(),
  WORKFLOW_TEAM_IDS: z.string().optional(),
  AZURE_AD_CLIENT_ID: z.string().optional(),
  AZURE_AD_CLIENT_SECRET: z.string().optional(),
  AZURE_AD_TENANT_ID: z.string().optional(),
  LOCAL_ADMIN_EMAIL: z.string().email().optional(),
  LOCAL_ADMIN_PASSWORD: z.string().min(8).optional(),
  LOCAL_ADMIN_PASSWORD_SHA256: z.string().length(64).optional(),
  APP_ALLOWED_EMAIL_DOMAIN: z.string().optional(),
  RAMP_CLIENT_ID: z.string().optional(),
  RAMP_CLIENT_SECRET: z.string().optional(),
  RAMP_SCOPES: z.string().optional(),
  ADP_API_BASE_URL: z.string().optional(),
  ADP_API_TOKEN: z.string().optional(),
  ADP_CLIENT_ID: z.string().optional(),
  ADP_CLIENT_SECRET: z.string().optional(),
  ADP_TOKEN_ENDPOINT: z.string().optional(),
  ADP_SCOPES: z.string().optional(),
  ADP_PAYROLL_ENDPOINT: z.string().optional(),
  NETSUITE_ACCOUNT_ID: z.string().optional(),
  NETSUITE_CLIENT_ID: z.string().optional(),
  NETSUITE_CERTIFICATE_ID: z.string().optional(),
  NETSUITE_PRIVATE_KEY_PEM: z.string().optional(),
  NETSUITE_SCOPES: z.string().optional(),
  NETSUITE_TOTALS_ENDPOINT: z.string().optional(),
  NETSUITE_AR_TOTAL_QUERY: z.string().optional(),
  NETSUITE_AP_TOTAL_QUERY: z.string().optional(),
  NETSUITE_GL_TOTAL_QUERY: z.string().optional(),
  UNANET_API_BASE_URL: z.string().optional(),
  UNANET_API_TOKEN: z.string().optional(),
  UNANET_TOKEN_ENDPOINT: z.string().optional(),
  UNANET_TOTALS_ENDPOINT: z.string().optional(),
  UNANET_TIMESHEETS_ENDPOINT: z.string().optional(),
  UNANET_CLIENT_ID: z.string().optional(),
  UNANET_CLIENT_SECRET: z.string().optional(),
  UNANET_SCOPES: z.string().optional(),
  UNANET_IMPORT_DIR: z.string().optional(),
  NETSUITE_LABOR_JE_ENDPOINT: z.string().optional(),
  NETSUITE_LABOR_DEBIT_ACCOUNT_ID: z.string().optional(),
  NETSUITE_LABOR_CREDIT_ACCOUNT_ID: z.string().optional(),
  NETSUITE_LABOR_SUBSIDIARY_ID: z.string().optional(),
  NETSUITE_LABOR_CURRENCY_ID: z.string().optional(),
  NETSUITE_LABOR_APPROVAL_STATUS: z.string().optional(),
  NETSUITE_LABOR_PROJECT_FIELD_ID: z.string().optional(),
  NETSUITE_LABOR_PROJECT_ID_MAP: z.string().optional(),
  NETSUITE_LABOR_DEPARTMENT_ID: z.string().optional(),
  NETSUITE_LABOR_CLASS_ID: z.string().optional(),
  NETSUITE_LABOR_LOCATION_ID: z.string().optional(),
  NETSUITE_LABOR_MEMO_PREFIX: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export function isAzureSsoConfigured() {
  return Boolean(
    env.AZURE_AD_CLIENT_ID &&
      env.AZURE_AD_CLIENT_SECRET &&
      env.AZURE_AD_TENANT_ID,
  );
}

export function isLocalCredentialFallbackConfigured() {
  return Boolean(
    env.LOCAL_ADMIN_EMAIL &&
      (env.LOCAL_ADMIN_PASSWORD || env.LOCAL_ADMIN_PASSWORD_SHA256),
  );
}
