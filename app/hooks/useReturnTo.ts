// app/hooks/useReturnTo.ts
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function useReturnTo(defaultPath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnTo = searchParams.get("returnTo") || defaultPath;

  const goBack = () => {
    router.push(returnTo);
  };

  return {
    returnTo,
    goBack,
  };
}
