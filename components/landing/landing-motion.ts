// Landing page motion variants - plain objects, shared by the client landing component and the
// server-rendered static sections (2026-10-01, landing split).

export const container = {
  hidden: { opacity: 0, y: 36 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 20,
      staggerChildren: 0.08,
    },
  },
};

export const item = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 100, damping: 20 },
  },
};

export const sectionFromLeft = {
  hidden: { opacity: 0, x: -72 },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 20,
      staggerChildren: 0.08,
    },
  },
};

export const sectionFromRight = {
  hidden: { opacity: 0, x: 72 },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 20,
      staggerChildren: 0.08,
    },
  },
};
