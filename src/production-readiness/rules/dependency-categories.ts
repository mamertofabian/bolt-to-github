export type DependencyCategory =
  | 'auth'
  | 'database'
  | 'payments'
  | 'email_sms'
  | 'ai_api'
  | 'validation'
  | 'monitoring'
  | 'platform_storage';

type DependencyCategoryRule = {
  category: DependencyCategory;
  exact?: readonly string[];
  prefixes?: readonly string[];
};

const DEPENDENCY_CATEGORY_RULES: readonly DependencyCategoryRule[] = [
  {
    category: 'auth',
    exact: ['next-auth', '@supabase/supabase-js', 'firebase'],
    prefixes: ['@clerk/'],
  },
  {
    category: 'database',
    exact: ['prisma', 'drizzle-orm', '@neondatabase/serverless', 'pg', 'mysql2', 'mongoose'],
  },
  {
    category: 'payments',
    exact: ['stripe'],
    prefixes: ['@paypal/'],
  },
  {
    category: 'email_sms',
    exact: ['resend', 'nodemailer', 'twilio'],
    prefixes: ['@sendgrid/'],
  },
  {
    category: 'ai_api',
    exact: ['openai', 'anthropic', 'ai'],
    prefixes: ['@ai-sdk/'],
  },
  {
    category: 'validation',
    exact: ['zod', 'yup', 'joi'],
  },
  {
    category: 'monitoring',
    exact: ['sentry', 'posthog-js'],
    prefixes: ['@sentry/'],
  },
  {
    category: 'platform_storage',
    prefixes: ['@supabase/'],
  },
];

export function categorizeDependency(packageName: string): DependencyCategory | null {
  for (const rule of DEPENDENCY_CATEGORY_RULES) {
    if (
      rule.exact?.includes(packageName) ||
      rule.prefixes?.some((prefix) => packageName.startsWith(prefix))
    ) {
      return rule.category;
    }
  }
  return null;
}
