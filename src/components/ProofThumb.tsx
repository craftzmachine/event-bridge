import { useEffect, useState } from "react";
import { getProof } from "../state/expenses";

/** A proof image from the device store, as a thumbnail or full size; it opens in a new tab to zoom. */
export default function ProofThumb({ fileId, alt, full = false, blob }: { fileId?: string; alt: string; full?: boolean; blob?: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made = "";
    let live = true;
    (blob ? Promise.resolve(blob) : fileId ? getProof(fileId) : Promise.resolve(undefined)).then((b) => {
      if (!live || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [fileId, blob]);
  if (!url) return <span className={`proof-thumb is-empty ${full ? "is-full" : ""}`} aria-label="No proof">{fileId || blob ? "…" : "No proof"}</span>;
  return full ? (
    <a className="proof-full" href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
      <img src={url} alt={alt} />
    </a>
  ) : (
    <img className="proof-thumb" src={url} alt={alt} />
  );
}
