import { toast as sonnerToast, ExternalToast } from "sonner";

/**
 * Custom toast utilities with brand styling consistent with Alert components
 * Colors and styling match the existing design system
 */

// Default toast options with brand styling
const defaultOptions: ExternalToast = {
  duration: 4000,
  closeButton: true,
  style: {
    background: 'rgba(246,243,238,1)',
    border: '1px solid rgba(22,21,20,0.12)',
    color: 'rgba(22,21,20,1)',
  },
};

// Success toast with accent colors (matching text-accent)
export const success = (message: string, options?: ExternalToast) => {
  return sonnerToast.success(message, {
    ...defaultOptions,
    duration: 4000,
    style: {
      background: 'rgba(246,243,238,1)',
      border: '1px solid rgba(217,72,31,0.3)',
      color: 'rgba(217,72,31,1)',
      ...options?.style,
    },
    ...options,
  });
};

// Error toast with destructive colors (matching text-destructive)
export const error = (message: string, options?: ExternalToast) => {
  return sonnerToast.error(message, {
    ...defaultOptions,
    duration: 6000, // Longer for errors
    style: {
      background: 'rgba(246,243,238,1)',
      border: '1px solid rgba(194,54,28,0.5)',
      color: 'rgba(194,54,28,1)',
      ...options?.style,
    },
    ...options,
  });
};

// Warning toast (amber)
export const warning = (message: string, options?: ExternalToast) => {
  return sonnerToast.warning(message, {
    ...defaultOptions,
    duration: 5000,
    style: {
      background: 'rgba(246,243,238,1)',
      border: '1px solid rgba(217,119,6,0.3)',
      color: 'rgb(146 64 14)',
      ...options?.style,
    },
    ...options,
  });
};

// Info toast with default colors
export const info = (message: string, options?: ExternalToast) => {
  return sonnerToast.info(message, {
    ...defaultOptions,
    duration: 3000,
    ...options,
  });
};

// Loading toast for async operations
export const loading = (message: string, options?: ExternalToast) => {
  return sonnerToast.loading(message, {
    ...defaultOptions,
    duration: Infinity, // Manual dismiss
    ...options,
  });
};

// Promise toast for handling async operations
export const promise = <T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((result: T) => string);
    error: string | ((error: any) => string);
  },
  options?: ExternalToast
) => {
  return sonnerToast.promise(promise, {
    ...defaultOptions,
    ...options,
    loading: messages.loading,
    success: messages.success,
    error: messages.error,
  });
};

// Configuration error toast (persistent until dismissed)
export const configError = (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
  return sonnerToast.error(message, {
    description,
    duration: Infinity,
    closeButton: true,
    action: action ? {
      label: action.label,
      onClick: action.onClick,
    } : undefined,
    style: {
      background: 'rgba(246,243,238,1)',
      border: '1px solid rgba(194,54,28,0.5)',
      color: 'rgba(194,54,28,1)',
    },
  });
};

// User rejection toast (brief, non-intrusive)
export const userRejected = (message: string) => {
  return sonnerToast.info(message, {
    duration: 2000,
    closeButton: false,
    style: {
      background: 'rgba(246,243,238,1)',
      border: '1px solid rgba(22,21,20,0.12)',
      color: 'rgba(109,104,96,1)',
    },
  });
};

// Export the original toast for custom usage
export { sonnerToast as toast };

// Export all functions as a single object for convenience
export default {
  success,
  error,
  warning,
  info,
  loading,
  promise,
  configError,
  userRejected,
  toast: sonnerToast,
};
