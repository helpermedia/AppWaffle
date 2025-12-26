import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Label } from "@/components/ui/Label";
import type { GridItem } from "./AppItem";

export function AppItemOverlay({ item }: { item: GridItem }) {
  return (
    <Container>
      <Icon icon={item.icon} alt={item.name} />
      <Label>{item.name}</Label>
    </Container>
  );
}
