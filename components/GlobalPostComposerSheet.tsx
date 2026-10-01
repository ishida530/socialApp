'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Loaded on first open, not shipped with every page (2026-10-01, performance): this sheet is
// mounted in the root layout, so a static import put the whole composer (media upload, AI
// adaptation, per-platform settings) into the JS of the landing page, legal pages, login...
const PostComposer = dynamic(() => import('@/components/PostComposer').then((mod) => mod.PostComposer), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Ładowanie...</p>,
});

export function GlobalPostComposerSheet() {
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  useEffect(() => {
    const openComposer = () => {
      setIsComposerOpen(true);
    };

    window.addEventListener('post-composer:open', openComposer);
    return () => {
      window.removeEventListener('post-composer:open', openComposer);
    };
  }, []);

  return (
    <Sheet open={isComposerOpen} onOpenChange={setIsComposerOpen}>
      <SheetContent side="right" className="w-full md:w-[50vw] md:max-w-[960px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Komponuj post</SheetTitle>
          <SheetDescription>Tworzenie i planowanie publikacji w panelu bocznym.</SheetDescription>
        </SheetHeader>
        {isComposerOpen && <PostComposer />}
      </SheetContent>
    </Sheet>
  );
}
