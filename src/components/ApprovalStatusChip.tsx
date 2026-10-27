import { Text, View } from 'react-native';

/**
 * An approval's state (05 §A.10): APPROVED green, REJECTED red, CANCELLED gray, else yellow. Shared by the approval
 * detail (M13) and a service request's approvals (Phase G4). Sits at the right end of its row.
 */
export function ApprovalStatusChip({ status }: { status: string }) {
  const style =
    status === 'APPROVED'
      ? { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' }
      : status === 'REJECTED'
        ? { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' }
        : status === 'CANCELLED'
          ? { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Cancelled' }
          : { bg: 'bg-yellow-100', text: 'text-yellow-800', label: status === 'PENDING' ? 'Pending' : status };
  return (
    <View className={`ml-auto rounded-full px-2.5 py-0.5 ${style.bg}`}>
      <Text className={`text-xs font-medium ${style.text}`}>{style.label}</Text>
    </View>
  );
}
