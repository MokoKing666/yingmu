import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/stores/app-store';

export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            className="toast"
            onClick={() => dismiss(toast.id)}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22 }}
            style={{ borderLeft: `3px solid var(--semantic-${toast.tone === 'error' ? 'danger' : toast.tone === 'success' ? 'success' : 'info'})` }}
          >
            {toast.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
