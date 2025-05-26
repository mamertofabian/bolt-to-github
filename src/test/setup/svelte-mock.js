/**
 * Mock for Svelte components in tests
 */

// Generic Svelte component constructor mock
class MockSvelteComponent {
  constructor(options = {}) {
    this.options = options;
    this.$set = function () {};
    this.$on = function () {};
    this.$destroy = function () {};
  }
}

module.exports = MockSvelteComponent;
