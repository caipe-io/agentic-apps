"use client";
import NextLink from "next/link";
import type { ComponentProps } from "react";
export default function AppLink({
  href,
  ...props
}: ComponentProps<typeof NextLink>) {
  const normalize = (s: string) => {
    if (!s.startsWith("/apps/agentic-sdlc")) return s;
    const tail = s.slice("/apps/agentic-sdlc".length);
    return tail.startsWith("/") ? tail : "/" + tail;
  };
  const target =
    typeof href === "string"
      ? normalize(href)
      : {
          ...href,
          pathname: href.pathname ? normalize(href.pathname) : href.pathname,
        };
  return <NextLink href={target} {...props} />;
}
