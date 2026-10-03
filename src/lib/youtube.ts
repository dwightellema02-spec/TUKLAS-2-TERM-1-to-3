/**
 * Tuklas 2.0 — YouTube Video Reference Parser & Validator
 *
 * Validates and extracts video IDs from authorized educational YouTube URLs.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 *
 * Protects against SSRF, open redirects, and non-YouTube hosts.
 */

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export interface YouTubeValidationResult {
  isValid: boolean;
  videoId?: string;
  embedUrl?: string;
  canonicalUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export function parseYouTubeUrl(rawUrl: string): YouTubeValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'YouTube URL is required.' };
  }

  const trimmed = rawUrl.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid URL format.' };
  }

  // Only allow secure HTTP/HTTPS protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { isValid: false, error: 'Only HTTP and HTTPS URLs are permitted.' };
  }

  const hostname = url.hostname.toLowerCase();
  let videoId: string | null = null;

  if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
    // Format: https://youtu.be/VIDEO_ID
    const pathname = url.pathname.replace(/^\/+/, '');
    const firstSegment = pathname.split('/')[0];
    if (firstSegment) {
      videoId = firstSegment;
    }
  } else if (
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com')
  ) {
    if (url.pathname === '/watch') {
      // Format: https://www.youtube.com/watch?v=VIDEO_ID
      videoId = url.searchParams.get('v');
    } else if (url.pathname.startsWith('/embed/')) {
      // Format: https://www.youtube.com/embed/VIDEO_ID
      const segments = url.pathname.split('/');
      videoId = segments[2] || null;
    } else if (url.pathname.startsWith('/v/')) {
      // Format: https://www.youtube.com/v/VIDEO_ID
      const segments = url.pathname.split('/');
      videoId = segments[2] || null;
    }
  } else {
    return {
      isValid: false,
      error: 'Host must be an official YouTube domain (youtube.com or youtu.be).',
    };
  }

  if (!videoId || !YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    return {
      isValid: false,
      error: 'Could not extract a valid 11-character YouTube video ID.',
    };
  }

  return {
    isValid: true,
    videoId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}
