import { useEffect, useRef } from "react";

function LoadMoreSentinel({
  root,
  onIntersect,
}: {
  root: HTMLElement | null;
  onIntersect: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onIntersect();
        }
      },
      { root },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onIntersect, root]);

  return (
    <div ref={sentinelRef} className="book-list-load-sentinel" aria-hidden="true">
      Loading more books...
    </div>
  );
}

export default LoadMoreSentinel;