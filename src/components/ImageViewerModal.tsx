// Full-screen view of an image attachment via ATT-3 `/view`, with the Bearer header (02 §5.7: no signed URLs, and
// the token never goes in the URL). Only for image/* other than SVG; the native Image decoder cannot execute
// anything, and a non-image response simply fails to decode. "Share" downloads the file (ATT-4) for the share sheet.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AuthenticatedRequest } from '@/api/attachments.api';
import { colors } from '@/theme';

export function ImageViewerModal({
  request, title, onClose, onShare, sharing = false,
}: {
  /** From getAttachmentViewRequest(); null hides the viewer. */
  request: AuthenticatedRequest | null;
  title: string;
  onClose: () => void;
  onShare?: () => void;
  sharing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  return (
    <Modal visible={request !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent onShow={() => setState('loading')}>
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {/* Light status-bar icons on the black viewer; unmounting restores the app's dark ones. */}
        {request !== null ? <StatusBar barStyle="light-content" /> : null}
        <View className="h-14 flex-row items-center px-1">
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full active:bg-white/20">
            <Ionicons name="close" size={24} color={colors.text.inverse} />
          </Pressable>
          <Text className="ml-2 flex-1 text-base text-white" numberOfLines={1}>{title}</Text>
          {onShare ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share"
              accessibilityState={{ busy: sharing }}
              disabled={sharing}
              onPress={onShare}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-white/20"
            >
              {sharing ? <ActivityIndicator color={colors.text.inverse} /> : <Ionicons name="share-social-outline" size={22} color={colors.text.inverse} />}
            </Pressable>
          ) : null}
        </View>
        <View className="flex-1 items-center justify-center">
          {request ? (
            <Image
              source={{ uri: request.uri, headers: request.headers }}
              contentFit="contain"
              // Decoded at the view's size, not the photo's: expo-image downscales by default (Phase P2), as
              // resizeMethod="resize" did on React Native's Image (Phase P). A 12-megapixel attachment is not decoded
              // whole (~48 MB of bitmap) on a 1 GB phone. The viewer has no zoom, so the picture on screen is the same.
              // Its caches are cleared when the session ends (HtmlText.tsx).
              style={{ width: '100%', height: '100%' }}
              onLoad={() => setState('ok')}
              onError={() => setState('error')}
              accessibilityLabel={title}
            />
          ) : null}
          {state === 'loading' ? <ActivityIndicator style={{ position: 'absolute' }} color={colors.text.inverse} size="large" /> : null}
          {state === 'error' ? (
            <Text style={{ position: 'absolute' }} className="px-8 text-center text-sm text-white">
              Couldn't load this image. Close and try again; if it keeps failing, your session may have ended.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
