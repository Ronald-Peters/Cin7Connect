interface WarehouseStock {
  warehouseId: number;
  warehouse: {
    id: number;
    cin7LocationName: string;
  };
  available: string;
  onHand: string;
  onOrder: string;
}

interface WarehouseStockDisplayProps {
  availability: WarehouseStock[];
}

export function WarehouseStockDisplay({ availability }: WarehouseStockDisplayProps) {
  if (!availability.length) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="text-no-stock">
        No stock information
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="warehouse-stock-display">
      {availability.map((stock) => {
        const available = parseFloat(stock.available) || 0;
        const onHand = parseFloat(stock.onHand) || 0;
        const onOrder = parseFloat(stock.onOrder) || 0;

        return (
          <div key={stock.warehouseId} className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground truncate max-w-16" data-testid={`text-warehouse-name-${stock.warehouseId}`}>
              {stock.warehouse.cin7LocationName}
            </span>
            <div className="flex space-x-2">
              <span 
                className={`${
                  available > 50 ? "text-success" : 
                  available > 0 ? "text-warning" : 
                  "text-destructive"
                }`}
                data-testid={`text-available-${stock.warehouseId}`}
              >
                {available}
              </span>
              <span className="text-muted-foreground" data-testid={`text-onhand-${stock.warehouseId}`}>
                ({onHand})
              </span>
              <span 
                className={onOrder > 0 ? "text-success" : "text-muted-foreground"}
                data-testid={`text-onorder-${stock.warehouseId}`}
              >
                +{onOrder}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
