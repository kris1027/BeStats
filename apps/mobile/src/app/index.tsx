import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

import { GlassButton } from "@/components/glass-button";
import { useSession } from "@/lib/session";
import { tokenColor } from "@/theme/token-vars";

/**
 * The tracer's home (prompts/mobile-tracer.md, decision 7): open a movie by
 * its TMDB id. Catalog browsing and search replace this in spec 0033 Build
 * plan step 5.
 */
export default function Home() {
  const { session, loading, signOut } = useSession();
  const [movieId, setMovieId] = useState("603");

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;

  const valid = /^\d{1,10}$/.test(movieId) && Number(movieId) > 0;

  return (
    <View className="flex-1 gap-6 bg-background px-4 pt-6">
      <Text className="text-text-secondary">
        Signed in as {session.user.email}
      </Text>
      <View className="gap-2">
        <Text
          nativeID="movie-id-label"
          className="font-semibold text-text-label"
        >
          TMDB movie id
        </Text>
        <TextInput
          accessibilityLabelledBy="movie-id-label"
          accessibilityLabel="TMDB movie id"
          value={movieId}
          onChangeText={setMovieId}
          keyboardType="number-pad"
          returnKeyType="go"
          onSubmitEditing={() => valid && router.push(`/movies/${movieId}`)}
          placeholderTextColor={tokenColor("color-muted-foreground")}
          className="min-h-11 rounded-2xl border border-input bg-glass-plate px-4 text-base text-foreground"
        />
      </View>
      <GlassButton
        variant="primary"
        label="Open movie"
        disabled={!valid}
        onPress={() => router.push(`/movies/${movieId}`)}
      />
      <GlassButton label="Sign out" onPress={signOut} />
    </View>
  );
}
