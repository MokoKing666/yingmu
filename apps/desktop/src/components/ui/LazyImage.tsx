import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useInView } from '@/hooks/use-in-view';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  /** 作为背景封面时额外传入，用于骨架屏尺寸 */
  style?: CSSProperties;
}

/** 懒加载 + 加载淡入；未进入视口前不请求图片资源 */
export function LazyImage({ src, alt, className, style }: LazyImageProps) {
  const { ref, inView } = useInView<HTMLImageElement>();
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded && <span className="tile-art-placeholder" aria-hidden="true" />}
      <img
        ref={ref}
        className={className}
        style={style}
        src={inView ? src : undefined}
        alt={alt}
        data-loaded={loaded}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </>
  );
}
