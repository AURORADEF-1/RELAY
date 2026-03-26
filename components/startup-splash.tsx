"use client";

import { useEffect, useState } from "react";

const SPLASH_STORAGE_KEY = "relay-startup-splash-seen";
const SPLASH_DURATION_MS = 1500;

export function StartupSplash({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeenSplash = window.sessionStorage.getItem(SPLASH_STORAGE_KEY) === "1";

    if (hasSeenSplash) {
      return;
    }

    window.sessionStorage.setItem(SPLASH_STORAGE_KEY, "1");
    const showTimeout = window.setTimeout(() => {
      setIsVisible(true);
    }, 0);

    const hideTimeout = window.setTimeout(() => {
      setIsVisible(false);
    }, SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(showTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, []);

  return (
    <>
      {children}
      {isVisible ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
          <div className="flex items-center justify-center px-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/aurora-logo-build.gif"
              alt="Aurora Systems boot sequence"
              className="h-auto w-full max-w-[14rem] sm:max-w-[16rem] lg:max-w-[18rem]"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
