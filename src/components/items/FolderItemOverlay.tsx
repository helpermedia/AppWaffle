import { Container } from "@/components/ui/Container";
import { Label } from "@/components/ui/Label";
import { FolderPreview, type GridFolder } from "./FolderItem";

export function FolderItemOverlay({ item }: { item: GridFolder }) {
  return (
    <Container>
      <FolderPreview apps={item.apps} />
      <Label>{item.name}</Label>
    </Container>
  );
}
