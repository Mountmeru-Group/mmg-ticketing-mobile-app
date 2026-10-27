// The one error boundary, around the navigation root (App.tsx). A render crash anywhere below shows this recoverable
// screen instead of a white screen (release) or a redbox (dev).
// - "Try again" remounts the whole navigation tree: it reopens on its first screen with the cache and the session as
//   they were. Nothing is re-sent — writes only ever run from a tap (src/api/queryClient.ts).
// - "Sign out" is the way out of a crash that repeats on the first screen (02 §5.5: AUTH-3, then the local wipe).
// - The error text is shown in development builds only. A release build never shows raw error details.
// - Errors thrown outside rendering (event handlers, promises) are not caught here; every write handler already
//   reports its own failure (utils/dialogs.ts).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useSignOut } from '@/hooks/useProfile';
import { hideSplash } from '@/navigation/splash';
import { useAuthStore } from '@/store/auth.store';
import { palette } from '@/theme';
import { OutlineButton, SubmitButton } from './Form';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Bumped on "Try again" so the children remount from scratch. */
  attempt: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error('Unknown render error') };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Development only: React already logs the error; this adds where it happened. Nothing is logged in release, and
    // nothing here can hold a token (02 §5.1) — components never render one.
    if (__DEV__) console.error('ErrorBoundary caught a render error', error.message, info.componentStack);
  }

  private retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    if (this.state.error) return <CrashScreen error={this.state.error} onRetry={this.retry} />;
    return <View key={this.state.attempt} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const { signOut, signingOut } = useSignOut();
  // A crash before the first screen drew would otherwise sit behind the native splash.
  useEffect(hideSplash, []);

  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center bg-gray-50 px-8 py-16">
      <Ionicons name="warning-outline" size={40} color={palette.amber[600]} />
      <Text accessibilityRole="header" className="mt-3 text-center text-lg font-semibold text-gray-900">
        Something went wrong
      </Text>
      <Text className="mt-2 text-center text-sm text-gray-700">
        The app hit an unexpected problem while showing this screen. Anything you already sent is not affected, and
        nothing is re-sent when you try again.
      </Text>
      {__DEV__ ? (
        <View className="mt-4 self-stretch rounded-lg bg-red-50 p-3">
          <Text className="text-xs font-semibold text-red-800">Development build only</Text>
          <Text selectable className="mt-1 font-mono text-xs text-red-800">
            {error.message}
          </Text>
        </View>
      ) : null}
      <View className="mt-6 self-stretch">
        <SubmitButton label="Try again" onPress={onRetry} />
      </View>
      {signedIn ? (
        <View className="mt-3 self-stretch">
          <OutlineButton label={signingOut ? 'Signing out…' : 'Sign out'} onPress={() => void signOut()} disabled={signingOut} />
        </View>
      ) : null}
      <Text className="mt-6 text-center text-xs text-gray-500">If this keeps happening, tell the Service Desk team what you were doing.</Text>
    </ScrollView>
  );
}
