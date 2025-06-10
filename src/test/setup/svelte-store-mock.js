/**
 * Mock for Svelte store functions in tests
 */

// Simple writable store implementation for testing
function writable(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  return {
    subscribe(callback) {
      subscribers.add(callback);
      callback(value);
      return () => subscribers.delete(callback);
    },
    set(newValue) {
      value = newValue;
      subscribers.forEach((callback) => callback(value));
    },
    update(updater) {
      value = updater(value);
      subscribers.forEach((callback) => callback(value));
    },
  };
}

// Simple derived store implementation for testing
function derived(stores, fn) {
  const initialValue = fn(Array.isArray(stores) ? stores.map((s) => get(s)) : get(stores));
  return writable(initialValue);
}

// Get current value from store
function get(store) {
  let value;
  store.subscribe((v) => (value = v))();
  return value;
}

module.exports = {
  writable,
  derived,
  get,
};
