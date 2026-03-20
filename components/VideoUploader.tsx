"use client";

import { Upload, FileVideo, X } from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { upload } from '@vercel/blob/client';
import { getStoredToken } from '@/lib/auth-token';

const MAX_MEDIA_SIZE_BYTES = 500 * 1024 * 1024;
const MAX_SERVER_FALLBACK_UPLOAD_BYTES = 4 * 1024 * 1024;
const LARGE_MOBILE_FILE_BYTES = 50 * 1024 * 1024;
const MULTIPART_RECOMMENDED_BYTES = 100 * 1024 * 1024;

function isSupportedMedia(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowed = new Set(['mp4', 'mov', 'jpg', 'jpeg', 'png', 'webp']);
  return extension ? allowed.has(extension) : false;
}

function isVideoMedia(file: File) {
  return file.type.includes('video') || ['mp4', 'mov'].includes(file.name.split('.').pop()?.toLowerCase() || '');
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTransientUploadError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('network request failed')
  );
}

function shouldUseStableMobileUploadMode() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  // On mobile browsers upload progress can force XHR and produce random transport failures.
  return isMobile;
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

  const getUploadErrorMessage = (error: unknown) => {
    const sdkMessage = error instanceof Error ? error.message : String(error);

    if (sdkMessage.includes('Przekroczono limit')) {
      return sdkMessage;
    }

    if (sdkMessage.toLowerCase().includes('content type') || sdkMessage.toLowerCase().includes('content-type')) {
      return 'Ten format pliku nie jest obsługiwany. Dozwolone: MP4, MOV, JPG, PNG, WEBP.';
    }

    if (sdkMessage.toLowerCase().includes('unauthorized') || sdkMessage.includes('Brak konfiguracji')) {
      return 'Błąd autoryzacji. Odśwież stronę i spróbuj ponownie.';
    }

    if (sdkMessage.toLowerCase().includes('network') || sdkMessage.toLowerCase().includes('fetch')) {
      return 'Błąd sieciowy. Spróbuj ponownie. Jeśli to telefon, wyłącz VPN/iCloud Private Relay.';
    }

    if (sdkMessage.toLowerCase().includes('timeout')) {
      return 'Przesyłanie zajęło zbyt długo. Spróbuj z mniejszym plikiem lub lepszym połączeniem.';
    }

    return `Przesyłanie nie powiodło się: ${sdkMessage}`;
  };

  const uploadViaServerFallback = async (file: File, token: string | null) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/videos/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
    });

    let payload: { message?: string; sourceUrl?: string } | null = null;
    try {
      payload = (await response.json()) as { message?: string; sourceUrl?: string };
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(payload?.message ?? `Fallback upload failed (${response.status})`);
    }

    if (!payload?.sourceUrl) {
      throw new Error('Fallback upload failed: missing sourceUrl');
    }

    return payload.sourceUrl;
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

  const logUploadEvent = async (type: string, details: any) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      await fetch('/api/videos/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type, 
          ...details,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (error) {
      // Silently fail if logging fails, but log to console for debugging
      if (error instanceof Error && error.name !== 'AbortError') {
        console.debug('[VideoUploader] logging failed:', error.message);
      }
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

    const uploadStartTime = Date.now();
    const fileSizeMB = Math.round(file.size / (1024 * 1024));

    const doUpload = async () => {
      setUploadStatus('Przesyłanie...');

      const token = getStoredToken();
      const stableMobileMode = shouldUseStableMobileUploadMode();
      const isLargeMobileFile = stableMobileMode && file.size >= LARGE_MOBILE_FILE_BYTES;
      const maxAttempts = isLargeMobileFile ? 5 : 3;
      let lastAttempt = 0;
      let lastRetryDelayMs = 0;

      // On mobile, avoid aggressive parallel multipart for medium files.
      // Keep multipart for truly large files where part retries are worth it.
      const shouldUseMultipart = stableMobileMode
        ? file.size >= MULTIPART_RECOMMENDED_BYTES
        : file.size > 1 * 1024 * 1024;

      await logUploadEvent('upload_started', {
        fileName: file.name,
        fileSize: file.size,
        fileSizeMB,
        stableMobileMode,
        isLargeMobileFile,
        maxAttempts,
        shouldUseMultipart,
      });

      if (stableMobileMode) {
        setUploadStatus('Przesyłanie (tryb stabilny mobile)...');
      }

      const options = {
        access: 'public' as const,
        handleUploadUrl: '/api/videos/blob-upload',
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
        clientPayload: JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, '').trim() || `video-${Date.now()}`,
        }),
        multipart: shouldUseMultipart,
        ...(stableMobileMode
          ? {}
          : {
              onUploadProgress: ({ loaded, total, percentage }: { loaded: number; total: number; percentage: number }) => {
                setUploadMetrics({ loadedBytes: loaded, totalBytes: total });
                setProgress(Math.min(95, Math.round(percentage)));
                if (percentage >= 95) {
                  setUploadStatus('Finalizowanie zapisu...');
                }
              },
            }),
      };

      let uploadedUrl: string | null = null;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        lastAttempt = attempt;
        const attemptStartTime = Date.now();
        try {
          if (attempt > 1) {
            setUploadStatus(`Ponawianie przesyłania (${attempt}/${maxAttempts})...`);
          }

          if (stableMobileMode) {
            setProgress(Math.max(10, (attempt - 1) * 20));
          }

          const blob = await upload(file.name, file, options);
          uploadedUrl = blob.url;

          const attemptDuration = Date.now() - attemptStartTime;
          await logUploadEvent('upload_attempt_success', {
            attempt,
            totalAttempts: maxAttempts,
            durationMs: attemptDuration,
            fileSizeMB,
            totalUploadDurationMs: Date.now() - uploadStartTime,
          });

          break;
        } catch (error) {
          lastError = error;
          const isTransientNetworkError = isTransientUploadError(error);
          const attemptDuration = Date.now() - attemptStartTime;

          await logUploadEvent('upload_attempt_failed', {
            attempt,
            totalAttempts: maxAttempts,
            durationMs: attemptDuration,
            fileSizeMB,
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.constructor.name : 'Unknown',
            isTransientNetworkError,
          });

          if (!isTransientNetworkError) {
            throw error;
          }

          if (attempt === maxAttempts) {
            break;
          }

          const retryDelay = isLargeMobileFile ? attempt * 1500 : attempt * 700;
          lastRetryDelayMs = retryDelay;
          await wait(retryDelay);
        }
      }

      if (!uploadedUrl) {
        const canUseServerFallback =
          file.size <= MAX_SERVER_FALLBACK_UPLOAD_BYTES && isTransientUploadError(lastError);

        if (canUseServerFallback) {
          setUploadStatus('Błąd sieci. Próbuję trybu awaryjnego...');
          const fallbackStartTime = Date.now();
          try {
            uploadedUrl = await uploadViaServerFallback(file, token);
            const fallbackDuration = Date.now() - fallbackStartTime;
            await logUploadEvent('fallback_upload_success', {
              fileSizeMB,
              durationMs: fallbackDuration,
              totalUploadDurationMs: Date.now() - uploadStartTime,
            });
          } catch (fallbackError) {
            const fallbackDuration = Date.now() - fallbackStartTime;
            await logUploadEvent('fallback_upload_failed', {
              fileSizeMB,
              durationMs: fallbackDuration,
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            });
            throw fallbackError;
          }
        }
      }

      if (!uploadedUrl) {
        await logUploadEvent('upload_failed', {
          fileSize: file.size,
          fileSizeMB,
          stableMobileMode,
          attempt: lastAttempt,
          totalAttempts: maxAttempts,
          retryDelayMs: lastRetryDelayMs,
          error: lastError instanceof Error ? lastError.message : String(lastError),
          totalUploadDurationMs: Date.now() - uploadStartTime,
          shouldUseMultipart,
        });
        throw lastError ?? new Error('Upload failed');
      }

      setUploadStatus('Finalizowanie zapisu...');
      setUploadMetrics({ loadedBytes: file.size, totalBytes: file.size });
      setUploadedFile({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        previewUrl: uploadedUrl,
        mediaType: isVideoMedia(file) ? 'video' : 'image',
      });
      setProgress(100);

      const totalDuration = Date.now() - uploadStartTime;
      await logUploadEvent('upload_completed', {
        fileSizeMB,
        totalDurationMs: totalDuration,
        speedMBps: (fileSizeMB / (totalDuration / 1000)).toFixed(2),
      });

      toast.success('Materiał został przesłany.');
      window.dispatchEvent(new Event('videos:refresh'));
    };

    void doUpload()
      .catch(async (error) => {
        const finalUploadDuration = Date.now() - uploadStartTime;
        const fileSizeMB = Math.round(file.size / (1024 * 1024));

        console.error('[VideoUploader] upload error:', error);
        console.error('[VideoUploader] error details:', {
          message: error?.message,
          status: error?.status,
          code: error?.code,
          stack: error?.stack,
        });

        // Log final error state
        await logUploadEvent('upload_final_error', {
          fileSize: file.size,
          fileSizeMB,
          stableMobileMode: shouldUseStableMobileUploadMode(),
          totalAttempts: shouldUseStableMobileUploadMode() && file.size >= LARGE_MOBILE_FILE_BYTES ? 5 : 3,
          totalUploadDurationMs: finalUploadDuration,
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          errorStack: error instanceof Error ? error.stack : '',
          shouldUseMultipart:
            shouldUseStableMobileUploadMode() ? file.size >= MULTIPART_RECOMMENDED_BYTES : file.size > 1 * 1024 * 1024,
        });

        toast.error(getUploadErrorMessage(error));
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
