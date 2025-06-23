import type { ButtonOptions, DropdownItem, DialogOptions } from '../types/UITypes';

/**
 * Configuration for creating containers
 */
export interface ContainerConfig {
  id: string;
  className?: string | string[];
  styles?: Record<string, string>;
  innerHTML?: string;
  appendTo?: HTMLElement;
}

/**
 * Configuration for creating overlays
 */
export interface OverlayConfig {
  className?: string | string[];
  styles?: Record<string, string>;
  zIndex?: string;
  backgroundColor?: string;
}

/**
 * UIElementFactory provides factory methods for creating UI elements
 * Ensures consistent styling and behavior across the application
 */
export class UIElementFactory {
  /**
   * Create a button element with consistent styling
   */
  public static createButton(options: ButtonOptions): HTMLButtonElement {
    const button = document.createElement('button');

    button.textContent = options.text;

    if (options.className) {
      button.className = options.className;
    }

    if (options.disabled) {
      button.disabled = options.disabled;
    }

    if (options.ariaLabel) {
      button.setAttribute('aria-label', options.ariaLabel);
    }

    if (options.testId) {
      button.setAttribute('data-testid', options.testId);
    }

    return button;
  }

  /**
   * Create a GitHub-style button with consistent styling
   */
  public static createGitHubButton(
    options: Partial<ButtonOptions> & { innerHTML?: string }
  ): HTMLButtonElement {
    const button = document.createElement('button');

    // Set default GitHub button classes
    button.className = [
      'rounded-md',
      'items-center',
      'justify-center',
      'outline-accent-600',
      'px-3',
      'py-1.25',
      'disabled:cursor-not-allowed',
      'text-xs',
      'bg-bolt-elements-button-secondary-background',
      'text-bolt-elements-button-secondary-text',
      'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover',
      'flex',
      'gap-1.7',
      'transition-opacity',
      ...(options.className ? [options.className] : []),
    ].join(' ');

    if (options.innerHTML) {
      button.innerHTML = options.innerHTML;
    } else if (options.text) {
      button.textContent = options.text;
    }

    if (options.disabled) {
      button.disabled = options.disabled;
    }

    if (options.ariaLabel) {
      button.setAttribute('aria-label', options.ariaLabel);
    }

    if (options.testId) {
      button.setAttribute('data-testid', options.testId);
    }

    return button;
  }

  /**
   * Create dropdown content element
   */
  public static createDropdownContent(items: DropdownItem[], id?: string): HTMLElement {
    const dropdownContent = document.createElement('div');

    if (id) {
      dropdownContent.id = id;
    }

    dropdownContent.setAttribute('role', 'menu');
    dropdownContent.className = [
      'rounded-md',
      'shadow-lg',
      'overflow-hidden',
      'min-w-[180px]',
      'animate-fadeIn',
    ].join(' ');

    // Create dropdown items
    items.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'dropdown-item flex items-center';
      button.innerHTML = `
        ${item.icon || ''}
        <span>${item.label}</span>
      `;

      if (item.disabled) {
        button.disabled = true;
      }

      button.addEventListener('click', async () => {
        if (!item.disabled && item.action) {
          await item.action();
        }
      });

      dropdownContent.appendChild(button);
    });

    return dropdownContent;
  }

  /**
   * Create a dialog element
   */
  public static createDialog(options: DialogOptions): HTMLElement {
    const dialog = document.createElement('div');

    dialog.style.zIndex = '10000';
    dialog.style.width = '320px';
    dialog.style.backgroundColor = '#0f172a'; // Match bg-slate-900
    dialog.className = [
      'p-6',
      'rounded-lg',
      'shadow-xl',
      'mx-4',
      'space-y-4',
      'border',
      'border-slate-700',
      'relative',
    ].join(' ');

    let dialogContent = `<h3 class="text-lg font-semibold text-white">${options.title}</h3>`;

    if (typeof options.content === 'string') {
      dialogContent += `<p class="text-slate-300 text-sm">${options.content}</p>`;
    }

    if (options.actions) {
      dialogContent += '<div class="flex justify-end gap-3 mt-6">';

      if (options.actions.secondary) {
        dialogContent += `
          <button class="px-4 py-2 text-sm rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700" data-action="secondary">
            ${options.actions.secondary.text}
          </button>
        `;
      }

      if (options.actions.primary) {
        dialogContent += `
          <button class="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700" data-action="primary">
            ${options.actions.primary.text}
          </button>
        `;
      }

      dialogContent += '</div>';
    }

    dialog.innerHTML = dialogContent;

    // If content is an HTMLElement, append it
    if (typeof options.content !== 'string') {
      const contentContainer = dialog.querySelector('p') || dialog;
      contentContainer.appendChild(options.content);
    }

    return dialog;
  }

  /**
   * Create an overlay element
   */
  public static createOverlay(config: OverlayConfig = {}): HTMLElement {
    const overlay = document.createElement('div');

    overlay.style.zIndex = config.zIndex || '9999';
    overlay.style.backgroundColor = config.backgroundColor || 'rgba(0, 0, 0, 0.5)';

    const defaultClasses = ['fixed', 'inset-0', 'flex', 'items-center', 'justify-center'];
    const className = config.className;

    if (Array.isArray(className)) {
      overlay.className = [...defaultClasses, ...className].join(' ');
    } else if (typeof className === 'string') {
      overlay.className = [...defaultClasses, className].join(' ');
    } else {
      overlay.className = defaultClasses.join(' ');
    }

    if (config.styles) {
      Object.assign(overlay.style, config.styles);
    }

    return overlay;
  }

  /**
   * Create a container element
   */
  public static createContainer(config: ContainerConfig): HTMLElement {
    const container = document.createElement('div');

    container.id = config.id;

    if (config.className) {
      if (Array.isArray(config.className)) {
        container.className = config.className.join(' ');
      } else {
        container.className = config.className;
      }
    }

    if (config.styles) {
      Object.assign(container.style, config.styles);
    }

    if (config.innerHTML) {
      container.innerHTML = config.innerHTML;
    }

    if (config.appendTo) {
      config.appendTo.appendChild(container);
    }

    return container;
  }

  /**
   * Create a notification element
   */
  public static createNotification(
    message: string,
    type: 'info' | 'error' | 'success' = 'info'
  ): HTMLElement {
    const notification = document.createElement('div');

    const typeClasses = {
      info: 'bg-blue-500',
      error: 'bg-red-500',
      success: 'bg-green-500',
    };

    notification.style.zIndex = '10000';
    notification.className = [
      'fixed',
      'top-4',
      'right-4',
      'p-4',
      typeClasses[type],
      'text-white',
      'rounded-md',
      'shadow-lg',
      'flex',
      'items-center',
      'gap-2',
      'text-sm',
    ].join(' ');

    const iconSvg =
      type === 'error'
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
           <circle cx="12" cy="12" r="10"></circle>
           <line x1="12" y1="8" x2="12" y2="12"></line>
           <line x1="12" y1="16" x2="12.01" y2="16"></line>
         </svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
           <circle cx="12" cy="12" r="10"></circle>
           <path d="m9 12 2 2 4-4"></path>
         </svg>`;

    notification.innerHTML = `
      ${iconSvg}
      <span>${message}</span>
    `;

    return notification;
  }

  /**
   * Create a style element with CSS rules
   */
  public static createStyleElement(id: string, css: string): HTMLStyleElement {
    // Check if styles already exist
    const existing = document.getElementById(id);
    if (existing) {
      return existing as HTMLStyleElement;
    }

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;

    return style;
  }

  /**
   * Utility method to join CSS classes
   */
  public static joinClasses(...classes: (string | string[] | undefined)[]): string {
    return classes.filter(Boolean).flat().join(' ');
  }
}
