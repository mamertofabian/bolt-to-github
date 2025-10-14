/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';

// Create a reusable Svelte component mock class that properly implements Svelte 4 interface
export class MockSvelteComponent {
  constructor(options: any = {}) {
    this.options = options;
    this.$set = vi.fn();
    this.$on = vi.fn(() => ({ destroy: vi.fn() })); // Return unsubscribe function
    this.$destroy = vi.fn();
    this.$$host = null;

    // Mock Svelte component lifecycle and internal methods with proper parent_component support
    this.$$ = {
      fragment: null,
      ctx: [],
      props: options.props || {},
      update: vi.fn(),
      not_equal: vi.fn(),
      bound: {},
      on_mount: [],
      on_destroy: [],
      on_disconnect: [],
      before_update: [],
      after_update: [],
      context: new Map(
        options.context || (options.parent_component ? options.parent_component.$$.context : [])
      ),
      callbacks: {},
      dirty: vi.fn(),
      skip_bound: false,
    };

    this.$$callbacks = {};
    this.$$invalidate = vi.fn();
    this.$$self = this;
    this.$$props = options.props || {};
    this.$$bound = {};

    // Create a DOM element to serve as the component
    if (typeof document !== 'undefined') {
      this.$$host = document.createElement('div');
      if (options.target) {
        options.target.appendChild(this.$$host);
      }
    }
  }

  options: any;
  $set: any;
  $on: any;
  $destroy: any;
  $$host: any;
  $$: any;
  $$callbacks: any;
  $$invalidate: any;
  $$self: any;
  $$props: any;
  $$bound: any;
}

// Auto-mock all Svelte files
vi.mock('$lib/components/ui/dialog/ConfirmationDialog.svelte', () => ({
  default: MockSvelteComponent,
}));

// Don't mock EnhancedConfirmationDialog - we want to test the real component
// vi.mock('$lib/components/ui/dialog/EnhancedConfirmationDialog.svelte', () => ({
//   default: MockSvelteComponent,
// }));

// Don't mock Button for LogViewer tests - it needs the real component
// Individual tests that need mocks should do it in their test file
// vi.mock('$lib/components/ui/button/index.ts', () => ({
//   Button: MockSvelteComponent,
//   Root: MockSvelteComponent,
//   buttonVariants: vi.fn(),
// }));

// vi.mock('$lib/components/ui/button/button.svelte', () => ({
//   default: MockSvelteComponent,
// }));

vi.mock('$lib/components/ui/alert/alert.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('$lib/components/ui/alert/alert-description.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('$lib/components/ui/alert/alert-title.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('$lib/components/ui/alert/index.ts', () => ({
  Alert: MockSvelteComponent,
  AlertDescription: MockSvelteComponent,
  AlertTitle: MockSvelteComponent,
  alertVariants: vi.fn(() => 'mocked-alert-class'),
}));

// Don't mock bits-ui for LogViewer tests - it needs the real components
// Individual tests that need mocks should do it in their test file
// vi.mock('bits-ui', () => ({
//   Button: {
//     Root: class MockButton {
//       $$host: any;
//       $set: any;
//       $on: any;
//       $destroy: any;

//       constructor(options: any = {}) {
//         this.$$host = document.createElement('button');
//         this.$set = vi.fn();
//         this.$on = vi.fn(() => ({ destroy: vi.fn() }));
//         this.$destroy = vi.fn();

//         if (options.target) {
//           options.target.appendChild(this.$$host);
//         }
//       }
//     },
//   },
//   Label: {
//     Root: class MockLabel {
//       $$host: any;
//       $set: any;
//       $on: any;
//       $destroy: any;

//       constructor(options: any = {}) {
//         this.$$host = document.createElement('label');
//         this.$set = vi.fn();
//         this.$on = vi.fn(() => ({ destroy: vi.fn() }));
//         this.$destroy = vi.fn();

//         if (options.target) {
//           options.target.appendChild(this.$$host);
//         }
//       }
//     },
//   },
// }));

// Mock content Svelte components
vi.mock('../../content/Notification.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('../../content/UploadStatus.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('$lib/components/ui/modal/Modal.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('$lib/utils', () => ({
  cn: vi.fn((...args) => args.join(' ')),
  flyAndScale: vi.fn(),
}));

vi.mock('tailwind-variants', () => ({
  tv: vi.fn(() => {
    // Return a function that generates realistic button classes based on props
    return (props: any) => {
      const { variant = 'default', size = 'default', className = '' } = props || {};

      // Generate realistic button classes based on variant and size
      let classes =
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

      // Add variant classes
      switch (variant) {
        case 'default':
          classes += ' bg-primary text-primary-foreground hover:bg-primary/90';
          break;
        case 'destructive':
          classes += ' bg-destructive text-destructive-foreground hover:bg-destructive/90';
          break;
        case 'outline':
          classes +=
            ' border-input bg-background hover:bg-accent hover:text-accent-foreground border';
          break;
        case 'secondary':
          classes += ' bg-secondary text-secondary-foreground hover:bg-secondary/80';
          break;
        case 'ghost':
          classes += ' hover:bg-accent hover:text-accent-foreground';
          break;
        case 'link':
          classes += ' text-primary underline-offset-4 hover:underline';
          break;
      }

      // Add size classes
      switch (size) {
        case 'default':
          classes += ' h-10 px-4 py-2';
          break;
        case 'sm':
          classes += ' h-9 rounded-md px-3';
          break;
        case 'lg':
          classes += ' h-11 rounded-md px-8';
          break;
        case 'icon':
          classes += ' h-10 w-10';
          break;
      }

      // Add any additional className
      if (className) {
        classes += ` ${className}`;
      }

      return classes;
    };
  }),
}));

vi.mock('clsx', () => ({
  clsx: vi.fn((...args) => args.join(' ')),
}));

vi.mock('tailwind-merge', () => ({
  twMerge: vi.fn((str) => str),
}));

vi.mock('lucide-svelte', () => ({
  AlertTriangle: MockSvelteComponent,
  Info: MockSvelteComponent,
  Check: MockSvelteComponent,
  X: MockSvelteComponent,
  AlertCircle: MockSvelteComponent,
  Loader2: MockSvelteComponent,
  ChevronRight: MockSvelteComponent,
  ChevronDown: MockSvelteComponent,
  ChevronUp: MockSvelteComponent,
  Settings: MockSvelteComponent,
  Github: MockSvelteComponent,
  GitBranch: MockSvelteComponent,
  FolderGit2: MockSvelteComponent,
  Upload: MockSvelteComponent,
  Download: MockSvelteComponent,
  FileIcon: MockSvelteComponent,
  Package: MockSvelteComponent,
  PackageCheck: MockSvelteComponent,
  ExternalLink: MockSvelteComponent,
  Eye: MockSvelteComponent,
  EyeOff: MockSvelteComponent,
  Copy: MockSvelteComponent,
  Key: MockSvelteComponent,
  Lock: MockSvelteComponent,
  Unlock: MockSvelteComponent,
  Shield: MockSvelteComponent,
  ShieldCheck: MockSvelteComponent,
  ShieldAlert: MockSvelteComponent,
  RefreshCw: MockSvelteComponent,
  RotateCw: MockSvelteComponent,
  Trash2: MockSvelteComponent,
  Plus: MockSvelteComponent,
  Minus: MockSvelteComponent,
  Edit: MockSvelteComponent,
  Save: MockSvelteComponent,
  FileText: MockSvelteComponent,
  FileCode: MockSvelteComponent,
  FileJson: MockSvelteComponent,
  Code: MockSvelteComponent,
  Terminal: MockSvelteComponent,
  Bug: MockSvelteComponent,
  Zap: MockSvelteComponent,
  Clock: MockSvelteComponent,
  Calendar: MockSvelteComponent,
  CheckCircle: MockSvelteComponent,
  XCircle: MockSvelteComponent,
  AlertTriangleIcon: MockSvelteComponent,
  InfoIcon: MockSvelteComponent,
  HelpCircle: MockSvelteComponent,
  Star: MockSvelteComponent,
  Heart: MockSvelteComponent,
  Bookmark: MockSvelteComponent,
  User: MockSvelteComponent,
  Users: MockSvelteComponent,
  LogIn: MockSvelteComponent,
  LogOut: MockSvelteComponent,
  Search: MockSvelteComponent,
  Filter: MockSvelteComponent,
  MoreVertical: MockSvelteComponent,
  MoreHorizontal: MockSvelteComponent,
  Menu: MockSvelteComponent,
  Home: MockSvelteComponent,
  ArrowLeft: MockSvelteComponent,
  ArrowRight: MockSvelteComponent,
  ArrowUp: MockSvelteComponent,
  ArrowDown: MockSvelteComponent,
  MessageSquare: MockSvelteComponent,
  Send: MockSvelteComponent,
  Mail: MockSvelteComponent,
  Import: MockSvelteComponent,
  GithubIcon: MockSvelteComponent,
  YoutubeIcon: MockSvelteComponent,
  Coffee: MockSvelteComponent,
  Sparkles: MockSvelteComponent,
}));
