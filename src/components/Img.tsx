import { useState } from "react";

/** Image with a soft neutral gradient behind it, so a missing photo never breaks the layout. */
export default function Img({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`img ${className}`} role="img" aria-label={alt}>
      {src && !failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </div>
  );
}
