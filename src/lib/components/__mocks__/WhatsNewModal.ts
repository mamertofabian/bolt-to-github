export default jest.fn().mockImplementation(function (this: any, options: any) {
  this.target = options.target;
  this.props = options.props;
  this.$destroy = jest.fn();
  this.$set = jest.fn();
  return this;
});
