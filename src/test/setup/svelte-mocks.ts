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

    // Mock Svelte component lifecycle and internal methods
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

vi.mock('$lib/components/ui/dialog/EnhancedConfirmationDialog.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('$lib/components/ui/button/index.ts', () => ({
  Button: MockSvelteComponent,
  Root: MockSvelteComponent,
  buttonVariants: vi.fn(),
}));

vi.mock('$lib/components/ui/button/button.svelte', () => ({
  default: MockSvelteComponent,
}));

vi.mock('bits-ui', () => ({
  Button: {
    Root: class MockButton {
      $$host: any;
      $set: any;
      $on: any;
      $destroy: any;

      constructor(options: any = {}) {
        this.$$host = document.createElement('button');
        this.$set = vi.fn();
        this.$on = vi.fn(() => ({ destroy: vi.fn() }));
        this.$destroy = vi.fn();

        if (options.target) {
          options.target.appendChild(this.$$host);
        }
      }
    },
  },
}));

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
  tv: vi.fn(() => vi.fn(() => 'mocked-class')),
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
}));
