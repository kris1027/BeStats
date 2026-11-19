import { NativeTabs } from "expo-router/native-tabs";

import { tokenColor } from "@/theme/token-vars";

/**
 * The app's bottom tabs (prompts/mobile-app-shell-catalog.md, decision 3):
 * Home, Search, Library and Account, as the platform's own tab bar. Each tab
 * is a group of one shared folder, so every tab keeps its own stack and a
 * title opened from Search goes back to Search. The tabs are static, as
 * NativeTabs needs; Library and Account show their signed out states inside.
 */
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={tokenColor("color-primary")}>
      <NativeTabs.Trigger name="(index)">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(search)">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(library)">
        <NativeTabs.Trigger.Icon sf="books.vertical.fill" md="video_library" />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(account)">
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
