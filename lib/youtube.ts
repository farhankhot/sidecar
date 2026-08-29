export function parseYouTubeUrl(input: string): string | null {
  const trimmed = input.trim();
  
  // Direct video ID (11 characters)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    
    // youtube.com/watch?v=...
    if (url.hostname.includes('youtube.com') && url.pathname === '/watch') {
      return url.searchParams.get('v');
    }
    
    // youtu.be/...
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1);
    }
    
    // youtube.com/shorts/...
    if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/')[2];
    }
    
    // youtube.com/embed/...
    if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/')[2];
    }
  } catch {
    // Not a valid URL, continue
  }
  
  return null;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`;
}
