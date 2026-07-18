import { ThemedView } from '@/components/themed-view';

const spacing = {
  base: 8,
  double: 16,
} as const;

type SpacerProps = {
  horizontal?: boolean;
  base?: boolean;
  size?: number;
};

export function Spacer(props: SpacerProps) {
  const size = props.base ? spacing.base : props.size;
  const value = size ?? spacing.double;

  if (props.horizontal) {
    return <ThemedView style={{ width: value }} />;
  }

  return <ThemedView style={{ height: value }} />;
}

export default spacing;
