import { TMDB_ATTRIBUTION } from "@bestats/core/legal/attribution";
import {
  IGDB_ATTRIBUTION,
  IGDB_HOME_URL,
  TMDB_HOME_URL,
} from "@bestats/core/legal/operator";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { appVersion } from "@/lib/api";

/**
 * The official logo files, copied byte for byte from the web's `public/`
 * (`lib/legal-logos.test.ts` checks the same hashes the web tests do), since
 * TMDB's and IGDB's terms forbid altering them.
 */
const TMDB_LOGO = require("../../assets/legal/tmdb-logo.svg");
const IGDB_LOGO = require("../../assets/legal/igdb-logo.svg");

/**
 * Logo heights: smaller than the BeStats title, as TMDB's terms ask, and
 * IGDB's never taller than TMDB's, as on the web footer. Widths follow each
 * file's viewBox (273.42 × 35.52 and 114 × 55).
 */
const TMDB_LOGO_SIZE = { height: 14, width: (14 * 273.42) / 35.52 };
const IGDB_LOGO_SIZE = { height: 14, width: (14 * 114) / 55 };

/**
 * About (spec 0033, AC-14; prompts/mobile-offline-about.md, decisions 7 to
 * 9): the app name and version, then TMDB's logo and the notice its API
 * terms require, then IGDB's logo and credit, the same text the web footer
 * prints, from core. Each logo opens its site. Public, like the catalog it
 * credits, so it needs no session.
 */
export function AboutScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 py-6"
    >
      <Panel>
        <Text className="text-3xl font-bold text-foreground">BeStats</Text>
        <Text className="text-text-secondary">Version {appVersion()}</Text>
      </Panel>
      <Panel>
        <LogoLink
          url={TMDB_HOME_URL}
          label="TMDB"
          source={TMDB_LOGO}
          size={TMDB_LOGO_SIZE}
        />
        <Text className="text-sm text-muted-foreground">
          {TMDB_ATTRIBUTION}
        </Text>
      </Panel>
      <Panel>
        <LogoLink
          url={IGDB_HOME_URL}
          label="IGDB"
          source={IGDB_LOGO}
          size={IGDB_LOGO_SIZE}
        />
        <Text className="text-sm text-muted-foreground">
          {IGDB_ATTRIBUTION}
        </Text>
      </Panel>
    </ScrollView>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <View className="gap-3 rounded-3xl border border-border bg-glass-plate-panel p-5">
      {children}
    </View>
  );
}

/** A logo as a 44pt link to its site, read by screen readers by name. */
function LogoLink({
  url,
  label,
  source,
  size,
}: {
  url: string;
  label: string;
  source: number;
  size: { width: number; height: number };
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={`Opens ${url.replace("https://", "")}`}
      onPress={() => Linking.openURL(url)}
      className="min-h-11 self-start justify-center"
    >
      <Image
        source={source}
        style={size}
        contentFit="contain"
        accessible={false}
      />
    </Pressable>
  );
}
