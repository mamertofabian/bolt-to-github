// Simple mock implementation that doesn't import from test fixtures
export class MockOperationStateManager {
  private operations = new Map();

  startOperation = jest.fn(
    async (operationId: string, type: string, description: string, metadata?: any) => {
      this.operations.set(operationId, {
        type,
        status: 'started',
        description,
        metadata,
        startTime: Date.now(),
      });
    }
  );

  completeOperation = jest.fn(async (operationId: string) => {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'completed';
    }
  });

  failOperation = jest.fn(async (operationId: string, error: Error) => {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.error = error;
    }
  });

  getOperation(operationId: string) {
    return this.operations.get(operationId);
  }

  getAllOperations() {
    return Array.from(this.operations.entries()).map(([id, operation]) => ({ id, operation }));
  }

  getOperationsByStatus(status: string) {
    return this.getAllOperations().filter(({ operation }) => operation.status === status);
  }

  clear() {
    this.operations.clear();
  }
}

// Create a singleton instance for consistent behavior
let mockInstance = new MockOperationStateManager();

export const OperationStateManager = {
  getInstance: jest.fn(() => mockInstance),
  __resetMockInstance: () => {
    mockInstance = new MockOperationStateManager();
  },
};
