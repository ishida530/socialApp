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
const API_UPLOAD_SAFE_LIMIT_BYTES = 4 * 1024 * 1024;

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
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadMetrics, setUploadMetrics] = useState({ loadedBytes: 0, totalBytes: 0 });
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string; previewUrl?: string; mediaType: 'video' | 'image' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatMegabytes = (bytes: number) => {
    if (bytes <= 0) {
      return '0 MB';
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getUploadErrorMessage = (error: unknown, isSmallFile: boolean) => {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

    if (status === 413) {
      return 'Ten plik przekracza limit uploadu przez funkcję Vercel. Dla większych plików wymagany jest upload bezpośrednio do Blob.';
    }

    if (message?.includes('Brak konfiguracji storage')) {
      return 'Brakuje konfiguracji storage w Vercel. Dodaj BLOB_READ_WRITE_TOKEN lub podepnij Vercel Blob do projektu.';
    }

    return isSmallFile
      ? 'Przesyłanie materiału nie powiodło się. Sprawdź połączenie i spróbuj ponownie.'
      : 'Nie udało się przesłać dużego pliku do storage. Sprawdź konfigurację Blob i połączenie.';
  };

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
    setUploadMetrics({ loadedBytes: 0, totalBytes: file.size });

    const uploadDirectToBlob = async () => {
      setUploadStatus('Przesyłanie dużego pliku bezpośrednio do storage...');
      setProgress(0);

      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/videos/blob-upload',
        clientPayload: JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, '').trim() || `video-${Date.now()}`,
        }),
      });

      setUploadStatus('Finalizowanie zapisu...');
      setUploadMetrics({ loadedBytes: file.size, totalBytes: file.size });
      setUploadedFile({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        previewUrl: blob.url,
        mediaType: isVideoMedia(file) ? 'video' : 'image',
      });
      setProgress(100);
      toast.success('Materiał został przesłany.');
      window.dispatchEvent(new Event('videos:refresh'));
    };

    const uploadViaApiRoute = async () => {
      setUploadStatus('Przesyłanie pliku...');
      setProgress(5);
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post<UploadedVideo>('/videos/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        onUploadProgress: (event) => {
          const total = event.total ?? file.size;
          const loaded = Math.min(event.loaded, total);
          const nextProgress = total
            ? Math.min(95, Math.round((loaded / total) * 100))
            : 0;

          setUploadMetrics({ loadedBytes: loaded, totalBytes: total });
          setProgress(nextProgress);

          if (total && loaded >= total) {
            setUploadStatus('Finalizowanie zapisu...');
          }
        },
      });

      setUploadStatus('Finalizowanie zapisu...');
      setUploadMetrics({ loadedBytes: file.size, totalBytes: file.size });
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

    const uploadPromise = file.size <= API_UPLOAD_SAFE_LIMIT_BYTES
      ? uploadViaApiRoute()
      : uploadDirectToBlob();

    void uploadPromise
      .catch((error) => {
        toast.error(getUploadErrorMessage(error, file.size <= API_UPLOAD_SAFE_LIMIT_BYTES));
      })
      .finally(() => {
        setUploadStatus('');
        setUploadMetrics({ loadedBytes: 0, totalBytes: 0 });
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
            <span className="text-muted-foreground">{uploadStatus || 'Przesyłanie...'}</span>
            <span className="text-foreground font-medium">{formatMegabytes(uploadMetrics.loadedBytes)} / {formatMegabytes(uploadMetrics.totalBytes)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress}%</span>
            <span>{formatMegabytes(uploadMetrics.totalBytes)}</span>
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
