export interface EnvReference {
  name: string;
  public: boolean;
}

const ENV_NAME = '[A-Z][A-Z0-9_]*';
const REFERENCE_PATTERNS = [
  new RegExp(`\\bprocess\\.env\\.(${ENV_NAME})\\b`, 'g'),
  new RegExp(`\\bprocess\\.env\\s*\\[\\s*["'](${ENV_NAME})["']\\s*\\]`, 'g'),
  new RegExp(`\\bimport\\.meta\\.env\\.(${ENV_NAME})\\b`, 'g'),
  new RegExp(`\\bimport\\.meta\\.env\\s*\\[\\s*["'](${ENV_NAME})["']\\s*\\]`, 'g'),
  new RegExp(`\\bDeno\\.env\\.get\\s*\\(\\s*["'](${ENV_NAME})["']\\s*\\)`, 'g'),
  new RegExp(`\\bBun\\.env\\.(${ENV_NAME})\\b`, 'g'),
  new RegExp(`\\bBun\\.env\\s*\\[\\s*["'](${ENV_NAME})["']\\s*\\]`, 'g'),
  /\b((?:VITE_|NEXT_PUBLIC_|PUBLIC_)[A-Z0-9_]+)\b/g,
] as const;

function isPublicVariable(name: string): boolean {
  return name.startsWith('VITE_') || name.startsWith('NEXT_PUBLIC_') || name.startsWith('PUBLIC_');
}

export function extractEnvReferences(sourceText: string): EnvReference[] {
  const names = new Set<string>();

  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of sourceText.matchAll(pattern)) {
      const name = match[1];
      if (name) {
        names.add(name);
      }
    }
  }

  return [...names].sort().map((name) => ({ name, public: isPublicVariable(name) }));
}
