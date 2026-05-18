// ============================================
// YouTube URL + metadata helpers
// ============================================

/**
 * Extract a YouTube video id from a `youtube.com/watch?v=...` or
 * `youtu.be/...` URL. Returns null when the URL is not parseable or
 * does not contain a video id.
 */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1) || null;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/**
 * Fetch the title for a YouTube video via the public oEmbed endpoint.
 *
 * Returns a fallback string when the lookup fails so the playlist
 * editor never blocks on title resolution. Duration is intentionally
 * not fetched here — see PLAN.md decision #1: duration is recorded
 * by the host's content script when the video first plays.
 */
export async function fetchVideoTitle(videoId: string): Promise<string> {
  const fallback = `YouTube Video (${videoId})`;
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!response.ok) return fallback;
    const data = (await response.json()) as OEmbedResponse;
    return data.title || fallback;
  } catch {
    return fallback;
  }
}
