// Reassuring messages for long-running operations
// Messages are categorized by operation type and rotate to keep users engaged

export interface ReassuringMessageContext {
  operation: 'analyzing' | 'uploading' | 'loading' | 'importing' | 'cloning';
  filename?: string;
  filesCount?: number;
  progress?: number;
}

const messages = {
  analyzing: [
    'Analyzing file changes...',
    'Scanning for modifications...',
    'Processing your changes...',
    'Examining file differences...',
    'Reviewing code updates...',
    'Detecting file modifications...',
    'Evaluating changes...',
    'Inspecting file updates...',
  ],
  uploading: [
    'Pushing to GitHub...',
    'Uploading your changes...',
    'Syncing with repository...',
    'Transferring files...',
    'Sending updates to GitHub...',
    'Publishing your work...',
    'Committing changes...',
    'Updating remote repository...',
  ],
  loading: [
    'Loading project files...',
    'Fetching file contents...',
    'Retrieving project data...',
    'Gathering file information...',
    'Collecting project files...',
    'Processing file structure...',
    'Reading project contents...',
    'Preparing files...',
  ],
  importing: [
    'Importing repository...',
    'Fetching repository data...',
    'Downloading repository contents...',
    'Cloning repository structure...',
    'Retrieving repository files...',
    'Setting up repository...',
    'Initializing repository import...',
    'Processing repository data...',
  ],
  cloning: [
    'Cloning repository contents...',
    'Copying repository files...',
    'Duplicating repository structure...',
    'Transferring repository data...',
    'Replicating repository...',
    'Creating repository copy...',
    'Mirroring repository files...',
    'Establishing repository clone...',
  ],
};

const contextualMessages = {
  analyzing: [
    'This may take a moment for large projects',
    'Ensuring all changes are captured',
    'Working through your modifications',
    'Processing ${filesCount} files',
    'Almost there, ${progress}% complete',
    'Carefully reviewing each file',
    'Optimizing for best results',
    'Double-checking all changes',
  ],
  uploading: [
    'Your code is on its way to GitHub',
    'Securely transferring ${filesCount} files',
    '${progress}% uploaded',
    'Connection established with GitHub',
    'Pushing changes to ${filename}',
    'GitHub is receiving your updates',
    'Upload in progress, please wait',
    'Syncing with your repository',
  ],
  loading: [
    'Gathering ${filesCount} project files',
    'Loading ${filename}',
    '${progress}% loaded',
    'Fetching file contents',
    'Building project structure',
    'Almost ready to display',
    'Organizing your files',
    'Preparing project view',
  ],
  importing: [
    'This process ensures all files are imported',
    'Repository size may affect import time',
    '${progress}% imported',
    'Fetching repository metadata',
    'Downloading ${filename}',
    'Setting up repository structure',
    'Private repositories may take longer',
    'Establishing secure connection',
  ],
  cloning: [
    'Creating an exact copy of your repository',
    'Cloning ${filesCount} files',
    '${progress}% cloned',
    'Preserving repository structure',
    'Copying ${filename}',
    'Maintaining file integrity',
    'Repository clone in progress',
    'Duplicating all contents',
  ],
};

let messageIndexes: Record<string, number> = {};
let lastRotationTime: Record<string, number> = {};
const ROTATION_INTERVAL = 3000; // Rotate every 3 seconds

export function getRotatingMessage(context: ReassuringMessageContext): string {
  const { operation, filename, filesCount, progress } = context;
  const key = operation;

  // Initialize if needed
  if (!messageIndexes[key]) {
    messageIndexes[key] = 0;
    lastRotationTime[key] = Date.now();
  }

  // Check if it's time to rotate
  const now = Date.now();
  if (now - lastRotationTime[key] >= ROTATION_INTERVAL) {
    messageIndexes[key] = (messageIndexes[key] + 1) % messages[operation].length;
    lastRotationTime[key] = now;
  }

  return messages[operation][messageIndexes[key]];
}

export function getContextualMessage(context: ReassuringMessageContext): string {
  const { operation, filename, filesCount, progress } = context;
  const key = `${operation}_contextual`;

  // Initialize if needed
  if (!messageIndexes[key]) {
    messageIndexes[key] = 0;
    lastRotationTime[key] = Date.now();
  }

  // Check if it's time to rotate
  const now = Date.now();
  if (now - lastRotationTime[key] >= ROTATION_INTERVAL + 1000) {
    // Slightly offset from main message
    messageIndexes[key] = (messageIndexes[key] + 1) % contextualMessages[operation].length;
    lastRotationTime[key] = now;
  }

  let message = contextualMessages[operation][messageIndexes[key]];

  // Replace placeholders
  if (filename && message.includes('${filename}')) {
    // Truncate long filenames
    const displayName = filename.length > 30 ? '...' + filename.slice(-27) : filename;
    message = message.replace('${filename}', displayName);
  }

  if (filesCount !== undefined && message.includes('${filesCount}')) {
    message = message.replace('${filesCount}', filesCount.toString());
  }

  if (progress !== undefined && message.includes('${progress}')) {
    message = message.replace('${progress}', progress.toString());
  }

  // If placeholders weren't replaced, get a different message
  if (message.includes('${')) {
    const fallbackMessages = contextualMessages[operation].filter(
      (m) =>
        !m.includes('${') ||
        (filename && m.includes('${filename}')) ||
        (filesCount !== undefined && m.includes('${filesCount}')) ||
        (progress !== undefined && m.includes('${progress}'))
    );
    if (fallbackMessages.length > 0) {
      message = fallbackMessages[messageIndexes[key] % fallbackMessages.length];
    }
  }

  return message;
}

// Fun, encouraging messages for completion
export function getCompletionMessage(success: boolean, operation: string): string {
  const successMessages = [
    '🎉 All done! Great work!',
    '✨ Success! Everything went smoothly.',
    '🚀 Completed successfully!',
    '💫 Finished! Your changes are ready.',
    '🎊 Operation complete!',
    '⭐ All set! Nice job!',
    '🌟 Done! Everything looks good.',
    '✅ Successfully completed!',
  ];

  const errorMessages = [
    "Don't worry, we can fix this!",
    'Something went wrong, but we can try again.',
    'An error occurred. Check the details below.',
    'Operation failed, but you can retry.',
    "That didn't work, but let's troubleshoot.",
    'Error detected. See details for more info.',
    'Something unexpected happened.',
    'Operation unsuccessful. Please try again.',
  ];

  const messages = success ? successMessages : errorMessages;
  return messages[Math.floor(Math.random() * messages.length)];
}

// Reset message rotation (useful when switching between operations)
export function resetMessageRotation(operation?: string): void {
  if (operation) {
    delete messageIndexes[operation];
    delete messageIndexes[`${operation}_contextual`];
    delete lastRotationTime[operation];
    delete lastRotationTime[`${operation}_contextual`];
  } else {
    messageIndexes = {};
    lastRotationTime = {};
  }
}
