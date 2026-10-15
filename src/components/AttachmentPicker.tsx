// Stage files for upload: camera, photo library or documents (expo-image-picker, expo-document-picker).
// Every file is checked on the DEVICE before it is even staged — count, size and blocked extensions
// (validateUploadFiles, 05 B.9) — because every server-side limit violation is an opaque 500. Picking a file never
// uploads it: the screen's own explicit Send / Save / Create button does.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import {
  BLOCKED_EXTENSIONS, MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES, validateUploadFiles, type UploadFile,
} from '@/api/attachments.api';
import { formatBytes } from '@/utils/format';

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

  async function run(source: 'camera' | 'photos' | 'files') {
    if (remaining <= 0) {
      Alert.alert("Can't attach", `You can attach up to ${MAX_FILES_PER_UPLOAD} files at a time`);
      return;
    }
    setBusy(true);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to take a photo.');
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

  const sources = [
    { key: 'camera', label: 'Camera', icon: 'camera-outline' },
    { key: 'photos', label: 'Photos', icon: 'images-outline' },
    { key: 'files', label: 'Files', icon: 'document-attach-outline' },
  ] as const;

  return (
    <View>
      <View className="flex-row gap-2">
        {sources.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityLabel={`Attach from ${s.label}`}
            disabled={disabled || busy}
            onPress={() => void run(s.key)}
            className={`flex-1 flex-row items-center justify-center rounded-lg border border-gray-300 py-2 ${disabled || busy ? 'opacity-50' : 'bg-white'}`}
          >
            <Ionicons name={s.icon} size={16} color="#374151" />
            <Text className="ml-1 text-sm text-gray-800">{s.label}</Text>
          </Pressable>
        ))}
      </View>
      {busy ? <ActivityIndicator style={{ marginTop: 8 }} color="#2563eb" /> : null}
      <Text className="mt-1 text-xs text-gray-500">
        Up to {MAX_FILES_PER_UPLOAD} files, {formatBytes(MAX_UPLOAD_BYTES)} each. Not allowed: {BLOCKED_EXTENSIONS.join(' ')}
      </Text>
      {files.map((f) => (
        <View key={f.uri} className="mt-2 flex-row items-center rounded-lg bg-gray-50 px-3 py-2">
          <Ionicons name={f.type.startsWith('image/') ? 'image-outline' : 'document-outline'} size={18} color="#4b5563" />
          <View className="ml-2 flex-1">
            <Text className="text-sm text-gray-900" numberOfLines={1}>{f.name}</Text>
            <Text className="text-xs text-gray-500">{formatBytes(f.size)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${f.name}`}
            disabled={disabled}
            onPress={() => onChange(files.filter((x) => x.uri !== f.uri))}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
