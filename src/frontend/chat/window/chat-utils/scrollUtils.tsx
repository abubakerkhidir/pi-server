/**
 * Scroll utilities for the chat window.
 *
 * autoScroll and btm-visibility logic is now handled natively by TanStack Virtual
 * (anchorTo: 'end', followOnAppend, isAtEnd). Only top-scroll and manual helpers remain.
 */

/**
 * Observe the top sentinel div; when it enters the viewport, trigger loadMore
 * and preserve scroll position. Returns cleanup function for useEffect.
 *
 * Uses a short cooldown after setup so the initial intersection (from session
 * load / auto-scroll) doesn't trigger a fetch.
 */
export function setupTopScrollObserver(
  topSentinelRef: React.RefObject<HTMLDivElement | null>,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  hasMoreRecords: boolean,
  isLoadingMore: boolean,
  onLoadMoreRecords?: () => void,
  setIsLoadingMore?: (v: boolean) => void,
) {
  if (!hasMoreRecords || !onLoadMoreRecords || !topSentinelRef.current) return;
  const scrollEl = scrollContainerRef.current;
  if (!scrollEl) return;

  let ready = false;
  const cooldown = setTimeout(() => { ready = true; }, 300);

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !isLoadingMore && ready) {
        setIsLoadingMore?.(true);
        const scrollBottom = scrollEl.scrollHeight - scrollEl.scrollTop;
        onLoadMoreRecords();
        setTimeout(() => {
          scrollEl.scrollTop = scrollEl.scrollHeight - scrollBottom;
          setIsLoadingMore?.(false);
        }, 150);
      }
    },
    { root: scrollEl, threshold: 0.1 }
  );
  observer.observe(topSentinelRef.current);
  return () => {
    clearTimeout(cooldown);
    observer.disconnect();
  };
}

export function scrollToBtm() {
  const el = document.getElementById("chatMessages");
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
}
