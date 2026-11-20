import { Image } from "expo-image";
import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { sizedImageUri } from "@/lib/images";

import { GlassButton } from "./glass-button";

const THUMB_WIDTH = 240;

/**
 * The web's screenshot gallery natively (prompts/mobile-title-tracking.md,
 * decision 8): a horizontal row of IGDB screenshots, each opening a full
 * screen pager. Nothing renders when IGDB has none, so no empty heading
 * shows (AGENTS.md section 3).
 */
export function ScreenshotRow({
  name,
  urls,
}: {
  name: string;
  urls: string[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const { width, height } = useWindowDimensions();
  if (urls.length === 0) return null;

  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="px-4 text-lg font-semibold text-foreground"
      >
        Screenshots
      </Text>
      <FlatList
        horizontal
        data={urls}
        keyExtractor={(url) => url}
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-4"
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={`${name} screenshot ${index + 1} of ${urls.length}`}
            onPress={() => setOpen(index)}
          >
            <Image
              source={{ uri: sizedImageUri(item, THUMB_WIDTH) }}
              contentFit="cover"
              style={{
                width: THUMB_WIDTH,
                aspectRatio: 16 / 9,
                borderRadius: 12,
              }}
            />
          </Pressable>
        )}
      />
      <Modal
        visible={open !== null}
        animationType="fade"
        onRequestClose={() => setOpen(null)}
      >
        <View className="flex-1 justify-center bg-background">
          <FlatList
            horizontal
            pagingEnabled
            data={urls}
            initialScrollIndex={open ?? 0}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            keyExtractor={(url) => url}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <Image
                source={{ uri: sizedImageUri(item, width) }}
                accessibilityLabel={`${name} screenshot ${index + 1} of ${urls.length}`}
                contentFit="contain"
                style={{ width, height: height * 0.7 }}
              />
            )}
          />
          <View className="absolute right-4 top-14">
            <GlassButton label="Close" onPress={() => setOpen(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
