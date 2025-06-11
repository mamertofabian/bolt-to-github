// Simple mock implementation that doesn't import from test fixtures
class MockOperationStateManager {
  private operations = new Map();

  static getInstance = jest.fn(() => new MockOperationStateManager());

  startOperation = jest.fn(async () => {});
  completeOperation = jest.fn(async () => {});
  failOperation = jest.fn(async () => {});

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
const mockInstance = new MockOperationStateManager();

export const OperationStateManager = {
  getInstance: jest.fn(() => mockInstance),
};
