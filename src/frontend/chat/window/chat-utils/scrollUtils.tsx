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

export function autoScroll(chatState: ChatState, prevRecordCount: any, manualScroll: any, chatRef: any, setShowScrollDown: any) {
  const lastRecord = chatState.records[chatState.records.length - 1];
  if (!lastRecord) {
    console.log('skip as no record');
    return;
  }
  const recordsAdded = chatState.records.length > prevRecordCount.current;
  prevRecordCount.current = chatState.records.length;
  if (recordsAdded) {
    setShowScrollDown?.(false);
    handleScrolToBtm(chatRef, false);
    //console.log('scrolled due to new records')
    return;
  }

  // During streaming: only auto-scroll if user hasn't scrolled up
  const hasUnsealed = lastRecord.agentReply.entities.some((e) => !e.sealed);
  //console.log('unsealed: ',hasUnsealed)
  if (!hasUnsealed) {
    //console.log('skip before unsealed')
    return;
  }
  if (manualScroll) {
    //console.log('skipped due to manual scroll')
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