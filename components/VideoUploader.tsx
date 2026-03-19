"use client";

import { Upload, FileVideo, X } from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { upload } from '@vercel/blob/client';

type UploadedVideo = {
  id: string;
  title: string;
  sourceUrl: string;
  localPath?: string | null;
};

const MAX_MEDIA_SIZE_BYTES = 500 * 1024 * 1024;

function isSupportedMedia(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowed = new Set(['mp4', 'mov', 'jpg', 'jpeg', 'png', 'webp']);
  return extension ? allowed.has(extension) : false;
}

function isVideoMedia(file: File) {
  return file.type.includes('video') || ['mp4', 'mov'].includes(file.name.split('.').pop()?.toLowerCase() || '');
}

export function VideoUploader({ compact = false }: { compact?: boolean }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string; previewUrl?: string; mediaType: 'video' | 'image' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && isSupportedMedia(files[0])) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = (file: File) => {
    if (!isSupportedMedia(file)) {
      toast.error('Dozwolone formaty plików: .mp4, .mov, .jpg, .jpeg, .png, .webp');
      return;
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      toast.error('Maksymalny rozmiar pliku to 500MB');
      return;
    }

    setUploading(true);
    setProgress(0);

    const baseName = file.name.replace(/\.[^.]+$/, '').trim() || `video-${Date.now()}`;

    const BLOB_UPLOAD_TIMEOUT_MS = 90_000;

    const uploadDirectToBlob = async () => {
      setProgress(15);

      // Simulate slow-but-steady progress while waiting so the user knows it's working
      const progressTimer = setInterval(() => {
        setProgress((prev) => (prev < 85 ? prev + 5 : prev));
      }, 4000);

      let blobUrl: string;
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('UPLOAD_TIMEOUT')), BLOB_UPLOAD_TIMEOUT_MS),
        );
        const blobPromise = upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/videos/blob-upload',
          clientPayload: JSON.stringify({ title: baseName }),
        });
        const blob = await Promise.race([blobPromise, timeoutPromise]);
        blobUrl = blob.url;
      } finally {
        clearInterval(progressTimer);
      }

      setProgress(95);
      setUploadedFile({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        previewUrl: blobUrl,
        mediaType: isVideoMedia(file) ? 'video' : 'image',
      });
      setProgress(100);
      toast.success('Materiał został przesłany.');
      window.dispatchEvent(new Event('videos:refresh'));
    };

    const uploadViaApiRoute = async () => {
      setProgress(5);
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post<UploadedVideo>('/videos/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (event) => {
          const total = event.total ?? file.size;
          const nextProgress = total
            ? Math.min(95, Math.round((event.loaded / total) * 100))
            : 0;
          setProgress(nextProgress);
        },
      });

      setUploadedFile({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        previewUrl: response.data.sourceUrl,
        mediaType: isVideoMedia(file) ? 'video' : 'image',
      });
      setProgress(100);
      toast.success('Materiał został przesłany.');
      window.dispatchEvent(new Event('videos:refresh'));
    };

    void uploadDirectToBlob()
      .catch(async () => {
        // Fallback to API route on ANY failure (timeout, network error, missing config, etc.)
        await uploadViaApiRoute();
      })
      .catch(() => {
        toast.error('Przesyłanie materiału nie powiodło się. Sprawdź połączenie i spróbuj ponownie.');
      })
      .finally(() => {
        setUploading(false);
      });
  };

  const handleRemove = () => {
    setUploadedFile(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`${compact ? 'bg-transparent border-0 p-0' : 'bg-card border border-border rounded-xl p-6 backdrop-blur-sm'}`}>
      {!compact && <h2 className="text-lg font-semibold text-foreground mb-4">Prześlij materiał</h2>}

      {!uploadedFile ? (
        <label
          htmlFor="video-uploader-input"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-secondary/30'
          }`}
        >
          <input
            id="video-uploader-input"
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            onChange={handleFileSelect}
            className="sr-only"
          />
          
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <p className="text-foreground font-medium mb-2">
              Dotknij, aby wybrać plik lub przeciągnij i upuść
            </p>
            <p className="text-xs text-muted-foreground mb-1">
              .mp4 · .mov · .jpg · .png · .webp
            </p>
            <p className="text-xs text-muted-foreground">
              Maksymalny rozmiar: 500MB
            </p>
          </div>
        </label>
      ) : (
        <div className="space-y-4">
          {/* Video preview */}
          <div className="relative rounded-xl overflow-hidden aspect-video bg-secondary">
            {uploadedFile.previewUrl && uploadedFile.mediaType === 'video' ? (
              <video
                src={uploadedFile.previewUrl}
                controls
                className="w-full h-full object-cover"
              />
            ) : uploadedFile.previewUrl ? (
              <img
                src={uploadedFile.previewUrl}
                alt={uploadedFile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                Podgląd niedostępny
              </div>
            )}
            <button
              onClick={handleRemove}
              aria-label="Usuń podgląd materiału"
              className="absolute top-3 right-3 w-8 h-8 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-destructive transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* File info */}
          <div className="flex items-start gap-3 p-4 bg-secondary/30 rounded-lg">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileVideo className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
              <p className="text-xs text-muted-foreground">{uploadedFile.size}</p>
            </div>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Przesyłanie...</span>
            <span className="text-foreground font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
