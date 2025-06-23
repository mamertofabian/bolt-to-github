interface SvelteComponentOptions {
  target: Element;
  props?: Record<string, unknown>;
}

interface MockSvelteComponent {
  target: Element;
  props?: Record<string, unknown>;
  $destroy: jest.Mock;
  $set: jest.Mock;
}

export default jest.fn().mockImplementation(function (
  this: MockSvelteComponent,
  options: SvelteComponentOptions
) {
  this.target = options.target;
  this.props = options.props;
  this.$destroy = jest.fn();
  this.$set = jest.fn();
  return this;
});
