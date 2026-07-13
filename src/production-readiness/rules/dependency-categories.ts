export type DependencyCategory =
  | 'auth'
  | 'database'
  | 'payments'
  | 'email_sms'
  | 'ai_api'
  | 'validation'
  | 'monitoring'
  | 'platform_storage';

export interface DependencyCategoryRule {
  category: DependencyCategory;
  packages: readonly string[];
}

const CATEGORY_ORDER: readonly DependencyCategory[] = [
  'auth',
  'database',
  'payments',
  'email_sms',
  'ai_api',
  'validation',
  'monitoring',
  'platform_storage',
];

const DEFAULT_DEPENDENCY_CATEGORY_RULES: readonly DependencyCategoryRule[] = [
  {
    category: 'auth',
    packages: ['@clerk/*', 'next-auth', '@supabase/supabase-js', 'firebase'],
  },
  {
    category: 'database',
    packages: [
      'prisma',
      '@prisma/client',
      'drizzle-orm',
      '@neondatabase/serverless',
      'pg',
      'mysql2',
      'mongoose',
    ],
  },
  {
    category: 'payments',
    packages: ['stripe', '@paypal/*'],
  },
  {
    category: 'email_sms',
    packages: ['resend', 'nodemailer', '@sendgrid/*', 'twilio'],
  },
  {
    category: 'ai_api',
    packages: ['openai', 'anthropic', 'ai', '@ai-sdk/*'],
  },
  {
    category: 'validation',
    packages: ['zod', 'yup', 'joi'],
  },
  {
    category: 'monitoring',
    packages: ['sentry', '@sentry/*', 'posthog-js'],
  },
  {
    category: 'platform_storage',
    packages: ['firebase', '@supabase/*'],
  },
];

function matchesPackage(packageName: string, pattern: string): boolean {
  if (!pattern.endsWith('/*')) {
    return packageName === pattern;
  }
  const scopePrefix = pattern.slice(0, -1);
  return packageName.startsWith(scopePrefix) && packageName.length > scopePrefix.length;
}

export function getDependencyCategoryRules(): DependencyCategoryRule[] {
  return DEFAULT_DEPENDENCY_CATEGORY_RULES.map((rule) => ({
    category: rule.category,
    packages: [...rule.packages],
  }));
}

export function categorizeDependency(packageName: string): DependencyCategory[] {
  const matched = new Set<DependencyCategory>();
  for (const rule of DEFAULT_DEPENDENCY_CATEGORY_RULES) {
    if (rule.packages.some((pattern) => matchesPackage(packageName, pattern))) {
      matched.add(rule.category);
    }
  }
  return CATEGORY_ORDER.filter((category) => matched.has(category));
}
