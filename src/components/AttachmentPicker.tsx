// Stage files for upload: camera, photo library or documents (expo-image-picker, expo-document-picker).
// Every file is checked on the DEVICE before it is even staged — count, size and blocked extensions
// (validateUploadFiles, 05 B.9) — because every server-side limit violation is an opaque 500. Picking a file never
// uploads it: the screen's own explicit Send / Save / Create button does.
// iOS (docs/ios/00-PORT-MANIFEST.md §4.11): one "Add attachment" button opens an action sheet (Take Photo, Photo Library,
// Choose File) in place of Android's three buttons. Photos and Files are the system's out-of-process pickers, which ask
// for no permission; the camera asks once, with the purpose string in app.json, and a refusal offers Settings. Picked
// documents are copied into the app's cache (App Store 2.5.2, compliance C3).
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

import {
  BLOCKED_EXTENSIONS, MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES, validateUploadFiles, type UploadFile,
} from '@/api/attachments.api';
import { colors, palette } from '@/theme';
import { chooseFromActionSheet, type SheetChoice } from '@/utils/actionSheet';
import { formatBytes } from '@/utils/format';

type Source = 'camera' | 'photos' | 'files';

/** The attachment sources, in the order iOS apps list them. */
export const ATTACHMENT_SOURCES: readonly SheetChoice<Source>[] = [
  { value: 'camera', label: 'Take Photo' },
  { value: 'photos', label: 'Photo Library' },
  { value: 'files', label: 'Choose File' },
];

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

function nameFromUri(uri: string, fallback: string): string {
  const last = decodeURIComponent(uri.split('?')[0]?.split('/').pop() ?? '');
  return last || fallback;
}

/** Size in bytes, from the picker when it reports one, else from the local file itself (never the network). */
async function resolveSize(uri: string, reported: number | null | undefined): Promise<number | undefined> {
  if (typeof reported === 'number' && reported >= 0) return reported;
  try {
    const blob = await (await fetch(uri)).blob();
    const size = blob.size;
    (blob as Blob & { close?: () => void }).close?.();
    return size;
  } catch {
    return undefined;
  }
}

interface AttachmentPickerProps {
  files: UploadFile[];
  onChange: (files: UploadFile[]) => void;
  disabled?: boolean;
}

export function AttachmentPicker({ files, onChange, disabled = false }: AttachmentPickerProps) {
  const [busy, setBusy] = useState(false);
  const remaining = MAX_FILES_PER_UPLOAD - files.length;

  async function add(picked: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }[]) {
    if (picked.length === 0) return;
    const next: UploadFile[] = [];
    for (const [i, p] of picked.entries()) {
      const name = p.name || nameFromUri(p.uri, `file-${Date.now()}-${i}`);
      const size = await resolveSize(p.uri, p.size);
      if (size === undefined) {
        Alert.alert("Can't attach this file", `The size of ${name} couldn't be read, so it can't be checked before upload.`);
        return;
      }
      next.push({ uri: p.uri, name, type: p.mimeType || guessMime(name), size });
    }
    const problem = validateUploadFiles([...files, ...next]);
    if (problem) {
      Alert.alert("Can't attach", problem);
      return;
    }
    onChange([...files, ...next]);
  }

  async function chooseSource() {
    if (remaining <= 0) {
      Alert.alert("Can't attach", `You can attach up to ${MAX_FILES_PER_UPLOAD} files at a time`);
      return;
    }
    const source = await chooseFromActionSheet({ title: 'Add attachment', choices: ATTACHMENT_SOURCES });
    if (source) await run(source);
  }

  async function run(source: Source) {
    setBusy(true);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access for Setu in Settings to take a photo.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]);
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (!result.canceled) {
          await add(result.assets.map((a) => ({ uri: a.uri, name: a.fileName, mimeType: a.mimeType, size: a.fileSize })));
        }
      } else if (source === 'photos') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: remaining,
          quality: 0.8,
        });
        if (!result.canceled) {
          await add(result.assets.map((a) => ({ uri: a.uri, name: a.fileName, mimeType: a.mimeType, size: a.fileSize })));
        }
      } else {
        const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
        if (!result.canceled) {
          await add(result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size })));
        }
      }
    } catch {
      Alert.alert("Couldn't open the picker", 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add attachment"
        accessibilityHint="Take a photo, or choose one from Photos or a file from Files"
        accessibilityState={{ disabled: disabled || busy, busy }}
        disabled={disabled || busy}
        onPress={() => void chooseSource()}
        className={`min-h-11 flex-row items-center justify-center rounded-lg border border-gray-300 bg-white px-3 ${disabled || busy ? 'opacity-50' : 'active:bg-gray-50'}`}
      >
        <Ionicons name="attach-outline" size={18} color={colors.text.body} />
        <Text className="ml-1.5 text-sm font-medium text-gray-700">Add attachment</Text>
      </Pressable>
      {busy ? <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} /> : null}
      <Text className="mt-2 text-xs text-gray-500">
        Up to {MAX_FILES_PER_UPLOAD} files, {formatBytes(MAX_UPLOAD_BYTES)} each. Not allowed: {BLOCKED_EXTENSIONS.join(' ')}
      </Text>
      {files.map((f) => (
        <View key={f.uri} className="mt-2 flex-row items-center rounded-lg bg-gray-50 px-3 py-2">
          <Ionicons name={f.type.startsWith('image/') ? 'image-outline' : 'document-outline'} size={18} color={palette.gray[600]} />
          <View className="ml-2 flex-1">
            <Text className="text-sm text-gray-900" numberOfLines={1}>{f.name}</Text>
            <Text className="text-xs text-gray-500">{formatBytes(f.size)}</Text>
          </View>
          <Pressable
            className="-my-2 -mr-3 h-11 w-11 items-center justify-center active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={`Remove ${f.name}`}
            disabled={disabled}
            onPress={() => onChange(files.filter((x) => x.uri !== f.uri))}
          >
            <Ionicons name="close-circle" size={20} color={colors.text.muted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
