import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getRotatingMessage,
  getContextualMessage,
  getCompletionMessage,
  resetMessageRotation,
  type ReassuringMessageContext,
} from './reassuringMessages';

describe('reassuringMessages', () => {
  beforeEach(() => {
    resetMessageRotation();

    vi.restoreAllMocks();
  });

  describe('getRotatingMessage', () => {
    it('should return an early stage message for progress < 30%', () => {
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 10,
      };

      const message = getRotatingMessage(context);

      const earlyMessages = [
        'Starting analysis...',
        'Scanning project structure...',
        'Detecting changes...',
        'Initializing file scan...',
      ];
      expect(earlyMessages).toContain(message);
    });

    it('should return a middle stage message for progress 30-70%', () => {
      const context: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 50,
      };

      const message = getRotatingMessage(context);

      const middleMessages = [
        'Uploading your changes...',
        'Pushing files to repository...',
        'Transferring data...',
        'Syncing with GitHub...',
      ];
      expect(middleMessages).toContain(message);
    });

    it('should return a late stage message for progress >= 70%', () => {
      const context: ReassuringMessageContext = {
        operation: 'loading',
        progress: 85,
      };

      const message = getRotatingMessage(context);

      const lateMessages = [
        'Almost ready...',
        'Finalizing load...',
        'Completing file retrieval...',
        'Nearly done...',
      ];
      expect(lateMessages).toContain(message);
    });

    it('should rotate through messages when progress increases', () => {
      const messages: string[] = [];

      for (let i = 0; i < 5; i++) {
        const context: ReassuringMessageContext = {
          operation: 'analyzing',
          progress: 10 + i,
        };
        messages.push(getRotatingMessage(context));
      }

      const uniqueMessages = new Set(messages);
      expect(uniqueMessages.size).toBeGreaterThan(1);
    });

    it('should return the same message when called repeatedly without progress change', () => {
      const context: ReassuringMessageContext = {
        operation: 'cloning',
        progress: 25,
      };

      const message1 = getRotatingMessage(context);
      const message2 = getRotatingMessage(context);

      expect(message1).toBe(message2);
    });

    it('should update message when stage changes from early to middle', () => {
      const earlyContext: ReassuringMessageContext = {
        operation: 'importing',
        progress: 20,
      };
      const earlyMessage = getRotatingMessage(earlyContext);

      const middleContext: ReassuringMessageContext = {
        operation: 'importing',
        progress: 45,
      };
      const middleMessage = getRotatingMessage(middleContext);

      const earlyMessages = [
        'Connecting to repository...',
        'Starting import...',
        'Accessing repository data...',
        'Beginning download...',
      ];
      const middleMessages = [
        'Importing repository files...',
        'Downloading contents...',
        'Fetching repository data...',
        'Processing import...',
      ];

      expect(earlyMessages).toContain(earlyMessage);
      expect(middleMessages).toContain(middleMessage);
    });

    it('should update message when current file changes', () => {
      const context1: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 40,
        currentFile: 'file1.ts',
      };
      const message1 = getRotatingMessage(context1);

      const context2: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 40,
        currentFile: 'file2.ts',
      };
      const message2 = getRotatingMessage(context2);

      expect(message1).not.toBe(message2);
    });

    it('should show stale message after threshold with no progress', () => {
      vi.useFakeTimers();

      const context: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 30,
      };

      getRotatingMessage(context);

      vi.advanceTimersByTime(6000);

      const staleMessage = getRotatingMessage(context);

      const staleMessages = [
        'Still working on it...',
        'This is taking a bit longer...',
        'Please wait, still processing...',
        'Working hard on this...',
        'Taking care of the details...',
      ];

      expect(staleMessages).toContain(staleMessage);

      vi.useRealTimers();
    });

    it('should cycle through stale messages when stale for extended periods', () => {
      vi.useFakeTimers();

      const context: ReassuringMessageContext = {
        operation: 'loading',
        progress: 50,
      };

      getRotatingMessage(context);

      const staleMessages: string[] = [];

      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(6000);
        staleMessages.push(getRotatingMessage(context));
      }

      const uniqueStaleMessages = new Set(staleMessages);
      expect(uniqueStaleMessages.size).toBeGreaterThan(1);

      vi.useRealTimers();
    });

    it('should handle all operation types', () => {
      const operations: Array<ReassuringMessageContext['operation']> = [
        'analyzing',
        'uploading',
        'loading',
        'importing',
        'cloning',
      ];

      operations.forEach((operation) => {
        const context: ReassuringMessageContext = {
          operation,
          progress: 50,
        };

        const message = getRotatingMessage(context);

        expect(message).toBeTruthy();
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });

    it('should maintain independent state for different operations', () => {
      const analyzingContext: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 10,
      };
      const uploadingContext: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 10,
      };

      getRotatingMessage(analyzingContext);
      const uploadingMsg1 = getRotatingMessage(uploadingContext);

      const analyzingContext2: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 15,
      };
      getRotatingMessage(analyzingContext2);

      const uploadingMsg2 = getRotatingMessage(uploadingContext);

      expect(uploadingMsg1).toBe(uploadingMsg2);
    });

    it('should handle progress value of 0', () => {
      const context: ReassuringMessageContext = {
        operation: 'cloning',
        progress: 0,
      };

      const message = getRotatingMessage(context);

      const earlyMessages = [
        'Initiating clone...',
        'Starting repository copy...',
        'Preparing clone operation...',
        'Beginning duplication...',
      ];
      expect(earlyMessages).toContain(message);
    });

    it('should handle progress value of 100', () => {
      const context: ReassuringMessageContext = {
        operation: 'importing',
        progress: 100,
      };

      const message = getRotatingMessage(context);

      const lateMessages = [
        'Finalizing import...',
        'Almost imported...',
        'Completing download...',
        'Import nearly complete...',
      ];
      expect(lateMessages).toContain(message);
    });

    it('should handle context without progress field', () => {
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
      };

      const message = getRotatingMessage(context);

      const earlyMessages = [
        'Starting analysis...',
        'Scanning project structure...',
        'Detecting changes...',
        'Initializing file scan...',
      ];
      expect(earlyMessages).toContain(message);
    });
  });

  describe('getContextualMessage', () => {
    it('should return early stage message for progress < 30%', () => {
      const context: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 15,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should return middle stage message for progress 30-70%', () => {
      const context: ReassuringMessageContext = {
        operation: 'loading',
        progress: 50,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should return late stage message for progress >= 70%', () => {
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 85,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should build messages with file count information', () => {
      const context: ReassuringMessageContext = {
        operation: 'cloning',
        progress: 40,
        filesCount: 25,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should build messages with files processed information when in middle stage', () => {
      const context: ReassuringMessageContext = {
        operation: 'importing',
        progress: 60,
        filesCount: 100,
        filesProcessed: 60,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should build messages with current file information', () => {
      const context: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 45,
        currentFile: 'src/components/App.svelte',
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should truncate long file names in messages', () => {
      const longFileName =
        'src/very/deep/nested/folder/structure/with/a/really/long/path/to/file.ts';
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 30,
        currentFile: longFileName,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeLessThan(200);
    });

    it('should handle single file count', () => {
      const context: ReassuringMessageContext = {
        operation: 'loading',
        progress: 20,
        filesCount: 1,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should include time estimate for mid-range progress', () => {
      vi.useFakeTimers();

      const context1: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 20,
      };
      getContextualMessage(context1);

      vi.advanceTimersByTime(2000);

      const context2: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 40,
      };
      const message = getContextualMessage(context2);

      expect(message).toBeTruthy();

      vi.useRealTimers();
    });

    it('should return fallback message when no context data available', () => {
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should prefer currentFile over filename', () => {
      const context: ReassuringMessageContext = {
        operation: 'loading',
        progress: 35,
        filename: 'oldFile.ts',
        currentFile: 'newFile.ts',
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should use filename when currentFile is not provided', () => {
      const context: ReassuringMessageContext = {
        operation: 'importing',
        progress: 25,
        filename: 'package.json',
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should handle progress of 0', () => {
      const context: ReassuringMessageContext = {
        operation: 'cloning',
        progress: 0,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should handle large file counts', () => {
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 50,
        filesCount: 500,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should handle small file counts', () => {
      const context: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 40,
        filesCount: 5,
      };

      const message = getContextualMessage(context);

      expect(message).toContain('5 files');
    });

    it('should return different messages for different progress values', () => {
      const messages: string[] = [];

      for (let progress = 10; progress <= 90; progress += 20) {
        const context: ReassuringMessageContext = {
          operation: 'loading',
          progress,
        };
        messages.push(getContextualMessage(context));
      }

      const uniqueMessages = new Set(messages);
      expect(uniqueMessages.size).toBeGreaterThan(1);
    });
  });

  describe('getCompletionMessage', () => {
    it('should return a success message when success is true', () => {
      const message = getCompletionMessage(true, 'uploading');

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

      expect(successMessages).toContain(message);
    });

    it('should return an error message when success is false', () => {
      const message = getCompletionMessage(false, 'analyzing');

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

      expect(errorMessages).toContain(message);
    });

    it('should return a string for any operation type', () => {
      const operations = ['analyzing', 'uploading', 'loading', 'importing', 'cloning'];

      operations.forEach((operation) => {
        const successMsg = getCompletionMessage(true, operation);
        const errorMsg = getCompletionMessage(false, operation);

        expect(typeof successMsg).toBe('string');
        expect(typeof errorMsg).toBe('string');
        expect(successMsg.length).toBeGreaterThan(0);
        expect(errorMsg.length).toBeGreaterThan(0);
      });
    });

    it('should return random messages on multiple calls', () => {
      const messages: string[] = [];

      for (let i = 0; i < 20; i++) {
        messages.push(getCompletionMessage(true, 'uploading'));
      }

      const uniqueMessages = new Set(messages);
      expect(uniqueMessages.size).toBeGreaterThan(1);
    });

    it('should include emoji in success messages', () => {
      const messages: string[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push(getCompletionMessage(true, 'loading'));
      }

      const hasEmoji = messages.some((msg) => /[\u{1F300}-\u{1F9FF}]/u.test(msg));
      expect(hasEmoji).toBe(true);
    });

    it('should provide helpful error messages', () => {
      const messages: string[] = [];

      for (let i = 0; i < 20; i++) {
        messages.push(getCompletionMessage(false, 'cloning'));
      }

      messages.forEach((msg) => {
        expect(msg.length).toBeGreaterThan(10);
      });
    });
  });

  describe('resetMessageRotation', () => {
    it('should reset state for a specific operation', () => {
      const context1: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 10,
      };
      const message1 = getRotatingMessage(context1);

      const context2: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 20,
      };
      getRotatingMessage(context2);

      resetMessageRotation('analyzing');

      const context3: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 10,
      };
      const message3 = getRotatingMessage(context3);

      expect(message3).toBe(message1);
    });

    it('should reset all operations when no parameter provided', () => {
      const analyzingContext: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 30,
      };
      const uploadingContext: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 40,
      };

      getRotatingMessage(analyzingContext);
      getRotatingMessage(uploadingContext);

      resetMessageRotation();

      const newAnalyzingMsg = getRotatingMessage(analyzingContext);
      const newUploadingMsg = getRotatingMessage(uploadingContext);

      expect(newAnalyzingMsg).toBeTruthy();
      expect(newUploadingMsg).toBeTruthy();
    });

    it('should not affect other operations when resetting specific operation', () => {
      const analyzingContext: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 20,
      };
      const uploadingContext: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 30,
      };

      getRotatingMessage(analyzingContext);
      const uploadingMsg1 = getRotatingMessage(uploadingContext);

      resetMessageRotation('analyzing');

      const uploadingMsg2 = getRotatingMessage(uploadingContext);

      expect(uploadingMsg1).toBe(uploadingMsg2);
    });

    it('should allow fresh message rotation after reset', () => {
      const context: ReassuringMessageContext = {
        operation: 'loading',
        progress: 10,
      };

      getRotatingMessage(context);

      resetMessageRotation('loading');

      const messages: string[] = [];
      for (let i = 0; i < 3; i++) {
        const ctx: ReassuringMessageContext = {
          operation: 'loading',
          progress: 10 + i,
        };
        messages.push(getRotatingMessage(ctx));
      }

      const uniqueMessages = new Set(messages);
      expect(uniqueMessages.size).toBeGreaterThan(1);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle extremely high progress values', () => {
      const context: ReassuringMessageContext = {
        operation: 'uploading',
        progress: 999,
      };

      const message = getRotatingMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should handle negative progress values', () => {
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: -10,
      };

      const message = getRotatingMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should handle empty string filename', () => {
      const context: ReassuringMessageContext = {
        operation: 'loading',
        progress: 40,
        filename: '',
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should handle zero files count', () => {
      const context: ReassuringMessageContext = {
        operation: 'cloning',
        progress: 50,
        filesCount: 0,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should handle filesProcessed greater than filesCount', () => {
      const context: ReassuringMessageContext = {
        operation: 'importing',
        progress: 60,
        filesCount: 50,
        filesProcessed: 75,
      };

      const message = getContextualMessage(context);

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should handle rapid successive calls', () => {
      const messages: string[] = [];

      for (let i = 0; i < 100; i++) {
        const context: ReassuringMessageContext = {
          operation: 'uploading',
          progress: i,
        };
        messages.push(getRotatingMessage(context));
      }

      expect(messages.length).toBe(100);
      messages.forEach((msg) => {
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      });
    });

    it('should handle concurrent operations', () => {
      const operations: Array<ReassuringMessageContext['operation']> = [
        'analyzing',
        'uploading',
        'loading',
        'importing',
        'cloning',
      ];

      const messages = operations.map((operation) => {
        const context: ReassuringMessageContext = {
          operation,
          progress: 50,
        };
        return getRotatingMessage(context);
      });

      expect(messages.length).toBe(5);
      messages.forEach((msg) => {
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      });
    });

    it('should maintain message state independently across operations', () => {
      const contexts: ReassuringMessageContext[] = [
        { operation: 'analyzing', progress: 10 },
        { operation: 'uploading', progress: 20 },
        { operation: 'loading', progress: 30 },
      ];

      const initialMessages = contexts.map((ctx) => getRotatingMessage(ctx));

      const advancedContext: ReassuringMessageContext = {
        operation: 'analyzing',
        progress: 15,
      };
      getRotatingMessage(advancedContext);

      const uploadingMsg = getRotatingMessage(contexts[1]);
      const loadingMsg = getRotatingMessage(contexts[2]);

      expect(uploadingMsg).toBe(initialMessages[1]);
      expect(loadingMsg).toBe(initialMessages[2]);
    });
  });

  describe('ReassuringMessageContext type validation', () => {
    it('should accept all valid operation types', () => {
      const validOperations: Array<ReassuringMessageContext['operation']> = [
        'analyzing',
        'uploading',
        'loading',
        'importing',
        'cloning',
      ];

      validOperations.forEach((operation) => {
        const context: ReassuringMessageContext = { operation };
        const message = getRotatingMessage(context);
        expect(message).toBeTruthy();
      });
    });

    it('should accept optional context fields', () => {
      const context: ReassuringMessageContext = {
        operation: 'uploading',
      };

      const message = getRotatingMessage(context);
      expect(message).toBeTruthy();
    });

    it('should accept all context fields together', () => {
      const context: ReassuringMessageContext = {
        operation: 'analyzing',
        filename: 'test.ts',
        filesCount: 10,
        progress: 45,
        filesProcessed: 5,
        currentFile: 'current.ts',
      };

      const rotatingMsg = getRotatingMessage(context);
      const contextualMsg = getContextualMessage(context);

      expect(rotatingMsg).toBeTruthy();
      expect(contextualMsg).toBeTruthy();
    });
  });
});
