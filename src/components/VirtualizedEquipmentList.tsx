import { List, type RowComponentProps } from "react-window";
import type { Equipment } from "@/types";

interface RowProps {
  itemData: {
    items: Equipment[];
    renderItem: (equipment: Equipment, index: number) => React.ReactNode;
  };
}

function Row({ index, style, itemData }: RowComponentProps<RowProps>) {
  const equipment = itemData.items[index];
  if (!equipment) return null;
  return (
    <div style={style}>
      {itemData.renderItem(equipment, index)}
    </div>
  );
}

interface VirtualizedEquipmentListProps {
  items: Equipment[];
  height: number;
  width?: number | string;
  itemHeight?: number;
  renderItem: (equipment: Equipment, index: number) => React.ReactNode;
}

export function VirtualizedEquipmentList({
  items,
  height,
  width = "100%",
  itemHeight = 80,
  renderItem,
}: VirtualizedEquipmentListProps) {
  return (
    <div style={{ height, width, overflowY: "auto" }}>
      <List<RowProps>
        defaultHeight={height}
        rowCount={items.length}
        rowHeight={itemHeight}
        rowComponent={Row}
        rowProps={{
          itemData: { items, renderItem },
        }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
