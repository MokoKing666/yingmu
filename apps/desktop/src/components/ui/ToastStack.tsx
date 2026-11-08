import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/stores/app-store';
import { useMotionPreference } from '@/hooks/use-motion-preference';

export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  const reduceMotion = useMotionPreference();

  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            className="toast"
            onClick={() => dismiss(toast.id)}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: 24 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22 }}
            style={{ borderLeft: `3px solid var(--semantic-${toast.tone === 'error' ? 'danger' : toast.tone === 'success' ? 'success' : 'info'})` }}
          >
            {toast.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
