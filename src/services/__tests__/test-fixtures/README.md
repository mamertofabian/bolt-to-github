# Service test fixtures

The fixture modules under this directory model the supported GitHub App integration.

- `GitHubAppService*` provides Edge Function, storage, expiry, and OAuth fixtures.
- `unified/api-responses` contains representative GitHub REST payloads.
- `unified/mocks/MockAuthStrategies.ts` provides the configurable
  `MockGitHubAppAuthenticationStrategy` fake.
- `unified/mocks/MockFetchBuilder.ts` and `MockChromeStorage.ts` provide network and
  extension-storage test doubles.
- `unified/scenarios` combines the GitHub App strategy, Bolt2GitHub session, storage, and
  GitHub API responses for higher-level tests.
- `unified/tokens` contains only visibly fake GitHub App installation and OAuth values with
  the `TEST_` prefix.

Example:

```ts
import {
  MockGitHubAppAuthenticationStrategy,
  UnifiedGitHubServiceTestHelpers,
} from './test-fixtures';

const strategy = new MockGitHubAppAuthenticationStrategy('TEST_bolt2github-session');
const config = UnifiedGitHubServiceTestHelpers.createAuthConfig();
```

Never add real credentials. Test values must remain visibly fake and use the fixture safety
helpers where token-shaped data is required.
