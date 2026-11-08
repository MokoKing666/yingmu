import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useInView } from '@/hooks/use-in-view';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  /** 作为背景封面时额外传入，用于骨架屏尺寸 */
  style?: CSSProperties;
  /** 图片填充方式：cover（裁切）或 contain（保留完整画面） */
  'data-fit'?: 'cover' | 'contain';
}

/** 懒加载 + 加载淡入；未进入视口前不请求图片资源 */
export function LazyImage({ src, alt, className, style, 'data-fit': fit }: LazyImageProps) {
  // 幕墙已按可见区域虚拟化，这里给一圈更宽的预加载距离，
  // 保证滚动到时封面已经解码完成，不会出现「已挂载但空白」的磁贴。
  const { ref, inView } = useInView<HTMLImageElement>('700px');
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
        data-fit={fit}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </>
  );
}
