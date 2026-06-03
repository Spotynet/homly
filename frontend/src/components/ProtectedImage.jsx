/**
 * ProtectedImage — renders a media file served behind the /api/media/ auth wall.
 *
 * Why: nginx blocks direct /media/ access (M-04 security rule). The correct
 * endpoint is /api/media/<path> which requires an authenticated session.
 * <img src> tags don't send HttpOnly cookies on cross-origin requests (dev),
 * so we fetch the URL via axios (withCredentials: true) and render a blob URL.
 *
 * A module-level cache avoids re-fetching the same URL across renders/components.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Module-level blob URL cache: protectedUrl → blobUrl
const _cache = new Map();
// Track in-flight fetches to avoid duplicate requests for the same URL
const _inflight = new Map();

export default function ProtectedImage({ src, alt = '', className = '', style, fallback = null }) {
  const [blobUrl, setBlobUrl] = useState(() => _cache.get(src) || null);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!src) return;
    // Already cached
    if (_cache.has(src)) {
      setBlobUrl(_cache.get(src));
      return;
    }

    let cancelled = false;

    // Re-use in-flight promise if already fetching this URL
    const existing = _inflight.get(src);
    const promise = existing || (async () => {
      const res = await axios.get(src, { responseType: 'blob', withCredentials: true });
      return URL.createObjectURL(res.data);
    })();

    if (!existing) _inflight.set(src, promise);

    promise
      .then((url) => {
        _cache.set(src, url);
        _inflight.delete(src);
        if (!cancelled) setBlobUrl(url);
      })
      .catch(() => {
        _inflight.delete(src);
        if (!cancelled) setError(true);
      });

    return () => { cancelled = true; };
  }, [src]);

  if (!src || error) return fallback;
  if (!blobUrl)      return fallback; // loading — caller can show placeholder via fallback

  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}
