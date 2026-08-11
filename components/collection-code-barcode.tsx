"use client";

import { useEffect, useRef, useState } from "react";

export function CollectionCodeBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    void import("jsbarcode")
      .then(({ default: JsBarcode }) => {
        if (!active || !svgRef.current) return;
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: 2,
          height: 64,
          margin: 8,
          displayValue: true,
          font: "Arial",
          fontSize: 18,
          fontOptions: "bold",
          lineColor: "#0f172a",
          background: "#ffffff",
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [value]);

  if (failed) return null;

  return (
    <div className="requester-collection-barcode">
      <svg ref={svgRef} role="img" aria-label={`Collection barcode ${value}`} />
      <span>Code 128 · scan with a standard barcode scanner</span>
    </div>
  );
}
