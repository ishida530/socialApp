'use client';

import { useEffect, useState } from 'react';
import { PostComposer } from '@/components/PostComposer';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

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
        <PostComposer />
      </SheetContent>
    </Sheet>
  );
}
