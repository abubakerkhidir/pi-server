import type { ChatState } from "../../../types";

export function setupBtmVisibilityObserver(chatRef: any, setShowScrollDown: any) {
  const btmDiv = chatRef.current;
  if (!btmDiv || !setShowScrollDown) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        setShowScrollDown(false);
      }
    },
    { threshold: 0.1 }
  );
  observer.observe(btmDiv);
  return () => observer.disconnect();
}

export function setupScrolListner(chatRef: any, setShowScrollDown: any) {
  const myDiv = chatRef.current?.parentElement;
  if (!myDiv) return;
  const listner = (event: any) => {
    //console.log('scrol-listner...')
    if (event.deltaY < 0) {
      //console.log('User scrolled UP');
      setShowScrollDown(true);
    }
  };
  myDiv.addEventListener('wheel', listner);
  return () => {
    if (myDiv)
      myDiv.removeEventListener('wheel', listner);
  };
}

export function autoScroll(chatState: ChatState, prevRecordCount: any, manualScroll: any, chatRef: any, setShowScrollDown: any, prevFirstRecordId?: React.MutableRefObject<string | null>) {
  const lastRecord = chatState.records[chatState.records.length - 1];
  if (!lastRecord) {
    return;
  }

  const currentFirstId = chatState.records[0]?.id ?? null;
  const prevFirstId = prevFirstRecordId?.current;
  if (prevFirstRecordId) prevFirstRecordId.current = currentFirstId;

  const recordsAdded = chatState.records.length > prevRecordCount.current;
  prevRecordCount.current = chatState.records.length;

  // Records were prepended (pagination) — don't auto-scroll
  if (currentFirstId !== prevFirstId && prevFirstId !== null) {
    return;
  }

  if (recordsAdded) {
    setShowScrollDown?.(false);
    handleScrolToBtm(chatRef, false);
    return;
  }

  // During streaming: only auto-scroll if user hasn't scrolled up
  const hasUnsealed = lastRecord.agentReply.entities.some((e: any) => !e.sealed);
  if (!hasUnsealed) {
    return;
  }
  if (manualScroll) {
    return;
  }

  handleScrolToBtm(chatRef, false);
}

export function scrollToBtm() {
  handleScrollToBtmDiv(document.getElementById("chatBtmRef"), false);
}

export function handleScrolToBtm(endRef: React.RefObject<HTMLDivElement | null>, small: boolean) {
  handleScrollToBtmDiv(endRef.current, small);
}

export function handleScrollToBtmDiv(btmDiv: any | null, small: boolean) {
  btmDiv?.scrollIntoView({ behavior: "smooth" });
  setTimeout(() => {
    btmDiv?.scrollIntoView({ behavior: "smooth" });
    if (small) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, 100);
}

/**
 * Observe the top sentinel div; when it enters the viewport, trigger loadMore
 * and preserve scroll position. Returns cleanup function for useEffect.
 *
 * Uses a short cooldown after setup so the initial intersection (from session
 * load / auto-scroll) doesn't trigger a fetch.
 */
export function setupTopScrollObserver(
  topSentinelRef: React.RefObject<HTMLDivElement | null>,
  chatRef: React.RefObject<HTMLDivElement | null>,
  hasMoreRecords: boolean,
  isLoadingMore: boolean,
  onLoadMoreRecords?: () => void,
  setIsLoadingMore?: (v: boolean) => void,
) {
  if (!hasMoreRecords || !onLoadMoreRecords || !topSentinelRef.current) return;
  const chatEl = chatRef.current?.parentElement;
  if (!chatEl) return;

  let ready = false;
  const cooldown = setTimeout(() => { ready = true; }, 300);

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !isLoadingMore && ready) {
        setIsLoadingMore?.(true);
        const scrollBottom = chatEl.scrollHeight - chatEl.scrollTop;
        onLoadMoreRecords();
        setTimeout(() => {
          chatEl.scrollTop = chatEl.scrollHeight - scrollBottom;
          setIsLoadingMore?.(false);
        }, 150);
      }
    },
    { root: chatEl, threshold: 0.1 }
  );
  observer.observe(topSentinelRef.current);
  return () => {
    clearTimeout(cooldown);
    observer.disconnect();
  };
}