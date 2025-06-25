/**
 * Mock for Svelte components in tests
 */

// Generic Svelte component constructor mock
export default class MockSvelteComponent {
  constructor(options = {}) {
    this.options = options;
    this.$set = function () {};
    this.$on = function () {};
    this.$destroy = function () {};
  }
}
