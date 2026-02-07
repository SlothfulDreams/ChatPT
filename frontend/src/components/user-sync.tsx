"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

export function UserSync({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded } = useUser();
  const convexUser = useQuery(api.users.current);
  const upsertUser = useMutation(api.users.upsertFromClerk);
  const ensureBody = useMutation(api.body.ensure);
  const syncing = useRef(false);

  useEffect(() => {
    if (!isLoaded || !clerkUser || syncing.current) return;
    if (convexUser !== undefined && convexUser !== null) return;

    syncing.current = true;

    (async () => {
      try {
        const userId = await upsertUser({
          clerkId: clerkUser.id,
          name: clerkUser.fullName ?? clerkUser.firstName ?? undefined,
          email: clerkUser.primaryEmailAddress?.emailAddress ?? undefined,
          image: clerkUser.imageUrl ?? undefined,
        });
        await ensureBody({ userId });
      } finally {
        syncing.current = false;
      }
    })();
  }, [isLoaded, clerkUser, convexUser, upsertUser, ensureBody]);

  return <>{children}</>;
}
