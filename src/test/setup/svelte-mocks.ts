/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';

// Create a reusable Svelte component mock class
export class MockSvelteComponent {
  constructor(options: any = {}) {
    this.options = options;
    this.$set = vi.fn();
    this.$on = vi.fn();
    this.$destroy = vi.fn();
  }
  options: any;
  $set: any;
  $on: any;
  $destroy: any;
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
}));
