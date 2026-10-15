// Ask before leaving a form with unsent input, and block leaving while a write is in flight.
// Leaving never writes anything; this only protects the person's typing.
// After a successful write, call leave(() => navigation.goBack()) (or .replace(...)) to exit without the prompt.
import { usePreventRemove, useNavigation } from '@react-navigation/native';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

export function useDiscardGuard({ dirty, busy, what }: { dirty: boolean; busy: boolean; what: string }) {
  const navigation = useNavigation();
  const allowed = useRef(false);

  usePreventRemove(dirty || busy, ({ data }) => {
    if (allowed.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (busy) {
      Alert.alert('Still sending', 'Wait for the Service Desk to answer before leaving.');
      return;
    }
    Alert.alert(`Discard this ${what}?`, 'What you entered will be lost. Nothing has been sent.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  /** Exit after a successful write: the prompt is skipped for this navigation. */
  const leave = useCallback((go: () => void) => {
    allowed.current = true;
    go();
  }, []);

  return { leave };
}
