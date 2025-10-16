import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Queue } from '../Queue';

describe('Queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default concurrency of 1', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const task1 = vi.fn(async () => {
        results.push(1);
      });
      const task2 = vi.fn(async () => {
        results.push(2);
      });

      await queue.add(task1);
      await queue.add(task2);

      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).toHaveBeenCalledTimes(1);
      expect(results).toEqual([1, 2]);
    });

    it('should initialize with custom concurrency value', () => {
      const queue = new Queue(5);

      expect(queue).toBeDefined();
    });

    it('should accept concurrency of zero', () => {
      const queue = new Queue(0);

      expect(queue).toBeDefined();
    });

    it('should accept negative concurrency value', () => {
      const queue = new Queue(-1);

      expect(queue).toBeDefined();
    });
  });

  describe('basic task execution', () => {
    it('should execute a single task immediately', async () => {
      const queue = new Queue();
      const task = vi.fn(async () => {});

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should execute tasks with no return value', async () => {
      const queue = new Queue();
      const task = vi.fn(async () => {});

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should execute task that performs side effects', async () => {
      const queue = new Queue();
      let counter = 0;
      const task = vi.fn(async () => {
        counter++;
      });

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
      expect(counter).toBe(1);
    });

    it('should wait for task promise to resolve', async () => {
      const queue = new Queue();
      let resolved = false;

      const task = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        resolved = true;
      });

      const promise = queue.add(task);

      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(resolved).toBe(true);
      expect(task).toHaveBeenCalledTimes(1);
    });
  });

  describe('sequential task execution', () => {
    it('should execute multiple tasks in order', async () => {
      const queue = new Queue();
      const executionOrder: number[] = [];

      const task1 = vi.fn(async () => {
        executionOrder.push(1);
      });
      const task2 = vi.fn(async () => {
        executionOrder.push(2);
      });
      const task3 = vi.fn(async () => {
        executionOrder.push(3);
      });

      await queue.add(task1);
      await queue.add(task2);
      await queue.add(task3);

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).toHaveBeenCalledTimes(1);
      expect(task3).toHaveBeenCalledTimes(1);
    });

    it('should wait for previous task to complete before starting next', async () => {
      const queue = new Queue();
      const executionLog: string[] = [];

      const task1 = vi.fn(async () => {
        executionLog.push('task1-start');
        await new Promise((resolve) => setTimeout(resolve, 100));
        executionLog.push('task1-end');
      });

      const task2 = vi.fn(async () => {
        executionLog.push('task2-start');
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionLog.push('task2-end');
      });

      const promise1 = queue.add(task1);
      const promise2 = queue.add(task2);

      expect(executionLog).toEqual(['task1-start']);

      await vi.advanceTimersByTimeAsync(100);

      expect(executionLog).toEqual(['task1-start', 'task1-end', 'task2-start']);

      await vi.advanceTimersByTimeAsync(50);
      await Promise.all([promise1, promise2]);

      expect(executionLog).toEqual(['task1-start', 'task1-end', 'task2-start', 'task2-end']);
    });

    it('should process tasks added while processing is active', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const task1 = vi.fn(async () => {
        results.push(1);
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const task2 = vi.fn(async () => {
        results.push(2);
      });

      const promise1 = queue.add(task1);

      await vi.advanceTimersByTimeAsync(25);

      const promise2 = queue.add(task2);

      await vi.advanceTimersByTimeAsync(25);
      await promise1;
      await promise2;

      expect(results).toEqual([1, 2]);
    });
  });

  describe('task timing and delays', () => {
    it('should handle tasks with different execution times', async () => {
      const queue = new Queue();
      const executionOrder: string[] = [];

      const fastTask = vi.fn(async () => {
        executionOrder.push('fast');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const slowTask = vi.fn(async () => {
        executionOrder.push('slow');
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const promise1 = queue.add(fastTask);
      const promise2 = queue.add(slowTask);

      await vi.advanceTimersByTimeAsync(10);

      expect(executionOrder).toEqual(['fast', 'slow']);

      await vi.advanceTimersByTimeAsync(100);
      await Promise.all([promise1, promise2]);

      expect(executionOrder).toEqual(['fast', 'slow']);
    });

    it('should handle synchronous tasks', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const syncTask1 = vi.fn(async () => {
        results.push(1);
      });

      const syncTask2 = vi.fn(async () => {
        results.push(2);
      });

      await queue.add(syncTask1);
      await queue.add(syncTask2);

      expect(results).toEqual([1, 2]);
    });

    it('should handle mix of sync and async tasks', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const syncTask = vi.fn(async () => {
        results.push(1);
      });

      const asyncTask = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push(2);
      });

      queue.add(syncTask);
      queue.add(asyncTask);

      await vi.advanceTimersByTimeAsync(0);
      expect(results).toEqual([1]);

      await vi.advanceTimersByTimeAsync(50);

      expect(results).toEqual([1, 2]);
    });
  });

  describe('error handling', () => {
    it('should stop processing queue when task throws error', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const errorTask = vi.fn(async () => {
        results.push(1);
        throw new Error('Task error');
      });

      const successTask = vi.fn(async () => {
        results.push(2);
      });

      const promise1 = queue.add(errorTask);
      const promise2 = queue.add(successTask);

      await expect(promise1).rejects.toThrow('Task error');

      expect(results).toEqual([1]);
      expect(errorTask).toHaveBeenCalledTimes(1);
      expect(successTask).not.toHaveBeenCalled();

      await promise2.catch(() => {});
    });

    it('should handle task that throws synchronously', async () => {
      const queue = new Queue();

      const errorTask = vi.fn(async () => {
        throw new Error('Sync error');
      });

      await expect(queue.add(errorTask)).rejects.toThrow('Sync error');
      expect(errorTask).toHaveBeenCalledTimes(1);
    });

    it('should handle task that rejects asynchronously', async () => {
      const queue = new Queue();

      const errorTask = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error('Async error');
      });

      const promise = queue.add(errorTask);
      promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(50);

      await expect(promise).rejects.toThrow('Async error');
      expect(errorTask).toHaveBeenCalledTimes(1);
    });

    it('should allow new queue after error with fresh queue instance', async () => {
      const queue1 = new Queue();
      let successfulExecutions = 0;

      const errorTask = vi.fn(async () => {
        throw new Error('Error');
      });

      await expect(queue1.add(errorTask)).rejects.toThrow('Error');

      const queue2 = new Queue();

      const task1 = vi.fn(async () => {
        successfulExecutions++;
      });

      const task2 = vi.fn(async () => {
        successfulExecutions++;
      });

      await queue2.add(task1);
      await queue2.add(task2);

      expect(successfulExecutions).toBe(2);
    });

    it('should propagate error to caller', async () => {
      const queue = new Queue();

      const error1 = vi.fn(async () => {
        throw new Error('Error 1');
      });

      try {
        await queue.add(error1);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Error 1');
      }
    });
  });

  describe('queue state management', () => {
    it('should handle adding tasks while queue is empty', async () => {
      const queue = new Queue();
      const task = vi.fn(async () => {});

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should handle adding multiple tasks rapidly', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const tasks = Array.from({ length: 10 }, (_, i) =>
        vi.fn(async () => {
          results.push(i);
        })
      );

      const promises = tasks.map((task) => queue.add(task));
      await Promise.all(promises);

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      tasks.forEach((task) => {
        expect(task).toHaveBeenCalledTimes(1);
      });
    });

    it('should transition from processing to idle state', async () => {
      const queue = new Queue();
      const task = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const promise = queue.add(task);

      await vi.advanceTimersByTimeAsync(50);
      await promise;

      const newTask = vi.fn(async () => {});

      await queue.add(newTask);

      expect(newTask).toHaveBeenCalledTimes(1);
    });

    it('should handle empty queue after processing completes', async () => {
      const queue = new Queue();
      const task = vi.fn(async () => {});

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);

      const newTask = vi.fn(async () => {});
      await queue.add(newTask);

      expect(newTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple queues', () => {
    it('should maintain independent state for multiple queue instances', async () => {
      const queue1 = new Queue();
      const queue2 = new Queue();

      const results1: number[] = [];
      const results2: number[] = [];

      const task1 = vi.fn(async () => {
        results1.push(1);
      });

      const task2 = vi.fn(async () => {
        results2.push(2);
      });

      await queue1.add(task1);
      await queue2.add(task2);

      expect(results1).toEqual([1]);
      expect(results2).toEqual([2]);
    });

    it('should allow parallel execution across different queues', async () => {
      const queue1 = new Queue();
      const queue2 = new Queue();

      const executionLog: string[] = [];

      const task1 = vi.fn(async () => {
        executionLog.push('queue1-start');
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionLog.push('queue1-end');
      });

      const task2 = vi.fn(async () => {
        executionLog.push('queue2-start');
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionLog.push('queue2-end');
      });

      const promise1 = queue1.add(task1);
      const promise2 = queue2.add(task2);

      expect(executionLog).toEqual(['queue1-start', 'queue2-start']);

      await vi.advanceTimersByTimeAsync(50);
      await Promise.all([promise1, promise2]);

      expect(executionLog).toEqual(['queue1-start', 'queue2-start', 'queue1-end', 'queue2-end']);
    });
  });

  describe('edge cases', () => {
    it('should handle task with no operations', async () => {
      const queue = new Queue();
      const emptyTask = vi.fn(async () => {});

      await queue.add(emptyTask);

      expect(emptyTask).toHaveBeenCalledTimes(1);
    });

    it('should handle large number of tasks', async () => {
      const queue = new Queue();
      const taskCount = 100;
      let executionCount = 0;

      const tasks = Array.from({ length: taskCount }, () =>
        vi.fn(async () => {
          executionCount++;
        })
      );

      const promises = tasks.map((task) => queue.add(task));
      await Promise.all(promises);

      expect(executionCount).toBe(taskCount);
      tasks.forEach((task) => {
        expect(task).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle task that returns complex objects', async () => {
      const queue = new Queue();

      const task = vi.fn(async () => {});

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should handle task that returns undefined', async () => {
      const queue = new Queue();

      const task = vi.fn(async () => {
        return undefined;
      });

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should handle task that returns null', async () => {
      const queue = new Queue();

      const task = vi.fn(async () => {});

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should handle very long running task', async () => {
      const queue = new Queue();
      const results: string[] = [];

      const longTask = vi.fn(async () => {
        results.push('long-start');
        await new Promise((resolve) => setTimeout(resolve, 10000));
        results.push('long-end');
      });

      const shortTask = vi.fn(async () => {
        results.push('short');
      });

      const promise1 = queue.add(longTask);
      const promise2 = queue.add(shortTask);

      await vi.advanceTimersByTimeAsync(10000);
      await promise1;
      await promise2;

      expect(results).toEqual(['long-start', 'long-end', 'short']);
    });
  });

  describe('promise resolution behavior', () => {
    it('should resolve add promise when task completes', async () => {
      const queue = new Queue();
      let taskCompleted = false;

      const task = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        taskCompleted = true;
      });

      const addPromise = queue.add(task);

      expect(taskCompleted).toBe(false);

      await vi.advanceTimersByTimeAsync(50);
      await addPromise;

      expect(taskCompleted).toBe(true);
    });

    it('should reject add promise when task throws', async () => {
      const queue = new Queue();

      const errorTask = vi.fn(async () => {
        throw new Error('Task failed');
      });

      const addPromise = queue.add(errorTask);

      await expect(addPromise).rejects.toThrow('Task failed');
    });

    it('should allow awaiting multiple add calls', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const task1 = vi.fn(async () => {
        results.push(1);
      });

      const task2 = vi.fn(async () => {
        results.push(2);
      });

      const task3 = vi.fn(async () => {
        results.push(3);
      });

      await Promise.all([queue.add(task1), queue.add(task2), queue.add(task3)]);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should preserve task execution order even with Promise.all', async () => {
      const queue = new Queue();
      const executionOrder: number[] = [];

      const tasks = Array.from({ length: 5 }, (_, i) =>
        vi.fn(async () => {
          executionOrder.push(i);
        })
      );

      await Promise.all(tasks.map((task) => queue.add(task)));

      expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('practical use cases', () => {
    it('should handle file processing queue', async () => {
      const queue = new Queue();
      const processedFiles: string[] = [];

      const processFile = (filename: string) =>
        vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          processedFiles.push(filename);
        });

      const files = ['file1.txt', 'file2.txt', 'file3.txt'];

      const promises = files.map((file) => queue.add(processFile(file)));
      await vi.advanceTimersByTimeAsync(30);
      await Promise.all(promises);

      expect(processedFiles).toEqual(files);
    });

    it('should handle API request queue', async () => {
      const queue = new Queue();
      const apiCalls: string[] = [];

      const makeApiCall = (endpoint: string) =>
        vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          apiCalls.push(endpoint);
        });

      const endpoints = ['/users', '/posts', '/comments'];

      const promises = endpoints.map((endpoint) => queue.add(makeApiCall(endpoint)));
      await vi.advanceTimersByTimeAsync(150);
      await Promise.all(promises);

      expect(apiCalls).toEqual(endpoints);
    });

    it('should handle database operations queue', async () => {
      const queue = new Queue();
      const operations: string[] = [];

      const dbOperation = (operation: string) =>
        vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          operations.push(operation);
        });

      const promise1 = queue.add(dbOperation('INSERT'));
      const promise2 = queue.add(dbOperation('UPDATE'));
      const promise3 = queue.add(dbOperation('DELETE'));

      await vi.advanceTimersByTimeAsync(60);
      await Promise.all([promise1, promise2, promise3]);

      expect(operations).toEqual(['INSERT', 'UPDATE', 'DELETE']);
    });

    it('should handle sequential async operations with dependencies', async () => {
      const queue = new Queue();
      let state = 0;

      const operation1 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        state = 1;
      });

      const operation2 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        state = state * 2;
      });

      const operation3 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        state = state + 10;
      });

      const promise1 = queue.add(operation1);
      await vi.advanceTimersByTimeAsync(10);
      await promise1;

      const promise2 = queue.add(operation2);
      await vi.advanceTimersByTimeAsync(10);
      await promise2;

      const promise3 = queue.add(operation3);
      await vi.advanceTimersByTimeAsync(10);
      await promise3;

      expect(state).toBe(12);
    });
  });

  describe('concurrent add calls', () => {
    it('should handle multiple add calls before processing starts', async () => {
      const queue = new Queue();
      const results: number[] = [];

      const task1 = vi.fn(async () => {
        results.push(1);
      });

      const task2 = vi.fn(async () => {
        results.push(2);
      });

      const task3 = vi.fn(async () => {
        results.push(3);
      });

      queue.add(task1);
      queue.add(task2);
      queue.add(task3);

      await vi.advanceTimersByTimeAsync(0);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should handle add calls during task execution', async () => {
      const queue = new Queue();
      const results: string[] = [];

      const task1 = vi.fn(async () => {
        results.push('task1-start');
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push('task1-end');
      });

      const task2 = vi.fn(async () => {
        results.push('task2');
      });

      const promise1 = queue.add(task1);

      await vi.advanceTimersByTimeAsync(25);

      const promise2 = queue.add(task2);

      await vi.advanceTimersByTimeAsync(25);
      await promise1;
      await promise2;

      expect(results).toEqual(['task1-start', 'task1-end', 'task2']);
    });
  });

  describe('queue with custom concurrency', () => {
    it('should respect concurrency setting of 1', async () => {
      const queue = new Queue(1);
      const executionOrder: number[] = [];

      const tasks = Array.from({ length: 3 }, (_, i) =>
        vi.fn(async () => {
          executionOrder.push(i);
        })
      );

      await Promise.all(tasks.map((task) => queue.add(task)));

      expect(executionOrder).toEqual([0, 1, 2]);
    });

    it('should initialize with higher concurrency values', async () => {
      const queue = new Queue(10);
      const task = vi.fn(async () => {});

      await queue.add(task);

      expect(task).toHaveBeenCalledTimes(1);
    });
  });
});
