"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ScoutInput } from "@/components/scout-input";
import HomeHeroBackground from "@/components/app/(home)/sections/hero/Background/Background";
import { BackgroundOuterPiece } from "@/components/app/(home)/sections/hero/Background/BackgroundOuterPiece";
import HeroFlame from "@/components/shared/effects/flame/hero-flame";
import HomeHeroPixi from "@/components/app/(home)/sections/hero/Pixi/Pixi";
import HowItWorks from "@/components/app/(home)/sections/scout/HowItWorks";
import AlwaysSearching from "@/components/app/(home)/sections/scout/AlwaysSearching";
import RecentDiscoveries from "@/components/app/(home)/sections/scout/RecentDiscoveries";
import { useAuth } from "@/contexts/AuthContext";

const placeholders = [
  "Scout for Taylor Swift tickets in my city...",
  "Tell me when Mr. Beast comes to my city...",
  "Scout for new Chinese restaurants near me...",
  "Scout for Tesla Cybertruck available for test drive...",
  "Scout for cheap flights to Tokyo next month...",
  "Scout for PS5 restocks at local stores...",
];

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingQuery = searchParams.get("pendingQuery");
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createClient();

  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle pending query after login
  useEffect(() => {
    if (pendingQuery && user && !authLoading) {
      // Remove the query param from URL
      router.replace("/");
      // Set the query and auto-submit
      setQuery(pendingQuery);
      // Small delay to ensure state is set
      setTimeout(() => {
        handleSubmitWithQuery(pendingQuery);
      }, 100);
    }
  }, [pendingQuery, user, authLoading]);

  const handleSubmitWithQuery = async (queryText: string) => {
    if (!queryText.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Get user's location
      let location: {
        city: string;
        latitude: number;
        longitude: number;
      } | null = null;
      if ("geolocation" in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject);
            }
          );

          const { latitude, longitude } = position.coords;

          // Reverse geocode to get city name
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            "Unknown";

          location = {
            city,
            latitude,
            longitude,
          };
        } catch (error) {
          console.error("Error getting location:", error);
        }
      }

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Check scout limit (max 5 per user)
      const { count: scoutCount, error: countError } = await supabase
        .from("scouts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user?.id);

      if (countError) {
        console.error("Error checking scout count:", countError);
        alert("Error checking scout limit. Please try again.");
        setIsSubmitting(false);
        return;
      }

      if (scoutCount !== null && scoutCount >= 5) {
        alert("You have reached the maximum limit of 5 scouts. Please delete an existing scout to create a new one.");
        setIsSubmitting(false);
        return;
      }

      // Create new scout with user_id
      const { data: scoutData, error } = await supabase
        .from("scouts")
        .insert({
          title: queryText.slice(0, 50) + (queryText.length > 50 ? "..." : ""),
          location: location,
          user_id: user?.id,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating scout:", error.message, error.code, error.details);
        alert(`Error creating scout: ${error.message}`);
        setIsSubmitting(false);
        return;
      }

      if (scoutData) {
        // Redirect to scout page with query as URL parameter
        router.push(
          `/scout/${scoutData.id}?initialQuery=${encodeURIComponent(queryText)}`
        );
      }
    } catch (error) {
      console.error("Error:", error);
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim() || isSubmitting) {
      return;
    }

    // Check if user is authenticated
    if (!user) {
      // Redirect to login with the query as a pending action
      router.push(
        `/login?pendingQuery=${encodeURIComponent(query)}&redirectTo=/`
      );
      return;
    }

    await handleSubmitWithQuery(query);
  };

  return (
    <>
      <section
        className="overflow-x-clip min-h-screen flex flex-col"
        id="home-hero"
      >
        <div
          className="relative flex-1 flex flex-col items-center justify-center"
          id="hero-content"
        >
          <HomeHeroPixi />
          <HeroFlame />
          <BackgroundOuterPiece />
          <HomeHeroBackground />

          <div className="relative container px-16 w-full -mt-100 2xl:-mt-[250px]">
            <div className="max-w-5xl w-full mx-auto">
              <div className="text-center mb-6">
                <h1 className="text-4xl md:text-7xl text-[#262626] mb-4">
                  Open <span className="text-heat-100">Scouts</span>
                </h1>
                <p className="text-lg md:text-lg text-gray-600">
                  Create AI scouts that continuously search and notify you when
                  <br></br>
                  they find what you&apos;re looking for
                </p>
              </div>

              <div className="mb-8 py-10">
                <ScoutInput
                  placeholders={placeholders}
                  onChange={(e) => setQuery(e.target.value)}
                  onSubmit={handleSubmit}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Discoveries Section */}
      <RecentDiscoveries />

      {/* How It Works Section */}
      <HowItWorks />

      {/* Always Searching Section */}
      <AlwaysSearching />
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <HomeContent />
    </Suspense>
  );
}
