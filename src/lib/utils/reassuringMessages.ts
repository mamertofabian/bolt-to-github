// Reassuring messages for long-running operations
// Messages change based on progress to keep users engaged

export interface ReassuringMessageContext {
  operation: 'analyzing' | 'uploading' | 'loading' | 'importing' | 'cloning';
  filename?: string;
  filesCount?: number;
  progress?: number;
  filesProcessed?: number;
  currentFile?: string;
}

// Progress-based messages for different stages
const progressMessages = {
  analyzing: {
    early: [
      'Starting analysis...',
      'Scanning project structure...',
      'Detecting changes...',
      'Initializing file scan...',
    ],
    middle: [
      'Analyzing file modifications...',
      'Processing changed files...',
      'Comparing file contents...',
      'Evaluating code changes...',
    ],
    late: [
      'Finalizing analysis...',
      'Almost done scanning...',
      'Completing file review...',
      'Wrapping up analysis...',
    ],
  },
  uploading: {
    early: [
      'Connecting to GitHub...',
      'Preparing upload...',
      'Starting push operation...',
      'Initializing transfer...',
    ],
    middle: [
      'Uploading your changes...',
      'Pushing files to repository...',
      'Transferring data...',
      'Syncing with GitHub...',
    ],
    late: ['Finalizing upload...', 'Almost there...', 'Completing push...', 'Finishing up...'],
  },
  loading: {
    early: [
      'Starting to load files...',
      'Accessing project data...',
      'Opening project...',
      'Initializing...',
    ],
    middle: [
      'Loading project files...',
      'Reading file contents...',
      'Processing files...',
      'Gathering data...',
    ],
    late: [
      'Almost ready...',
      'Finalizing load...',
      'Completing file retrieval...',
      'Nearly done...',
    ],
  },
  importing: {
    early: [
      'Connecting to repository...',
      'Starting import...',
      'Accessing repository data...',
      'Beginning download...',
    ],
    middle: [
      'Importing repository files...',
      'Downloading contents...',
      'Fetching repository data...',
      'Processing import...',
    ],
    late: [
      'Finalizing import...',
      'Almost imported...',
      'Completing download...',
      'Import nearly complete...',
    ],
  },
  cloning: {
    early: [
      'Initiating clone...',
      'Starting repository copy...',
      'Preparing clone operation...',
      'Beginning duplication...',
    ],
    middle: [
      'Cloning repository...',
      'Copying files...',
      'Duplicating contents...',
      'Transferring data...',
    ],
    late: ['Finalizing clone...', 'Almost cloned...', 'Completing copy...', 'Clone nearly done...'],
  },
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

// Track message state
interface MessageState {
  lastProgress: number;
  lastStage: 'early' | 'middle' | 'late';
  messageIndex: number;
  lastFile?: string;
  lastUpdateTime: number;
  noProgressCounter: number;
}

const messageStates: Record<string, MessageState> = {};
const STALE_THRESHOLD = 5000; // Show "still working" message after 5s of no progress

function getProgressStage(progress: number): 'early' | 'middle' | 'late' {
  if (progress < 30) return 'early';
  if (progress < 70) return 'middle';
  return 'late';
}

export function getRotatingMessage(context: ReassuringMessageContext): string {
  const { operation, progress = 0, currentFile, filesProcessed } = context;
  const key = operation;

  // Initialize state if needed
  if (!messageStates[key]) {
    messageStates[key] = {
      lastProgress: -1,
      lastStage: 'early',
      messageIndex: 0,
      lastUpdateTime: Date.now(),
      noProgressCounter: 0,
    };
  }

  const state = messageStates[key];
  const currentStage = getProgressStage(progress);
  const now = Date.now();
  const timeSinceUpdate = now - state.lastUpdateTime;

  // Determine if we should update the message
  let shouldUpdate = false;
  let updateReason = '';

  // Check various conditions for updating
  if (progress !== state.lastProgress && progress > state.lastProgress) {
    shouldUpdate = true;
    updateReason = 'progress';
    state.noProgressCounter = 0;
  } else if (currentStage !== state.lastStage) {
    shouldUpdate = true;
    updateReason = 'stage';
  } else if (currentFile && currentFile !== state.lastFile) {
    shouldUpdate = true;
    updateReason = 'file';
  } else if (timeSinceUpdate >= STALE_THRESHOLD) {
    // No progress for a while, show reassuring message
    shouldUpdate = true;
    updateReason = 'stale';
    state.noProgressCounter++;
  }

  if (shouldUpdate) {
    const messages = progressMessages[operation][currentStage];

    // Special handling for stale progress
    if (updateReason === 'stale' && state.noProgressCounter > 0) {
      const staleMessages = [
        'Still working on it...',
        'This is taking a bit longer...',
        'Please wait, still processing...',
        'Working hard on this...',
        'Taking care of the details...',
      ];
      state.lastUpdateTime = now;
      return staleMessages[state.noProgressCounter % staleMessages.length];
    }

    // Regular message update
    state.messageIndex = (state.messageIndex + 1) % messages.length;
    state.lastProgress = progress;
    state.lastStage = currentStage;
    state.lastFile = currentFile;
    state.lastUpdateTime = now;
  }

  const messages = progressMessages[operation][currentStage];
  return messages[state.messageIndex % messages.length];
}

export function getContextualMessage(context: ReassuringMessageContext): string {
  const { operation, filename, filesCount, progress = 0, filesProcessed, currentFile } = context;
  const stage = getProgressStage(progress);

  // Build dynamic contextual messages based on available data
  const contextMessages: string[] = [];

  // Progress-specific messages
  if (progress > 0) {
    if (stage === 'early') {
      contextMessages.push(`${progress}% complete - Getting started...`);
    } else if (stage === 'middle') {
      contextMessages.push(`${progress}% complete - Making good progress`);
      if (filesCount && filesProcessed) {
        contextMessages.push(`Processed ${filesProcessed} of ${filesCount} files`);
      }
    } else {
      contextMessages.push(`${progress}% complete - Almost there!`);
    }
  }

  // File-specific messages
  if (currentFile || filename) {
    const file = currentFile || filename;
    const displayName = file.length > 40 ? '...' + file.slice(-37) : file;
    contextMessages.push(`Working on: ${displayName}`);
  }

  // Operation and count specific messages
  if (filesCount) {
    if (filesCount === 1) {
      contextMessages.push('Processing 1 file');
    } else if (filesCount < 10) {
      contextMessages.push(`Processing ${filesCount} files`);
    } else {
      contextMessages.push(`Processing ${filesCount} files - this may take a moment`);
    }
  }

  // Add estimated time if we can calculate it
  if (progress > 10 && progress < 90) {
    const rate =
      progress / ((Date.now() - (messageStates[operation]?.lastUpdateTime || Date.now())) / 1000);
    if (rate > 0) {
      const remainingTime = Math.ceil((100 - progress) / rate);
      if (remainingTime < 60) {
        contextMessages.push(`About ${remainingTime} seconds remaining`);
      } else {
        const minutes = Math.ceil(remainingTime / 60);
        contextMessages.push(`About ${minutes} minute${minutes > 1 ? 's' : ''} remaining`);
      }
    }
  }

  // Fallback to generic contextual messages if none were generated
  if (contextMessages.length === 0) {
    const fallbacks = contextualMessages[operation].filter((msg) => !msg.includes('${'));
    contextMessages.push(...fallbacks);
  }

  // Return a message based on the current progress
  const messageIndex = Math.floor(progress / 10) % contextMessages.length;
  return contextMessages[messageIndex] || contextMessages[0] || 'Processing...';
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

// Reset message state (useful when switching between operations)
export function resetMessageRotation(operation?: string): void {
  if (operation) {
    delete messageStates[operation];
  } else {
    // Clear all states
    Object.keys(messageStates).forEach((key) => delete messageStates[key]);
  }
}
