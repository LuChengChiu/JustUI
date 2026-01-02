/**
 * Toast Notification System - Non-blocking User Feedback
 *
 * Provides elegant, non-intrusive toast notifications for blocked navigations
 * with XSS-safe DOM manipulation and modern purple-themed design.
 *
 * @module ToastNotification
 */

/**
 * Show a toast notification for blocked navigation attempts
 *
 * @param {string} url - Blocked URL (will be sanitized)
 * @param {string} reason - Block reason (will be sanitized)
 * @param {Object} options - Optional configuration
 * @param {number} options.duration - Auto-dismiss duration in ms (default: 3000)
 * @param {boolean} options.clickToDismiss - Allow click to dismiss (default: true)
 */
export function showBlockedToast(url, reason, options = {}) {
  const {
    duration = 3000,
    clickToDismiss = true
  } = options;

  // Truncate URL for display (prevent layout issues with long URLs)
  const truncatedURL = url && url.length > 50 ? url.substring(0, 50) + '...' : url;

  // Create toast container
  const toast = document.createElement('div');
  toast.className = 'originalui-blocked-toast';

  // Build toast structure (XSS-safe - no innerHTML)
  const container = createContainer();
  const logo = createLogo();
  const content = createContent(reason, truncatedURL);

  container.appendChild(logo);
  container.appendChild(content);
  toast.appendChild(container);

  // Apply styles
  applyToastStyles(toast);

  // Add click to dismiss
  if (clickToDismiss) {
    toast.addEventListener('click', () => {
      dismissToast(toast);
    });
  }

  // Add to DOM
  document.body.appendChild(toast);

  // Fade in with slide up animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Auto-dismiss after specified duration
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(toast);
    }, duration);
  }

  return toast;
}

/**
 * Create the main container with flex layout
 * @private
 */
function createContainer() {
  const container = document.createElement('div');
  Object.assign(container.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px'
  });
  return container;
}

/**
 * Create the "IUI" logo element with purple gradient
 * @private
 */
function createLogo() {
  const logo = document.createElement('div');
  logo.textContent = 'IUI'; // XSS-safe

  Object.assign(logo.style, {
    fontSize: '28px',
    fontWeight: '900',
    background: 'linear-gradient(135deg, #a78bfa 0%, #c4b5fd 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '-0.5px',
    lineHeight: '1',
    flexShrink: '0',
    paddingTop: '2px'
  });

  return logo;
}

/**
 * Create the content section with title and reason
 * @private
 */
function createContent(reason, url) {
  const content = document.createElement('div');
  content.style.flex = '1';

  // Title
  const title = document.createElement('div');
  title.style.fontWeight = '700';
  title.style.fontSize = '16px';
  title.style.marginBottom = '4px';
  title.style.letterSpacing = '-0.3px';
  title.textContent = 'Navigation Block'; // XSS-safe

  // Reason
  const reasonDiv = document.createElement('div');
  reasonDiv.style.fontSize = '13px';
  reasonDiv.style.opacity = '0.95';
  reasonDiv.style.lineHeight = '1.4';
  reasonDiv.style.color = '#f5f3ff';
  reasonDiv.textContent = reason || 'Blocked for security'; // XSS-safe

  // Optional: URL display (can be commented out if not needed)
  if (url) {
    const urlDiv = document.createElement('div');
    urlDiv.style.fontSize = '11px';
    urlDiv.style.opacity = '0.7';
    urlDiv.style.marginTop = '4px';
    urlDiv.style.color = '#e9d5ff';
    urlDiv.style.fontFamily = 'monospace';
    urlDiv.textContent = url; // XSS-safe - auto-escapes HTML/JS

    content.appendChild(title);
    content.appendChild(reasonDiv);
    content.appendChild(urlDiv);
  } else {
    content.appendChild(title);
    content.appendChild(reasonDiv);
  }

  return content;
}

/**
 * Apply comprehensive styles to toast element
 * @private
 */
function applyToastStyles(toast) {
  Object.assign(toast.style, {
    // Positioning
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '2147483647', // Max z-index for overlays

    // Box model
    padding: '16px 20px',
    maxWidth: '380px',
    minWidth: '280px',

    // Visual design - Purple gradient matching mockup
    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
    color: 'white',
    borderRadius: '16px',
    boxShadow: `
      0 0 0 1px rgba(139, 92, 246, 0.1),
      0 8px 24px rgba(124, 58, 237, 0.4),
      0 16px 48px rgba(109, 40, 217, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.2)
    `,

    // Typography
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

    // Animations
    opacity: '0',
    transform: 'translateY(10px)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

    // Interaction
    pointerEvents: 'auto',
    cursor: 'pointer',
    userSelect: 'none',

    // Backdrop for better readability
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)'
  });
}

/**
 * Dismiss toast with smooth fade-out animation
 * @param {HTMLElement} toast - Toast element to dismiss
 */
export function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;

  // Fade out
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(10px)';

  // Remove from DOM after animation completes
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 300);
}

/**
 * Create a custom toast with flexible options
 * For advanced use cases beyond blocked navigation
 *
 * @param {Object} config - Toast configuration
 * @param {string} config.title - Toast title
 * @param {string} config.message - Toast message
 * @param {string} config.logo - Logo text (default: "IUI")
 * @param {string} config.gradient - CSS gradient (default: purple gradient)
 * @param {number} config.duration - Auto-dismiss duration
 * @returns {HTMLElement} Toast element
 */
export function createCustomToast(config) {
  const {
    title = 'Notification',
    message = '',
    logo = 'IUI',
    gradient = 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
    duration = 3000
  } = config;

  const toast = document.createElement('div');
  const container = createContainer();

  // Custom logo
  const logoEl = document.createElement('div');
  logoEl.textContent = logo;
  Object.assign(logoEl.style, {
    fontSize: '28px',
    fontWeight: '900',
    background: 'linear-gradient(135deg, #a78bfa 0%, #c4b5fd 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '-0.5px',
    lineHeight: '1',
    flexShrink: '0',
    paddingTop: '2px'
  });

  // Custom content
  const content = document.createElement('div');
  content.style.flex = '1';

  const titleEl = document.createElement('div');
  titleEl.style.fontWeight = '700';
  titleEl.style.fontSize = '16px';
  titleEl.style.marginBottom = '4px';
  titleEl.textContent = title;

  const messageEl = document.createElement('div');
  messageEl.style.fontSize = '13px';
  messageEl.style.opacity = '0.95';
  messageEl.textContent = message;

  content.appendChild(titleEl);
  content.appendChild(messageEl);
  container.appendChild(logoEl);
  container.appendChild(content);
  toast.appendChild(container);

  applyToastStyles(toast);
  toast.style.background = gradient; // Custom gradient

  toast.addEventListener('click', () => dismissToast(toast));

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }

  return toast;
}
