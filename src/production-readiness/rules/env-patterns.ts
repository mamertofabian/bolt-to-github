export interface EnvReference {
  name: string;
  public: boolean;
}

const ENV_NAME = '[A-Za-z_][A-Za-z0-9_]*';

type LexicalState =
  | 'code'
  | 'single'
  | 'double'
  | 'template'
  | 'line-comment'
  | 'block-comment'
  | 'html-comment';

const EXPRESSION_PREFIX_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'import',
  'new',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPublicEnvName(name: string): boolean {
  return /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_)/.test(name);
}

function startsSingleQuotedString(sourceText: string, quoteIndex: number): boolean {
  let identifierStart = quoteIndex;
  while (identifierStart > 0 && /[A-Za-z0-9_$]/.test(sourceText[identifierStart - 1])) {
    identifierStart -= 1;
  }
  if (identifierStart === quoteIndex) {
    return true;
  }
  return EXPRESSION_PREFIX_KEYWORDS.has(sourceText.slice(identifierStart, quoteIndex));
}

type MarkupTag = {
  start: number;
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
};

const HTML_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function hasValidTagSuffix(sourceText: string, cursor: number, closing: boolean): boolean {
  const immediate = sourceText[cursor] ?? '';
  if (immediate === '>') {
    return true;
  }
  if (immediate === '/') {
    return !closing && sourceText[cursor + 1] === '>';
  }
  if (!/\s/.test(immediate)) {
    return false;
  }
  while (/\s/.test(sourceText[cursor] ?? '')) {
    cursor += 1;
  }
  const next = sourceText[cursor] ?? '';
  if (next === '>') {
    return true;
  }
  if (closing) {
    return false;
  }
  if (next === '/') {
    return sourceText[cursor + 1] === '>';
  }
  return /[A-Za-z_:@#]/.test(next) || ['{', '[', '(', '*', '.'].includes(next);
}

function collectMarkupTags(sourceText: string, executable: Uint8Array): MarkupTag[] {
  const tags: MarkupTag[] = [];
  let rawTextTag: 'script' | 'style' | undefined;
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] !== '<') {
      continue;
    }
    if (rawTextTag) {
      const closingPrefix = `</${rawTextTag}`;
      const candidatePrefix = sourceText.slice(index, index + closingPrefix.length).toLowerCase();
      const boundary = sourceText[index + closingPrefix.length] ?? '';
      if (candidatePrefix !== closingPrefix || /[A-Za-z0-9:-]/.test(boundary)) {
        continue;
      }
    } else if (executable[index] !== 1) {
      continue;
    }
    let cursor = index + 1;
    const closing = sourceText[cursor] === '/';
    cursor += closing ? 1 : 0;
    const nameStart = cursor;
    if (!/[A-Za-z]/.test(sourceText[cursor] ?? '')) {
      continue;
    }
    cursor += 1;
    while (/[A-Za-z0-9:-]/.test(sourceText[cursor] ?? '')) {
      cursor += 1;
    }
    const name = sourceText.slice(nameStart, cursor).toLowerCase();
    if (!hasValidTagSuffix(sourceText, cursor, closing)) {
      continue;
    }
    let quote: "'" | '"' | undefined;
    let braceDepth = 0;
    let tagEnd: number | undefined;
    for (; cursor < sourceText.length; cursor += 1) {
      const character = sourceText[cursor];
      if (quote) {
        if (character === '\\') {
          cursor += 1;
        } else if (character === quote) {
          quote = undefined;
        }
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === '{') {
        braceDepth += 1;
      } else if (character === '}' && braceDepth > 0) {
        braceDepth -= 1;
      } else if (character === '>' && braceDepth === 0) {
        tagEnd = cursor + 1;
        break;
      }
    }
    if (tagEnd === undefined) {
      break;
    }
    let beforeClose = tagEnd - 2;
    while (beforeClose > index && /\s/.test(sourceText[beforeClose])) {
      beforeClose -= 1;
    }
    tags.push({
      start: index,
      end: tagEnd,
      name,
      closing,
      selfClosing: sourceText[beforeClose] === '/',
    });
    if (closing && rawTextTag === name) {
      rawTextTag = undefined;
    } else if (
      !closing &&
      sourceText[beforeClose] !== '/' &&
      (name === 'script' || name === 'style')
    ) {
      rawTextTag = name;
    }
    index = tagEnd - 1;
  }
  return tags;
}

function markSvelteExpression(
  sourceText: string,
  executable: Uint8Array,
  openIndex: number,
  segmentEnd: number
): number | undefined {
  let state: Exclude<LexicalState, 'html-comment'> = 'code';
  let braceDepth = 1;
  const templateReturnDepths: number[] = [];
  executable[openIndex] = 1;

  for (let index = openIndex + 1; index < segmentEnd; index += 1) {
    const character = sourceText[index];
    const nextCharacter = sourceText[index + 1];
    if (state === 'line-comment') {
      if (character === '\n' || character === '\r') {
        state = 'code';
        executable[index] = 1;
      }
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && nextCharacter === '/') {
        index += 1;
        state = 'code';
      }
      continue;
    }
    if (state === 'single' || state === 'double') {
      if (character === '\\') {
        index += 1;
      } else if (
        (state === 'single' && character === "'") ||
        (state === 'double' && character === '"')
      ) {
        state = 'code';
      }
      continue;
    }
    if (state === 'template') {
      if (character === '\\') {
        index += 1;
      } else if (character === '`') {
        state = 'code';
      } else if (character === '$' && nextCharacter === '{') {
        templateReturnDepths.push(braceDepth);
        braceDepth += 1;
        state = 'code';
        index += 1;
      }
      continue;
    }

    executable[index] = 1;
    if (character === '/' && nextCharacter === '/') {
      state = 'line-comment';
      index += 1;
    } else if (character === '/' && nextCharacter === '*') {
      state = 'block-comment';
      index += 1;
    } else if (character === "'") {
      state = 'single';
    } else if (character === '"') {
      state = 'double';
    } else if (character === '`') {
      state = 'template';
    } else if (character === '{') {
      braceDepth += 1;
    } else if (character === '}') {
      braceDepth -= 1;
      if (braceDepth === 0) {
        return index;
      }
      if (templateReturnDepths.at(-1) === braceDepth) {
        templateReturnDepths.pop();
        state = 'template';
      }
    }
  }

  executable.fill(0, openIndex, segmentEnd);
  return undefined;
}

function maskMarkupSegment(
  sourceText: string,
  executable: Uint8Array,
  start: number,
  end: number,
  preserveExpressions: boolean
): void {
  executable.fill(0, start, end);
  if (!preserveExpressions) {
    return;
  }
  for (let index = start; index < end; index += 1) {
    if (sourceText.startsWith('<!--', index)) {
      const commentEnd = sourceText.indexOf('-->', index + 4);
      index = commentEnd >= 0 && commentEnd < end ? commentEnd + 2 : end;
    } else if (sourceText[index] === '{') {
      const closeIndex = markSvelteExpression(sourceText, executable, index, end);
      if (closeIndex !== undefined) {
        index = closeIndex;
      }
    }
  }
}

function maskMarkupText(sourceText: string, executable: Uint8Array): void {
  const tags = collectMarkupTags(sourceText, executable);
  if (tags.length === 0) {
    return;
  }

  const remainingClosings = new Map<string, number>();
  for (const tag of tags) {
    if (tag.closing) {
      remainingClosings.set(tag.name, (remainingClosings.get(tag.name) ?? 0) + 1);
    }
  }

  const stack: string[] = [];
  let scriptDepth = 0;
  let styleDepth = 0;
  let cursor = 0;
  let expressionScanCursor = 0;
  let activeExpressionEnd: number | undefined;
  for (const tag of tags) {
    if (activeExpressionEnd !== undefined && tag.start < activeExpressionEnd) {
      if (tag.closing) {
        remainingClosings.set(tag.name, Math.max(0, (remainingClosings.get(tag.name) ?? 0) - 1));
      }
      continue;
    }
    if (activeExpressionEnd !== undefined) {
      expressionScanCursor = activeExpressionEnd + 1;
      activeExpressionEnd = undefined;
    }
    if (stack.length > 0 && scriptDepth === 0 && styleDepth === 0) {
      while (expressionScanCursor < tag.start) {
        const openIndex = sourceText.indexOf('{', expressionScanCursor);
        if (openIndex < 0 || openIndex >= tag.start) {
          expressionScanCursor = tag.start;
          break;
        }
        const closeIndex = markSvelteExpression(
          sourceText,
          executable,
          openIndex,
          sourceText.length
        );
        if (closeIndex === undefined) {
          expressionScanCursor = tag.start;
          break;
        }
        if (closeIndex > tag.start) {
          activeExpressionEnd = closeIndex;
          break;
        }
        expressionScanCursor = closeIndex + 1;
      }
      if (activeExpressionEnd !== undefined) {
        if (tag.closing) {
          remainingClosings.set(tag.name, Math.max(0, (remainingClosings.get(tag.name) ?? 0) - 1));
        }
        continue;
      }
    }
    if (tag.closing && stack.lastIndexOf(tag.name) < 0) {
      remainingClosings.set(tag.name, Math.max(0, (remainingClosings.get(tag.name) ?? 0) - 1));
      continue;
    }
    if (
      !tag.closing &&
      !tag.selfClosing &&
      !HTML_VOID_TAGS.has(tag.name) &&
      (remainingClosings.get(tag.name) ?? 0) === 0
    ) {
      continue;
    }
    if (stack.length > 0 && scriptDepth === 0) {
      maskMarkupSegment(sourceText, executable, cursor, tag.start, styleDepth === 0);
    }
    maskMarkupSegment(sourceText, executable, tag.start, tag.end, true);

    if (tag.closing) {
      remainingClosings.set(tag.name, Math.max(0, (remainingClosings.get(tag.name) ?? 0) - 1));
      const matchingIndex = stack.lastIndexOf(tag.name);
      if (matchingIndex >= 0) {
        for (const removed of stack.splice(matchingIndex)) {
          scriptDepth -= removed === 'script' ? 1 : 0;
          styleDepth -= removed === 'style' ? 1 : 0;
        }
      }
    } else if (!tag.selfClosing && (remainingClosings.get(tag.name) ?? 0) > 0) {
      stack.push(tag.name);
      scriptDepth += tag.name === 'script' ? 1 : 0;
      styleDepth += tag.name === 'style' ? 1 : 0;
    }
    cursor = tag.end;
    expressionScanCursor = tag.end;
  }

  if (stack.length > 0 && scriptDepth === 0) {
    maskMarkupSegment(sourceText, executable, cursor, sourceText.length, styleDepth === 0);
  }
}

function executablePositions(sourceText: string): Uint8Array {
  const positions = new Uint8Array(sourceText.length);
  let state: LexicalState = 'code';
  const templateInterpolationDepths: number[] = [];

  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    const nextCharacter = sourceText[index + 1];

    if (state === 'line-comment') {
      if (character === '\n' || character === '\r') {
        state = 'code';
        positions[index] = 1;
      }
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && nextCharacter === '/') {
        index += 1;
        state = 'code';
      }
      continue;
    }
    if (state === 'html-comment') {
      if (character === '-' && nextCharacter === '-' && sourceText[index + 2] === '>') {
        index += 2;
        state = 'code';
      }
      continue;
    }
    if (state === 'single' || state === 'double') {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if ((state === 'single' && character === "'") || (state === 'double' && character === '"')) {
        state = 'code';
      }
      continue;
    }
    if (state === 'template') {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === '`') {
        state = 'code';
        continue;
      }
      if (character === '$' && nextCharacter === '{') {
        templateInterpolationDepths.push(1);
        state = 'code';
        index += 1;
      }
      continue;
    }

    positions[index] = 1;
    if (
      character === '<' &&
      nextCharacter === '!' &&
      sourceText[index + 2] === '-' &&
      sourceText[index + 3] === '-'
    ) {
      state = 'html-comment';
      index += 3;
    } else if (character === '/' && nextCharacter === '/') {
      state = 'line-comment';
      index += 1;
    } else if (character === '/' && nextCharacter === '*') {
      state = 'block-comment';
      index += 1;
    } else if (character === "'" && startsSingleQuotedString(sourceText, index)) {
      state = 'single';
    } else if (character === '"') {
      state = 'double';
    } else if (character === '`') {
      state = 'template';
    } else if (templateInterpolationDepths.length > 0 && character === '{') {
      templateInterpolationDepths[templateInterpolationDepths.length - 1] += 1;
    } else if (templateInterpolationDepths.length > 0 && character === '}') {
      const depthIndex = templateInterpolationDepths.length - 1;
      templateInterpolationDepths[depthIndex] -= 1;
      if (templateInterpolationDepths[depthIndex] === 0) {
        templateInterpolationDepths.pop();
        state = 'template';
      }
    }
  }

  maskMarkupText(sourceText, positions);
  return positions;
}

function collectMatches(
  sourceText: string,
  pattern: RegExp,
  nameGroup: number,
  names: Set<string>,
  executable: Uint8Array
): void {
  for (const match of sourceText.matchAll(pattern)) {
    const name = match[nameGroup];
    if (name && match.index !== undefined && executable[match.index] === 1) {
      names.add(name);
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectSvelteKitPublicReferences(
  sourceText: string,
  names: Set<string>,
  executable: Uint8Array
): void {
  const staticImports = /\bimport\s*\{([^}\r\n]{1,4096})\}\s*from\s*(['"])\$env\/static\/public\2/g;
  for (const match of sourceText.matchAll(staticImports)) {
    if (match.index === undefined || executable[match.index] !== 1) {
      continue;
    }
    for (const specifier of match[1].split(',')) {
      const importedName = specifier.trim().match(/^(PUBLIC_[A-Za-z0-9_]*)\b/)?.[1];
      if (importedName) {
        names.add(importedName);
      }
    }
  }

  const dynamicImports =
    /\bimport\s*\{\s*env(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?\s*\}\s*from\s*(['"])\$env\/dynamic\/public\2/g;
  for (const match of sourceText.matchAll(dynamicImports)) {
    if (match.index === undefined || executable[match.index] !== 1) {
      continue;
    }
    const localName = match[1] ?? 'env';
    collectMatches(
      sourceText,
      new RegExp(`\\b${escapeRegExp(localName)}\\.(${ENV_NAME})\\b`, 'g'),
      1,
      names,
      executable
    );
  }
}

export function extractEnvReferences(sourceText: string): EnvReference[] {
  const names = new Set<string>();
  const executable = executablePositions(sourceText);

  collectMatches(
    sourceText,
    new RegExp(`\\bprocess\\.env\\.(${ENV_NAME})\\b`, 'g'),
    1,
    names,
    executable
  );
  collectMatches(
    sourceText,
    new RegExp(`\\bprocess\\.env\\s*\\[\\s*(['"])((${ENV_NAME}))\\1\\s*\\]`, 'g'),
    2,
    names,
    executable
  );
  collectMatches(
    sourceText,
    new RegExp(`\\bimport\\.meta\\.env\\.(${ENV_NAME})\\b`, 'g'),
    1,
    names,
    executable
  );
  collectMatches(
    sourceText,
    new RegExp(`\\bimport\\.meta\\.env\\s*\\[\\s*(['"])((${ENV_NAME}))\\1\\s*\\]`, 'g'),
    2,
    names,
    executable
  );
  collectMatches(
    sourceText,
    new RegExp(`\\bDeno\\.env\\.get\\(\\s*(['"])((${ENV_NAME}))\\1\\s*\\)`, 'g'),
    2,
    names,
    executable
  );
  collectMatches(
    sourceText,
    new RegExp(`\\bBun\\.env\\.(${ENV_NAME})\\b`, 'g'),
    1,
    names,
    executable
  );
  collectMatches(
    sourceText,
    new RegExp(`\\bBun\\.env\\s*\\[\\s*(['"])((${ENV_NAME}))\\1\\s*\\]`, 'g'),
    2,
    names,
    executable
  );
  collectSvelteKitPublicReferences(sourceText, names, executable);
  return [...names].sort(compareStrings).map((name) => ({ name, public: isPublicEnvName(name) }));
}

export function extractEnvExampleVariables(sourceText: string): string[] {
  const names = new Set<string>();
  for (const line of sourceText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      names.add(match[1]);
    }
  }
  return [...names].sort(compareStrings);
}
