import { TMDB_APP_ATTRIBUTION } from "@bestats/core/legal/attribution";
import {
  CREDIT_LINE_PREFIX,
  IGDB_ATTRIBUTION,
  IGDB_HOME_URL,
  OPERATOR_GITHUB_URL,
  OPERATOR_HANDLE,
  PRIVACY_LABEL,
  PRIVACY_PATH,
  TERMS_LABEL,
  TERMS_PATH,
  TMDB_HOME_URL,
} from "@bestats/core/legal/operator";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ChevronRow } from "@/components/chevron-row";
import { GlassPanel } from "@/components/glass-panel";
import { IconKey } from "@/components/icon-key";
import { Text } from "@/components/text";
import { appVersion } from "@/lib/api";
import { getPublicEnv } from "@/lib/env";

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
 * terms require (worded for an application), then IGDB's logo and credit,
 * all from core. Each logo opens its site. Below them, the Privacy Policy and
 * Terms of Service open in the phone's browser
 * (prompts/mobile-about-legal-links.md). The icon key sits under the version
 * and the credit line at the end, as in the web's footer
 * (prompts/mobile-look-account.md, decision 9).
 * Public, like the catalog it credits, so it needs no session.
 */
export function AboutScreen() {
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 py-6"
      // The tab bar floats over the screen, so UIKit insets the end of the
      // page above it; without this the credit line sits under the bar.
      contentInsetAdjustmentBehavior="automatic"
    >
      <Panel>
        <Text className="text-3xl font-bold text-foreground">BeStats</Text>
        <Text className="text-text-secondary">Version {appVersion()}</Text>
      </Panel>
      <Panel>
        <IconKey />
      </Panel>
      <Panel>
        <LogoLink
          url={TMDB_HOME_URL}
          label="TMDB"
          source={TMDB_LOGO}
          size={TMDB_LOGO_SIZE}
        />
        <Text className="text-sm text-muted-foreground">
          {TMDB_APP_ATTRIBUTION}
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
      <LegalLink path={PRIVACY_PATH} label={PRIVACY_LABEL} />
      <LegalLink path={TERMS_PATH} label={TERMS_LABEL} />
      <Credit />
    </ScrollView>
  );
}

/**
 * A row to one of the website's legal pages, Account's row look
 * (`ChevronRow`). The URL is built on press from the API's origin, which also
 * serves the pages, so a missing config fails only when tapped, never while
 * rendering. The hint names the page, as the plan asks (decision 4).
 */
function LegalLink({ path, label }: { path: string; label: string }) {
  return (
    <ChevronRow
      role="link"
      label={label}
      hint={`Opens the ${label} in your browser`}
      onPress={() =>
        Linking.openURL(`${getPublicEnv().EXPO_PUBLIC_API_BASE_URL}${path}`)
      }
    />
  );
}

/** About's panels: the shared glass panel at About's tighter spacing. */
function Panel({ children }: { children: ReactNode }) {
  return <GlassPanel className="gap-3 p-5">{children}</GlassPanel>;
}

/**
 * The credit line, the web footer's: core's words, then the handle as a link
 * to the operator's GitHub profile, as every mention of it is
 * (`legal/operator.ts`). On a phone the link gets the full 44pt tap area
 * (prompts/mobile-look-account.md, decision 9).
 */
function Credit() {
  return (
    <View className="flex-row flex-wrap items-center justify-center px-1">
      <Text className="text-xs text-muted-foreground">
        {CREDIT_LINE_PREFIX}{" "}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={OPERATOR_HANDLE}
        accessibilityHint="Opens github.com in your browser"
        onPress={() => Linking.openURL(OPERATOR_GITHUB_URL)}
        className="min-h-11 justify-center"
      >
        <Text className="text-xs font-semibold text-foreground underline">
          {OPERATOR_HANDLE}
        </Text>
      </Pressable>
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
